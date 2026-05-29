import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { logStructured, normalizeError } from './common/observability/structured-log';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.enableShutdownHooks();

  // helmet defaults are safe behind Caddy; disable CSP since we serve JSON only
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  // CORS: comma-separated list of exact origins (no trailing slash)
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
  });

  // We're behind Caddy — trust X-Forwarded-* so req.ip / secure detection works.
  const httpAdapter: any = app.getHttpAdapter().getInstance();
  if (httpAdapter && typeof httpAdapter.set === 'function') {
    httpAdapter.set('trust proxy', 1);
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  process.on('unhandledRejection', (reason) => {
    logStructured('error', { event: 'process.unhandledRejection', error: normalizeError(reason) });
  });
  process.on('uncaughtException', (error) => {
    logStructured('error', { event: 'process.uncaughtException', error: normalizeError(error) });
  });

  const port = Number(process.env.PORT ?? 4000);
  // Bind to 0.0.0.0 — required so the Docker network (Caddy container) can reach us.
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on 0.0.0.0:${port} (CORS origins: ${origins.join(', ') || 'none'})`, 'Bootstrap');
  logStructured('info', { event: 'app.boot', port, corsOrigins: origins, release: process.env.APP_VERSION ?? 'dev' });
}
bootstrap();

