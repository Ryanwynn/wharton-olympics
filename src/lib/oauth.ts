import crypto from "node:crypto";
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

// ── Signed OAuth state ────────────────────────────────────────────────────────
// The `state` we hand Google is self-verifying: `nonce.exp.next.sig`, signed with
// AUTH_SECRET. This lets the callback trust the state even if the browser dropped
// the short-lived `wso_oauth` cookie on the round-trip through Google (the cause
// of the intermittent "first attempt fails, second works" sign-in). The cookie,
// when present, still binds the flow to this browser (CSRF); when absent we fall
// back to the unforgeable signature rather than failing outright.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the round-trip

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function stateSig(payload: string): string {
  return b64url(crypto.createHmac("sha256", env.authSecret).update(payload).digest());
}

/** Build a signed state param and its matching cookie nonce. */
export function makeOAuthState(next: string): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${nonce}.${Date.now() + STATE_TTL_MS}.${b64url(next || "/")}`;
  return { state: `${payload}.${stateSig(payload)}`, nonce };
}

/** Verify a state param's signature + freshness. Returns null if tampered/expired. */
export function verifyOAuthState(state: string): { nonce: string; next: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [nonce, exp, nextB64, sig] = parts;
  const expected = stateSig(`${nonce}.${exp}.${nextB64}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return null;
  let next = "/";
  try {
    const decoded = b64urlDecode(nextB64);
    // Only allow app-relative paths (block open-redirects like //evil.com).
    if (decoded.startsWith("/") && !decoded.startsWith("//")) next = decoded;
  } catch {
    /* keep default */
  }
  return { nonce, next };
}

/**
 * Domain to scope the auth cookies to in production, so a cookie set on
 * www.<domain> is also sent to the apex (and vice-versa) — otherwise an apex↔www
 * hop silently drops the session/state cookie. Host-only (undefined) in dev.
 */
export function authCookieDomain(): string | undefined {
  if (!env.isProd || !env.appUrl) return undefined;
  let host: string;
  try {
    host = new URL(env.appUrl).hostname;
  } catch {
    return undefined;
  }
  if (!host || host === "localhost" || /^[0-9.]+$/.test(host)) return undefined;
  const labels = host.split(".");
  if (labels.length < 2) return undefined;
  return "." + labels.slice(-2).join("."); // e.g. .whartonolympics.com
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
