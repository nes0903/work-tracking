export const SESSION_COOKIE_NAME = "wt_session";

export interface AuthContext {
  sessionId: string;
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}
