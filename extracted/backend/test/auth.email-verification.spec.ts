import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/modules/auth/auth.service';
import { AppRole } from '@prisma/client';

describe('AuthService email verification', () => {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') } as any;
  const tenants = { resolveForUser: jest.fn() } as any;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_VERIFICATION_DELIVERY = 'log';
    process.env.EMAIL_VERIFICATION_EXPOSE_DEV_LINK = 'true';
    process.env.EMAIL_VERIFICATION_BASE_URL = 'http://localhost:4000/api/auth/verify-email';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    jest.clearAllMocks();
  });

  it('registers password users as unverified and does not issue login tokens', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'rider@example.com',
          profile: { id: 'profile-1' },
          roles: [{ role: AppRole.passenger }],
        }),
      },
      profile: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const auth = new AuthService(prisma, jwt, tenants);

    const result = await auth.register('rider@example.com', 'correct horse battery staple', 'Rider');

    expect(result.emailVerificationRequired).toBe(true);
    expect(result.verificationUrl).toContain('/api/auth/verify-email?token=');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        emailVerified: false,
        emailVerificationTokens: expect.objectContaining({ create: expect.any(Object) }),
      }),
    }));
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });


  it('treats SMTP as unavailable in production when SMTP_USER or SMTP_PASS is missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_VERIFICATION_DELIVERY = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'Mwasalat <no-reply@example.com>';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-2',
          email: 'new@example.com',
          profile: { id: 'profile-2' },
          roles: [{ role: AppRole.passenger }],
        }),
      },
      profile: { update: jest.fn().mockResolvedValue({}) },
    } as any;
    const auth = new AuthService(prisma, jwt, tenants);

    await expect(auth.register('new@example.com', 'correct horse battery staple', 'New Rider')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('blocks password login until email is verified', async () => {
    const passwordHash = await argon2.hash('correct horse battery staple');
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'rider@example.com',
          passwordHash,
          emailVerified: false,
          roles: [{ role: AppRole.passenger }],
        }),
      },
    } as any;
    const auth = new AuthService(prisma, jwt, tenants);

    await expect(auth.login('rider@example.com', 'correct horse battery staple')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
