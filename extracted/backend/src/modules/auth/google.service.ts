import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleService {
  private client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  /** Redirect URL the frontend should send users to. */
  getAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    });
  }

  /** Verify the authorization code returned by Google and resolve to an id_token payload. */
  async exchangeCode(code: string): Promise<{ sub: string; email: string; name?: string }> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) throw new UnauthorizedException('Google did not return id_token');
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('Invalid Google token');
    return { sub: payload.sub, email: payload.email, name: payload.name };
  }
}
