import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { finalize } from "rxjs/operators";
import { logStructured } from "./structured-log";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: any; tenantContext?: any }>();
    const res = http.getResponse<Response>();
    const startedAt = req.startedAt ?? Date.now();
    const requestId = req.requestId ?? null;
    const method = req.method;
    const path = req.originalUrl ?? req.url;

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        const statusCode = res.statusCode ?? 200;
        const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
        logStructured(level, {
          event: "http.request",
          requestId,
          method,
          path,
          statusCode,
          durationMs,
          tenantSlug: req.tenantContext?.currentTenant?.slug ?? req.user?.currentTenant?.slug ?? null,
          tenantId: req.tenantContext?.currentTenant?.id ?? req.user?.currentTenant?.id ?? null,
          userId: req.user?.id ?? null,
          ip: req.ip ?? null,
        });
      }),
    );
  }
}
