import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { parseCookies } from "@common/cookies";
import { SESSION_COOKIE_NAME } from "@common/auth-context";
import { getSession } from "@libs/auth-db";

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      const row = getSession(token);
      if (row) {
        req.auth = {
          sessionId: row.id,
          userId: row.userId,
          userName: row.userName,
          email: row.email,
          domainId: row.domainId,
        };
      }
    }
    next();
  }
}
