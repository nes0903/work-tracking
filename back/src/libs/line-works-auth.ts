const AUTHORIZE_URL = "https://auth.worksmobile.com/oauth2/v2.0/authorize";
const TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const USERINFO_URL = "https://www.worksapis.com/v1.0/users/me";

export interface LineWorksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  domainId: string;
  scope: string;
  postLogoutRedirect: string;
}

export function loadLineWorksConfig(): LineWorksConfig | null {
  const clientId = process.env.LINE_WORKS_CLIENT_ID;
  const clientSecret = process.env.LINE_WORKS_CLIENT_SECRET;
  const redirectUri = process.env.LINE_WORKS_REDIRECT_URI;
  const domainId = process.env.LINE_WORKS_DOMAIN_ID;

  if (!clientId || !clientSecret || !redirectUri || !domainId) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    domainId,
    scope: process.env.LINE_WORKS_SCOPE || "user.read",
    postLogoutRedirect: process.env.POST_LOGOUT_REDIRECT || "/login",
  };
}

export function buildAuthorizeUrl(config: LineWorksConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export async function exchangeCodeForToken(
  config: LineWorksConfig,
  code: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as TokenResponse;
}

export interface LineWorksUser {
  userId?: string;
  email?: string;
  domainId?: number | string;
  userName?: { firstName?: string; lastName?: string };
}

export async function fetchUserInfo(accessToken: string): Promise<LineWorksUser> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`UserInfo failed (${response.status}): ${text}`);
  }

  return (await response.json()) as LineWorksUser;
}

export function formatUserName(user: LineWorksUser): string | null {
  const names = user.userName;
  if (!names) {
    return null;
  }
  const combined = `${names.lastName ?? ""}${names.firstName ?? ""}`.trim();
  return combined || null;
}
