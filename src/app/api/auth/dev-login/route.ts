import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { route, readJson, jsonError } from "@/lib/api";
import { normalizeEmail, isEligible } from "@/lib/email";
import { createSession, findOrCreateUser, SESSION_COOKIE } from "@/lib/auth";
import { googleConfigured } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEV-ONLY sign-in. Real auth is Google OAuth; this exists purely so the app is
 * usable locally without Google credentials. It is hard-disabled in production and
 * whenever Google is configured, so it can never be a backdoor in a deployment.
 */
export const POST = route(async (req: Request) => {
  if (env.isProd || googleConfigured()) return jsonError("Dev login is disabled.", 403);

  const { email: rawEmail, name } = await readJson<{ email?: string; name?: string }>(req);
  const email = normalizeEmail(rawEmail || "");
  if (!isEligible(email)) return jsonError("Use an allowed Penn/Wharton email address.", 400);

  const { user, needsProfile } = await findOrCreateUser(email, name ?? null);
  const privileged = Boolean(user.is_admin || user.is_scorekeeper);
  const { token, expiresAt } = await createSession(user.id, privileged, req.headers.get("user-agent"));

  const res = NextResponse.json({ ok: true, needsProfile });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return res;
});
