import { env } from "./env";

/**
 * Minimal Google OAuth 2.0 (Authorization Code) helper. No SDK: we build the
 * consent URL, exchange the code at Google's token endpoint over TLS (with the
 * client secret), and read the returned ID token. Because the ID token comes
 * directly from Google's token endpoint over a trusted channel, validating its
 * claims (iss / aud / exp / email_verified) is sufficient — no separate JWKS
 * signature check is required (per Google's guidance).
 */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

/** Base URL for redirects: configured APP_URL, else the request's own origin. */
export function appBaseUrl(req: Request): string {
  if (env.appUrl) return env.appUrl;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export function oauthRedirectUri(req: Request): string {
  return `${appBaseUrl(req)}/api/auth/google/callback`;
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH}?${p.toString()}`;
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name: string | null;
  sub: string;
}

export async function exchangeCodeForProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google response had no id_token.");

  const claims = decodeJwtPayload(data.id_token);
  const iss = String(claims.iss || "");
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") throw new Error("Bad token issuer.");
  if (claims.aud !== env.googleClientId) throw new Error("Bad token audience.");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) throw new Error("Google token expired.");

  return {
    email: String(claims.email || "").toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name ? String(claims.name) : null,
    sub: String(claims.sub || ""),
  };
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("Malformed JWT.");
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}
