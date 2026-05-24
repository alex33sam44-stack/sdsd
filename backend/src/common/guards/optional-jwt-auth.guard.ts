import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard, but never rejects the request. If a valid bearer token is
 * present, `req.user` is populated. Otherwise the request continues anonymously
 * with `req.user === null`.
 *
 * Used by endpoints that accept submissions from both signed-in and anonymous
 * visitors (e.g. public user-contributions intake).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<TUser = any>(_err: unknown, user: TUser | false): TUser {
    // Swallow auth errors and let anonymous traffic through.
    return (user || null) as TUser;
  }
}
