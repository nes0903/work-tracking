import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SESSION_COOKIE_NAME } from "@common/auth-context";
import { serializeCookie } from "@common/cookies";
import {
  consumeOAuthState,
  createOAuthState,
  createSession,
  deleteSession,
  SESSION_TTL_SECONDS,
} from "@libs/auth-db";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  formatUserName,
  loadLineWorksConfig,
} from "@libs/line-works-auth";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function safeRedirect(value: string | undefined): string {
  if (!value) {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function loginErrorRedirect(error: string) {
  return `/login?error=${encodeURIComponent(error)}`;
}

@Controller("api/auth")
export class AuthController {
  @Get("line-works/login")
  login(
    @Query("redirect") redirect: string | undefined,
    @Query("prompt") prompt: string | undefined,
    @Res() res: Response,
  ) {
    const config = loadLineWorksConfig();
    if (!config) {
      throw new HttpException(
        { ok: false, error: "LINE WORKS is not configured" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const state = createOAuthState(safeRedirect(redirect));
    const url = buildAuthorizeUrl(config, state, { forcePrompt: prompt !== "none" });
    res.redirect(url);
  }

  @Get("line-works/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const config = loadLineWorksConfig();
    if (!config) {
      throw new HttpException(
        { ok: false, error: "LINE WORKS is not configured" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (error) {
      return res.redirect(loginErrorRedirect(error));
    }

    if (!code || !state) {
      return res.redirect(loginErrorRedirect("invalid_request"));
    }

    const stateRecord = consumeOAuthState(state);
    if (!stateRecord) {
      return res.redirect(loginErrorRedirect("invalid_state"));
    }

    try {
      const token = await exchangeCodeForToken(config, code);
      const user = await fetchUserInfo(token.access_token);

      const userDomainId = user.domainId !== undefined ? String(user.domainId) : "";
      if (!userDomainId || userDomainId !== config.domainId) {
        return res.redirect(loginErrorRedirect("forbidden_domain"));
      }

      if (!user.userId) {
        return res.redirect(loginErrorRedirect("invalid_user"));
      }

      const session = createSession({
        userId: String(user.userId),
        userName: formatUserName(user),
        email: user.email ?? null,
        domainId: userDomainId,
      });

      res.setHeader(
        "Set-Cookie",
        serializeCookie(SESSION_COOKIE_NAME, session.id, {
          maxAge: SESSION_TTL_SECONDS,
          httpOnly: true,
          secure: isProduction(),
          sameSite: "Lax",
          path: "/",
        }),
      );

      return res.redirect(stateRecord.redirectTo || "/");
    } catch (err) {
      console.error("[auth] callback failed", err);
      return res.redirect(loginErrorRedirect("exchange_failed"));
    }
  }

  @Post("logout")
  logout(@Req() req: Request, @Res() res: Response) {
    if (req.auth) {
      deleteSession(req.auth.sessionId);
    }
    res.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, "", {
        maxAge: 0,
        httpOnly: true,
        secure: isProduction(),
        sameSite: "Lax",
        path: "/",
      }),
    );
    res.status(200).json({ ok: true });
  }

  @Get("me")
  me(@Req() req: Request) {
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return {
      ok: true,
      user: {
        userId: req.auth.userId,
        userName: req.auth.userName,
        email: req.auth.email,
        domainId: req.auth.domainId,
      },
    };
  }
}
