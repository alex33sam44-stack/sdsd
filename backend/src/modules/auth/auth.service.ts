import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import net from 'node:net';
import tls from 'node:tls';
import { AppRole, type UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantResolverService } from '../../common/tenancy/tenant-resolver.service';
import type { Request } from 'express';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RegistrationResult {
  emailVerificationRequired: true;
  message: string;
  email: string;
  /** Present only outside production when SMTP is intentionally not configured. */
  verificationUrl?: string;
}

/**
 * Public, non-secret view of whether passwords/Google sign-in are usable
 * right now. Returned by GET /auth/registration-status so the frontend can
 * gracefully degrade instead of letting users hit a 503 on submit.
 */
export interface RegistrationStatus {
  passwordRegistrationEnabled: boolean;
  googleEnabled: boolean;
  /** "smtp" | "log" | other custom values from EMAIL_VERIFICATION_DELIVERY. */
  delivery: string;
  /** Empty when password registration is enabled. */
  missingSmtpFields: string[];
  /** Stable machine-readable codes describing why password reg is disabled. */
  reasons: Array<'smtp_unconfigured' | 'email_delivery_unconfigured'>;
}

type UserWithRoles = {
  id: string;
  email: string;
  passwordHash?: string | null;
  emailVerified?: boolean;
  roles: Array<Pick<UserRole, 'role'>>;
};

const REQUIRED_SMTP_FIELDS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'] as const;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenants: TenantResolverService,
  ) {}

  /**
   * Boot-time check: log a single, prominent warning if password
   * registration is going to fail every time. This makes the misconfiguration
   * visible in deploy/CI logs instead of only at the first /register call.
   */
  onModuleInit(): void {
    const status = this.getRegistrationStatus();
    if (!status.passwordRegistrationEnabled) {
      const detail = status.missingSmtpFields.length
        ? `missing env vars: ${status.missingSmtpFields.join(', ')}`
        : `EMAIL_VERIFICATION_DELIVERY="${status.delivery}" cannot deliver verification mail`;
      this.logger.warn(
        `Password registration is currently DISABLED (${detail}). ` +
          `Run "npm run setup:smtp" to configure SMTP, or set EMAIL_VERIFICATION_DELIVERY=log in non-production.`,
      );
    }
  }

  /**
   * Public, side-effect-free readiness view. Reads env only; safe to call on
   * every request and exposed via the controller.
   */
  getRegistrationStatus(): RegistrationStatus {
    const delivery = (process.env.EMAIL_VERIFICATION_DELIVERY ?? 'smtp').toLowerCase();
    const inProduction = process.env.NODE_ENV === 'production';
    const missingSmtp = REQUIRED_SMTP_FIELDS.filter((key) => !process.env[key]);
    const reasons: RegistrationStatus['reasons'] = [];

    let passwordRegistrationEnabled = false;
    if (delivery === 'smtp') {
      passwordRegistrationEnabled = missingSmtp.length === 0;
      if (!passwordRegistrationEnabled) reasons.push('smtp_unconfigured');
    } else if (delivery === 'log') {
      // "log" delivery is only acceptable outside production. In production
      // it would silently swallow verification mail, which is worse than
      // refusing registration outright.
      passwordRegistrationEnabled = !inProduction;
      if (!passwordRegistrationEnabled) reasons.push('email_delivery_unconfigured');
    } else {
      reasons.push('email_delivery_unconfigured');
    }

    return {
      passwordRegistrationEnabled,
      delivery,
      missingSmtpFields: passwordRegistrationEnabled ? [] : missingSmtp,
      reasons,
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    };
  }

  // ----- Registration -----
  async register(email: string, password: string, displayName?: string): Promise<RegistrationResult> {
    // Refuse before touching the DB if delivery is broken — saves a
    // half-created user record and gives the caller an actionable error code.
    const status = this.getRegistrationStatus();
    if (!status.passwordRegistrationEnabled) {
      throw this.buildEmailDeliveryError(status);
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await argon2.hash(password);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const ttlMinutes = this.emailVerificationTtlMinutes();
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        passwordHash,
        emailVerified: false,
        profile: { create: { id: randomUUID(), displayName: displayName ?? email.split('@')[0] } },
        roles: { create: { role: AppRole.passenger } },
        emailVerificationTokens: {
          create: {
            id: randomUUID(),
            tokenHash,
            expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
          },
        },
      },
      include: { roles: true, profile: true },
    });
    // profile.id must equal user.id; fix via update (cleaner than two-phase create)
    await this.prisma.profile.update({ where: { id: user.profile?.id ?? user.id }, data: { id: user.id } }).catch(() => undefined);
    const verificationUrl = this.emailVerificationUrl(rawToken);

    try {
      await this.sendVerificationEmail(email, verificationUrl, ttlMinutes);
    } catch (err) {
      // The verification mail could not be sent. Roll back so the user can
      // retry once SMTP is fixed instead of being permanently stuck with an
      // un-verifiable account that also blocks re-registration via 409.
      await this.prisma.user
        .delete({ where: { id: user.id } })
        .catch((cleanupErr: unknown) =>
          this.logger.warn(
            `Failed to roll back user ${user.id} after verification-email failure: ${
              cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
            }`,
          ),
        );
      throw err;
    }

    return {
      emailVerificationRequired: true,
      message: 'Account created. Verify your email before signing in.',
      email,
      ...(this.shouldExposeVerificationUrl() ? { verificationUrl } : {}),
    };
  }

  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.consumedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired email verification token');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: stored.userId }, data: { emailVerified: true } });
      await tx.emailVerificationToken.update({ where: { id: stored.id }, data: { consumedAt: new Date() } });
      await tx.emailVerificationToken.deleteMany({
        where: {
          userId: stored.userId,
          consumedAt: null,
          id: { not: stored.id },
        },
      });
    });
    return { verified: true };
  }

  async resendVerificationEmail(email: string): Promise<{ emailVerificationRequired: true; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (user.emailVerified) throw new ConflictException('Email already verified');
    const rawToken = randomBytes(32).toString('base64url');
    const ttlMinutes = this.emailVerificationTtlMinutes();
    await this.prisma.emailVerificationToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash: this.hash(rawToken),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });
    await this.sendVerificationEmail(email, this.emailVerificationUrl(rawToken), ttlMinutes);
    return { emailVerificationRequired: true, email };
  }

  // ----- Password login -----
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    }) as UserWithRoles | null;
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before signing in');
    return this.issueTokens(user.id, user.email, user.roles.map((r) => r.role));
  }

  // ----- Google sign-in (called by GoogleService after verifying the id_token) -----
  async loginOrCreateGoogle(googleSub: string, email: string, displayName?: string): Promise<TokenPair> {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleSub }, { email }] },
      include: { roles: true },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          googleSub,
          emailVerified: true,
          profile: { create: { id: randomUUID(), displayName: displayName ?? email.split('@')[0] } },
          roles: { create: { role: AppRole.passenger } },
        },
        include: { roles: true },
      });
    } else if (!user.googleSub || !user.emailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleSub, emailVerified: true },
        include: { roles: true },
      });
    }
    return this.issueTokens(user.id, user.email, user.roles.map((r) => r.role));
  }

  // ----- Refresh -----
  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotation: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.roles.map((r) => r.role),
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string, req?: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        roles: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const platformRoles = user.roles.map((r) => r.role);
    const tenantCtx = req
      ? await this.tenants.resolveForUser(req, user.id, platformRoles)
      : await this.tenants.resolveForUser({ headers: {} } as Request, user.id, platformRoles);

    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      platformRoles,
      roles: tenantCtx.legacyRoles,
      memberships: tenantCtx.memberships,
      currentTenant: tenantCtx.currentTenant,
      currentTenantRole: tenantCtx.currentTenantRole,
    };
  }

  // ----- Internals -----
  private async issueTokens(userId: string, email: string, roles: AppRole[]): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, roles },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hash(refreshToken);
    const days = parseInt((process.env.JWT_REFRESH_TTL ?? '30d').replace('d', ''), 10) || 30;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private emailVerificationTtlMinutes(): number {
    const raw = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES ?? '60');
    return Number.isFinite(raw) && raw >= 5 ? raw : 60;
  }

  private emailVerificationUrl(token: string): string {
    const base = process.env.EMAIL_VERIFICATION_BASE_URL || `${process.env.PUBLIC_URL ?? 'http://localhost:4000'}/api/auth/verify-email`;
    const url = new URL(base);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private shouldExposeVerificationUrl(): boolean {
    return process.env.NODE_ENV !== 'production' && process.env.EMAIL_VERIFICATION_EXPOSE_DEV_LINK === 'true';
  }

  private async sendVerificationEmail(email: string, verificationUrl: string, ttlMinutes: number): Promise<void> {
    const status = this.getRegistrationStatus();
    if (status.delivery === 'log' && process.env.NODE_ENV !== 'production') {
      console.warn(`[auth] Email verification link for ${email}: ${verificationUrl}`);
      return;
    }
    if (status.delivery !== 'smtp') throw this.buildEmailDeliveryError(status);
    if (!status.passwordRegistrationEnabled) {
      if (process.env.NODE_ENV === 'production') throw this.buildEmailDeliveryError(status);
      console.warn(`[auth] SMTP is not configured; verification link for ${email}: ${verificationUrl}`);
      return;
    }
    await sendSmtpMail({
      to: email,
      subject: 'Verify your Mwasalat account',
      text: `Verify your email to finish creating your account.\n\n${verificationUrl}\n\nThis link expires in ${ttlMinutes} minutes.`,
      html: `<p>Verify your email to finish creating your account.</p><p><a href="${escapeHtml(verificationUrl)}">Verify email</a></p><p>This link expires in ${ttlMinutes} minutes.</p>`,
    });
  }

  /**
   * Construct a 503 with a stable machine-readable code so the frontend can
   * render a precise message ("SMTP is not configured — please use Google
   * sign-in or contact the admin") instead of a generic "submit error".
   * The plain `message` field is preserved so existing error renderers keep
   * working unchanged.
   */
  private buildEmailDeliveryError(status: RegistrationStatus): ServiceUnavailableException {
    const errorCode = status.reasons[0] ?? 'email_delivery_unconfigured';
    const message =
      errorCode === 'smtp_unconfigured'
        ? 'SMTP is not configured; password registration is temporarily disabled.'
        : 'Email verification delivery is not configured; password registration is temporarily disabled.';
    return new ServiceUnavailableException({
      statusCode: 503,
      message,
      errorCode,
      missingFields: status.missingSmtpFields,
      hint: 'Use Google sign-in, or ask the operator to run "npm run setup:smtp".',
    });
  }

  private smtpConfigured(): boolean {
    return REQUIRED_SMTP_FIELDS.every((key) => Boolean(process.env[key]));
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

async function sendSmtpMail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const host = requireEnv('SMTP_HOST');
  const port = Number(requireEnv('SMTP_PORT'));
  const from = requireEnv('SMTP_FROM');
  const user = requireEnv('SMTP_USER');
  const pass = requireEnv('SMTP_PASS');
  const secure = String(process.env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
  const client = new SmtpClient(host, port, secure);
  await client.connect();
  try {
    await client.expect(220);
    await client.command(`EHLO ${process.env.SMTP_HELO_HOST ?? 'mwasalat.local'}`, 250);
    if (!secure && String(process.env.SMTP_STARTTLS ?? 'true').toLowerCase() !== 'false') {
      await client.command('STARTTLS', 220);
      client.upgradeToTls(host);
      await client.command(`EHLO ${process.env.SMTP_HELO_HOST ?? 'mwasalat.local'}`, 250);
    }
    await client.command('AUTH LOGIN', 334);
    await client.command(Buffer.from(user).toString('base64'), 334);
    await client.command(Buffer.from(pass).toString('base64'), 235);
    await client.command(`MAIL FROM:<${extractEmail(from)}>`, 250);
    await client.command(`RCPT TO:<${extractEmail(input.to)}>`, [250, 251]);
    await client.command('DATA', 354);
    await client.writeData(buildMimeMessage(from, input.to, input.subject, input.text, input.html));
    await client.expect(250);
    await client.command('QUIT', 221).catch(() => undefined);
  } finally {
    client.close();
  }
}

class SmtpClient {
  private socket?: net.Socket | tls.TLSSocket;
  private buffer = '';

  constructor(private readonly host: string, private readonly port: number, private readonly secure: boolean) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      this.socket = this.secure ? tls.connect({ port: this.port, host: this.host, servername: this.host }, resolve) : net.connect(this.port, this.host, resolve);
      this.socket.once('error', onError);
      this.socket.on('data', (chunk) => { this.buffer += chunk.toString('utf8'); });
    });
  }

  upgradeToTls(host: string): void {
    if (!this.socket) throw new Error('SMTP socket is not connected');
    this.socket.removeAllListeners('data');
    this.socket = tls.connect({ socket: this.socket, servername: host });
    this.buffer = '';
    this.socket.on('data', (chunk) => { this.buffer += chunk.toString('utf8'); });
  }

  async command(line: string, expected: number | number[]): Promise<string> {
    this.write(`${line}\r\n`);
    return this.expect(expected);
  }

  async writeData(message: string): Promise<void> {
    this.write(`${message.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`);
  }

  expect(expected: number | number[]): Promise<string> {
    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        const lines = this.buffer.split(/\r?\n/).filter(Boolean);
        const last = lines.at(-1) ?? '';
        const code = Number(last.slice(0, 3));
        if (Number.isFinite(code) && /^\d{3} /.test(last)) {
          const response = this.buffer;
          this.buffer = '';
          if (expectedCodes.includes(code)) resolve(response);
          else reject(new Error(`SMTP expected ${expectedCodes.join('/')} but got ${response.trim()}`));
          return;
        }
        if (Date.now() - startedAt > 10_000) {
          reject(new Error('SMTP response timed out'));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  close(): void {
    this.socket?.destroy();
  }

  private write(data: string): void {
    if (!this.socket) throw new Error('SMTP socket is not connected');
    this.socket.write(data);
  }
}

function buildMimeMessage(from: string, to: string, subject: string, text: string, html: string): string {
  const boundary = `mwasalat-${randomBytes(12).toString('hex')}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
  ].join('\r\n');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ServiceUnavailableException(`${name} is required for SMTP email verification`);
  return value;
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7e]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=` : value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
