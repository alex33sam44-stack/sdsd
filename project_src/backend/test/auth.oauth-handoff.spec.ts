import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from '../src/modules/auth/auth.controller';

// ─────────────────────────────────────────────────────────────────────────────
// These tests pin the new OAuth handoff contract: tokens never appear in URLs,
// they live in short-lived HttpOnly cookies that the SPA reads exactly once.
// A regression here means refresh tokens leak into browser history again.
// ─────────────────────────────────────────────────────────────────────────────

type StubResponse = {
  cookies: Record<string, { value: string; opts: Record<string, unknown> }>;
  cleared: Record<string, Record<string, unknown>>;
  redirectedTo: string | null;
  jsonBody: unknown;
} & Pick<Response, 'cookie' | 'clearCookie' | 'redirect' | 'json'>;

function makeStubResponse(): StubResponse {
  const stub: any = {
    cookies: {},
    cleared: {},
    redirectedTo: null,
    jsonBody: undefined,
  };
  stub.cookie = jest.fn((name: string, value: string, opts: Record<string, unknown> = {}) => {
    stub.cookies[name] = { value, opts };
    return stub;
  });
  stub.clearCookie = jest.fn((name: string, opts: Record<string, unknown> = {}) => {
    stub.cleared[name] = opts;
    delete stub.cookies[name];
    return stub;
  });
  stub.redirect = jest.fn((target: string) => {
    stub.redirectedTo = target;
    return stub;
  });
  stub.json = jest.fn((body: unknown) => {
    stub.jsonBody = body;
    return stub;
  });
  return stub as StubResponse;
}

function makeStubRequest(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

describe('AuthController.googleCallback (handoff hardening)', () => {
  const FIXED_STATE = 'a'.repeat(32);
  const PROFILE = { sub: 'g-user-1', email: 'a@b.com', name: 'A' };
  const TOKENS = { accessToken: 'AT.signed.value', refreshToken: 'RT.signed.value' };

  let controller: AuthController;
  let authService: any;
  let googleService: any;
  const originalRedirect = process.env.APP_REDIRECT_URI;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    authService = { loginOrCreateGoogle: jest.fn().mockResolvedValue(TOKENS) };
    googleService = { exchangeCode: jest.fn().mockResolvedValue(PROFILE) };
    controller = new AuthController(authService, googleService);
    process.env.APP_REDIRECT_URI = 'https://app.example.com/auth/callback';
  });

  afterEach(() => {
    if (originalRedirect === undefined) delete process.env.APP_REDIRECT_URI;
    else process.env.APP_REDIRECT_URI = originalRedirect;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not expose tokens in the redirect URL (no fragment, no query)', async () => {
    const res = makeStubResponse();
    const req = makeStubRequest({ oauth_state: FIXED_STATE });

    await controller.googleCallback('auth-code', FIXED_STATE, req, res as any);

    expect(res.redirectedTo).not.toBeNull();
    const url = new URL(res.redirectedTo!);
    expect(url.hash).toBe(''); // ← critical: fragment must be empty
    expect(url.search).toBe('?oauth_exchange=1');
    expect(url.toString()).not.toContain(TOKENS.accessToken);
    expect(url.toString()).not.toContain(TOKENS.refreshToken);
    expect(url.searchParams.get('access_token')).toBeNull();
    expect(url.searchParams.get('refresh_token')).toBeNull();
  });

  it('writes tokens only into HttpOnly handoff cookies', async () => {
    process.env.NODE_ENV = 'production';
    const res = makeStubResponse();
    const req = makeStubRequest({ oauth_state: FIXED_STATE });

    await controller.googleCallback('auth-code', FIXED_STATE, req, res as any);

    expect(res.cookies.oat_pending?.value).toBe(TOKENS.accessToken);
    expect(res.cookies.ort_pending?.value).toBe(TOKENS.refreshToken);
    for (const name of ['oat_pending', 'ort_pending']) {
      const opts = res.cookies[name].opts;
      expect(opts.httpOnly).toBe(true);
      // sameSite=strict + secure (in prod) + 60s TTL is the security envelope.
      expect(opts.sameSite).toBe('strict');
      expect(opts.secure).toBe(true);
      expect(opts.maxAge).toBe(60_000);
    }
  });

  it('marks the redirect with ?oauth_exchange=1 so the SPA knows to call exchange', async () => {
    const res = makeStubResponse();
    await controller.googleCallback('code', FIXED_STATE, makeStubRequest({ oauth_state: FIXED_STATE }), res as any);
    const url = new URL(res.redirectedTo!);
    expect(url.searchParams.get('oauth_exchange')).toBe('1');
  });

  it('preserves any pre-existing query params on the redirect target', async () => {
    process.env.APP_REDIRECT_URI = 'https://app.example.com/auth/callback?invite=abc';
    const res = makeStubResponse();
    await controller.googleCallback('code', FIXED_STATE, makeStubRequest({ oauth_state: FIXED_STATE }), res as any);
    const url = new URL(res.redirectedTo!);
    expect(url.searchParams.get('invite')).toBe('abc');
    expect(url.searchParams.get('oauth_exchange')).toBe('1');
  });

  it('still rejects mismatched OAuth state (CSRF defence unchanged)', async () => {
    const res = makeStubResponse();
    const req = makeStubRequest({ oauth_state: 'not-the-same' });
    await expect(
      controller.googleCallback('code', FIXED_STATE, req, res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Must not have proceeded to set token cookies.
    expect(res.cookies.oat_pending).toBeUndefined();
    expect(res.cookies.ort_pending).toBeUndefined();
  });
});

describe('AuthController.exchangeOauthHandoff', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController({} as any, {} as any);
  });

  it('returns tokens from the handoff cookies and clears them', async () => {
    const res = makeStubResponse();
    const req = makeStubRequest({ oat_pending: 'AT.x', ort_pending: 'RT.x' });

    await controller.exchangeOauthHandoff(req, res as any);

    expect(res.jsonBody).toEqual({ accessToken: 'AT.x', refreshToken: 'RT.x' });
    // Cookies must be cleared on success so they cannot be replayed.
    expect(res.cleared.oat_pending).toBeDefined();
    expect(res.cleared.ort_pending).toBeDefined();
  });

  it('clears the cookies even when only one half is present (no replay)', async () => {
    const res = makeStubResponse();
    const req = makeStubRequest({ oat_pending: 'AT.partial' });
    await expect(
      controller.exchangeOauthHandoff(req, res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cleared.oat_pending).toBeDefined();
    expect(res.cleared.ort_pending).toBeDefined();
    // And no tokens leaked back to the client.
    expect(res.jsonBody).toBeUndefined();
  });

  it('rejects when no handoff cookies are present', async () => {
    const res = makeStubResponse();
    await expect(
      controller.exchangeOauthHandoff(makeStubRequest({}), res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when handoff cookie values are empty strings', async () => {
    const res = makeStubResponse();
    const req = makeStubRequest({ oat_pending: '', ort_pending: '' });
    await expect(
      controller.exchangeOauthHandoff(req, res as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
