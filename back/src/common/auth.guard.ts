import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}
