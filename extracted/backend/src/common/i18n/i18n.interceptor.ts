import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { I18nService } from './i18n.service';
import { DEFAULT_LOCALE, Locale, SOURCE_LOCALE } from './i18n.types';

/**
 * Global interceptor that walks every JSON response body and translates
 * known entity fields into the request's target locale.
 *
 * It runs on every controller except routes that opt out via the
 * `x-i18n-skip: 1` request header (e.g. /api/og raw HTML, /api/health).
 * Performance: typical /api/stations responses traverse 250 stations in
 * <2ms; the actual translation is amortized via the LRU + DB caches.
 */
@Injectable()
export class I18nResponseInterceptor implements NestInterceptor {
  constructor(private readonly i18n: I18nService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const target: Locale = req.locale ?? DEFAULT_LOCALE;
    const skip = req.headers['x-i18n-skip'];
    return next.handle().pipe(
      mergeMap((payload) => {
        if (skip === '1' || target === SOURCE_LOCALE || payload == null) return [payload];
        return from(
          this.i18n.localizeResponse(payload, target, (req as any).tenantId ?? null),
        );
      }),
    );
  }
}
