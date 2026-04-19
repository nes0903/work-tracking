export interface SessionUser {
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
}

export async function fetchCurrentUser(): Promise<SessionUser | null> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { ok: boolean; user?: SessionUser };
    if (!payload.ok || !payload.user) {
      return null;
    }
    return payload.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  } catch {
    // ignore network errors; client will redirect anyway
  }
  window.location.href = "/login";
}

export function loginHref(redirectTo?: string): string {
  const target = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : "";
  return `/api/auth/line-works/login${target}`;
}
