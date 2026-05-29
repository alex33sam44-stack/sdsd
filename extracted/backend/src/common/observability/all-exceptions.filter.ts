import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import { logStructured, normalizeError } from "./structured-log";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") throw exception;

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { user?: any; tenantContext?: any }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId = req.requestId ?? null;
    logStructured(status >= 500 ? "error" : "warn", {
      event: "http.exception",
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      statusCode: status,
      tenantSlug: req.tenantContext?.currentTenant?.slug ?? req.user?.currentTenant?.slug ?? null,
      tenantId: req.tenantContext?.currentTenant?.id ?? req.user?.currentTenant?.id ?? null,
      userId: req.user?.id ?? null,
      error: normalizeError(exception),
    });

    if (res.headersSent) return;

    res.status(status).json({
      statusCode: status,
      message,
      requestId,
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
