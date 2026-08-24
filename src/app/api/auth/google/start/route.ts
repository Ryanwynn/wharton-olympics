import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { googleConfigured, googleAuthUrl, oauthRedirectUri, appBaseUrl } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "wso_oauth";

// Kick off "Sign in with Google": stash a CSRF state + intended destination in a
// short-lived cookie, then redirect to Google's consent screen.
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/signin?error=nogoogle", base));
  }
  const next = new URL(req.url).searchParams.get("next") || "/";
  const state = crypto.randomBytes(16).toString("hex");

  const res = NextResponse.redirect(googleAuthUrl(oauthRedirectUri(req), state));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  });
  return res;
}
