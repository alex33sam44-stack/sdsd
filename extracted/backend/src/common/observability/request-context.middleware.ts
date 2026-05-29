import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomRequestId } from "./structured-log";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    startedAt?: number;
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers["x-client-request-id"] ?? req.headers["x-request-id"];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const requestId = typeof headerValue === "string" && headerValue.trim()
      ? headerValue.trim()
      : randomRequestId();

    req.requestId = requestId;
    req.startedAt = Date.now();
    res.setHeader("x-request-id", requestId);
    res.setHeader("x-app-version", process.env.APP_VERSION ?? "dev");
    next();
  }
}
