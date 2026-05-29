import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppRole } from '@prisma/client';


function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!secret || secret === 'dev-secret') {
    throw new Error('JWT_ACCESS_SECRET is required and must not use the development fallback');
  }
  return secret;
}

interface JwtPayload {
  sub: string;
  email: string;
  roles: AppRole[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getRequiredJwtSecret(),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    const platformRoles = payload.roles ?? [];
    return {
      id: payload.sub,
      email: payload.email,
      platformRoles,
      roles: platformRoles,
    };
  }
}
