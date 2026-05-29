import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { AuthService } from './auth.service';
import { GoogleService } from './google.service';
import { LoginDto, RefreshDto, RegisterDto, ResendVerificationDto, VerifyEmailDto } from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { OptionalTenantContextGuard } from '../../common/tenancy/tenant-context.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

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
    const fragment = new URLSearchParams();
    fragment.set('access_token', tokens.accessToken);
    fragment.set('refresh_token', tokens.refreshToken);
    res.redirect(redirectWithFragment(target, fragment));
  }
}


function constantTimeStringEquals(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function redirectWithFragment(target: string, fragment: URLSearchParams): string {
  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target);
    url.search = '';
    url.hash = fragment.toString();
    return url.toString();
  }
  const safePath = target.startsWith('/') ? target : '/';
  const [pathWithoutHash] = safePath.split('#');
  const [pathWithoutQuery] = pathWithoutHash.split('?');
  return `${pathWithoutQuery}#${fragment.toString()}`;
}
