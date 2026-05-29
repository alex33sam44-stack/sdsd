import { HealthController } from '../src/modules/health/health.controller';

describe('HealthController', () => {
  it('returns ok when the database probe succeeds', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
    } as any;
    const controller = new HealthController(prisma);

    const result = await controller.health();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(result.version).toBeDefined();
  });

  it('returns degraded when the database probe fails', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('db down')),
    } as any;
    const controller = new HealthController(prisma);

    const result = await controller.health();

    expect(result.status).toBe('degraded');
    expect(result.db).toBe('down');
    expect(result.dbError).toContain('db down');
  });
});
