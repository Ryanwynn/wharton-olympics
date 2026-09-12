import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  googleConfigured,
  googleAuthUrl,
  oauthRedirectUri,
  appBaseUrl,
  makeOAuthState,
  authCookieDomain,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "wso_oauth";

// Kick off "Sign in with Google": hand Google a SIGNED state (which also carries
// the intended destination) and drop a matching nonce cookie for CSRF binding,
// then redirect to the consent screen. The signature means the callback can still
// trust the state if this cookie is dropped on the round-trip.
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/signin?error=nogoogle", base));
  }
  const next = new URL(req.url).searchParams.get("next") || "/";
  const { state, nonce } = makeOAuthState(next);

  const res = NextResponse.redirect(googleAuthUrl(oauthRedirectUri(req), state));
  res.cookies.set(OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    domain: authCookieDomain(),
    maxAge: 600, // 10 minutes to complete the round-trip
  });
  return res;
}
