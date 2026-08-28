import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { exchangeCodeForProfile, oauthRedirectUri, appBaseUrl } from "@/lib/oauth";
import { normalizeEmail, isAllowedDomain } from "@/lib/email";
import { createSession, findOrCreateUser, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "wso_oauth";

export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (reason: string, detail: string) => {
    // eslint-disable-next-line no-console
    console.error(`[google-callback] fail=${reason} :: ${detail} :: redirect_uri=${oauthRedirectUri(req)} base=${base}`);
    const res = NextResponse.redirect(new URL(`/signin?error=${reason}`, base));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  // Validate the CSRF state against the cookie set in /start.
  const raw = cookies().get(OAUTH_COOKIE)?.value;
  if (oauthError) return fail("oauth", `google returned error=${oauthError}`);
  if (!code) return fail("oauth", "no code param on callback");
  if (!state) return fail("oauth", "no state param on callback");
  if (!raw) return fail("oauth", "oauth state cookie missing — usually the browsing domain differs from APP_URL / the registered redirect URI (cookie was set on a different origin)");
  let saved: { state: string; next: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("oauth", "oauth cookie unparseable");
  }
  if (!saved.state || saved.state !== state) return fail("oauth", "state mismatch (CSRF check)");

  // Exchange the code and read the verified Google profile.
  let profile;
  try {
    profile = await exchangeCodeForProfile(code, oauthRedirectUri(req));
  } catch (e) {
    return fail("oauth", `token exchange / id_token validation failed: ${(e as Error).message}`);
  }
  if (!profile.email || !profile.emailVerified) return fail("unverified", `email=${profile.email} verified=${profile.emailVerified}`);

  const email = normalizeEmail(profile.email);
  if (!isAllowedDomain(email)) return fail("domain", `email domain not in allowlist: ${email}`);

  const { user, needsProfile } = await findOrCreateUser(email, profile.name);
  const privileged = Boolean(user.is_admin || user.is_scorekeeper);
  const { token, expiresAt } = await createSession(user.id, privileged, req.headers.get("user-agent"));

  // New users (no cluster yet) go through the short profile step on /signin;
  // returning users go straight to their destination.
  const dest = needsProfile ? `/signin?next=${encodeURIComponent(saved.next || "/")}` : saved.next || "/me";
  const res = NextResponse.redirect(new URL(dest, base));
  res.cookies.delete(OAUTH_COOKIE);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
