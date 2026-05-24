import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import type { Request } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { LoginDto, RefreshDto, RegisterDto, ResendVerificationDto, VerifyEmailDto } from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { OptionalTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

// ─── OAuth token-exchange handoff ────────────────────────────────────────────
// We hand tokens from the OAuth callback to the SPA via short-lived HttpOnly
// cookies, NOT via the URL fragment. Putting tokens in the URL leaks them to:
//   - browser history,
//   - the Referer header on subsequent navigations,
//   - any analytics / error-reporting script that captures location.href.
// HttpOnly cookies are invisible to JS and to URL captures, the SPA reads them
// once via /auth/exchange (which clears them), and the 60-second TTL bounds
// the exposure window even if the redirect is interrupted.
const OAUTH_EXCHANGE_FLAG = 'oauth_exchange';
const OAUTH_ACCESS_COOKIE = 'oat_pending';
const OAUTH_REFRESH_COOKIE = 'ort_pending';
const OAUTH_HANDOFF_TTL_MS = 60_000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.displayName);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerificationEmail(dto.email);
  }

  @Get('verify-email')
  async verifyEmailLink(@Query('token') token: string, @Res() res: Response) {
    await this.auth.verifyEmail(token);
    const target = process.env.APP_REDIRECT_URI ?? '/auth';
    const url = new URL(target, 'http://localhost');
    url.searchParams.set('email_verified', '1');
    if (/^https?:\/\//i.test(target)) {
      res.redirect(url.toString());
      return;
    }
    res.redirect(`${url.pathname}${url.search}`);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard, OptionalTenantContextGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.me(user.id, req);
  }

  // ----- Google OAuth -----
  @Get('google')
  startGoogle(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.google.getAuthUrl(state));
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const cookieState = req.cookies?.oauth_state;
    res.clearCookie('oauth_state');
    if (!constantTimeStringEquals(cookieState, state)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    if (!code) throw new BadRequestException('Missing OAuth code');
    const profile = await this.google.exchangeCode(code);
    const tokens = await this.auth.loginOrCreateGoogle(profile.sub, profile.email, profile.name);
    const target = process.env.APP_REDIRECT_URI ?? '/';
    const cookieOpts = oauthHandoffCookieOptions();
    res.cookie(OAUTH_ACCESS_COOKIE, tokens.accessToken, cookieOpts);
    res.cookie(OAUTH_REFRESH_COOKIE, tokens.refreshToken, cookieOpts);
    res.redirect(redirectWithExchangeFlag(target));
  }

  // The SPA hits this endpoint immediately after the OAuth redirect lands on
  // the frontend. It returns the tokens stashed in the handoff cookies and
  // clears them so they cannot be replayed. Throttled to 5/min so this can
  // never be abused as an oracle: an attacker without the cookies gets 401.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('exchange')
  async exchangeOauthHandoff(@Req() req: Request, @Res() res: Response) {
    const accessToken = readNonEmptyCookie(req, OAUTH_ACCESS_COOKIE);
    const refreshToken = readNonEmptyCookie(req, OAUTH_REFRESH_COOKIE);
    // Always clear, even on failure, so a poisoned partial cookie cannot
    // linger and confuse the next attempt.
    const clearOpts = oauthHandoffClearCookieOptions();
    res.clearCookie(OAUTH_ACCESS_COOKIE, clearOpts);
    res.clearCookie(OAUTH_REFRESH_COOKIE, clearOpts);
    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException('No pending OAuth handoff');
    }
    res.json({ accessToken, refreshToken });
  }
}

function oauthHandoffCookieOptions(): CookieOptions {
  // path:'/' keeps the matcher robust against the global '/api' prefix so the
  // SPA's POST /api/auth/exchange request still carries the cookies. The
  // sensitive bits are httpOnly (no JS access) and the 60-second maxAge
  // (vanishes from the user's browser well before the access token even
  // reaches mid-life). sameSite:'strict' is safe here because the SPA
  // and the API live under the same registrable domain in production.
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: OAUTH_HANDOFF_TTL_MS,
    path: '/',
  };
}

function oauthHandoffClearCookieOptions(): CookieOptions {
  // Must mirror path / sameSite / secure of the original cookie so the
  // browser actually deletes it instead of silently keeping a duplicate.
  return {
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  };
}

function readNonEmptyCookie(req: Request, name: string): string | null {
  const value = req.cookies?.[name];
  if (typeof value !== 'string') return null;
  return value.length > 0 ? value : null;
}


function constantTimeStringEquals(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function redirectWithExchangeFlag(target: string): string {
  // We append a single, non-secret query flag so the SPA knows to call
  // /auth/exchange rather than treating the redirect as a normal nav. No
  // tokens or PII go in the URL, so the URL is safe to log / share.
  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target);
    url.searchParams.set(OAUTH_EXCHANGE_FLAG, '1');
    url.hash = '';
    return url.toString();
  }
  const safePath = target.startsWith('/') ? target : '/';
  const [pathWithoutHash] = safePath.split('#');
  const [pathOnly, existingQuery] = pathWithoutHash.split('?');
  const params = new URLSearchParams(existingQuery ?? '');
  params.set(OAUTH_EXCHANGE_FLAG, '1');
  return `${pathOnly}?${params.toString()}`;
}
