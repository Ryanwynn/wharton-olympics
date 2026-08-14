import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { route, readJson, jsonError, clientIp } from "@/lib/api";
import { normalizeEmail } from "@/lib/email";
import { hashCode, safeEqualHex } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prettifyLocalPart } from "@/lib/format";
import { rateLimitAll, HOUR } from "@/lib/ratelimit";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email: rawEmail, code } = await readJson<{ email?: string; code?: string }>(req);
  const ip = clientIp(req);

  // Verification attempts per IP (§5.4).
  const tripped = await rateLimitAll([{ key: `verify:ip:${ip}:h`, limit: 20, windowMs: HOUR }]);
  if (tripped) return jsonError("Too many attempts. Please wait and try again.", 429);

  if (!rawEmail || !code) return jsonError("Enter the 6-digit code.", 400);
  const email = normalizeEmail(rawEmail);

  const vc = await queryOne<any>(
    `SELECT * FROM verification_codes
      WHERE email = $1 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const invalid = () => jsonError("That code is invalid or has expired.", 400);
  if (!vc) return invalid();

  // Max 5 attempts per code, then invalidate and force a new request (§5.3).
  if (vc.attempts >= 5) {
    await query(`UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, [vc.id]);
    return jsonError("Too many attempts on this code. Request a new one.", 429);
  }

  // Constant-time comparison of HMAC digests (§5.3).
  const ok = safeEqualHex(vc.code_hash, hashCode(String(code).trim()));
  if (!ok) {
    await query(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, [vc.id]);
    return invalid();
  }

  // Single use — consume on success.
  await query(`UPDATE verification_codes SET consumed_at = now() WHERE id = $1`, [vc.id]);

  // Find or create the user. New users get a placeholder name and no cohort yet;
  // the sign-in flow then routes them through the profile step.
  let user = await queryOne<any>(`SELECT * FROM users WHERE email = $1`, [email]);
  let needsProfile: boolean;
  if (!user) {
    user = await queryOne<any>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *`,
      [email, prettifyLocalPart(email)]
    );
    needsProfile = true;
  } else {
    needsProfile = !user.cohort_id;
  }

  // Pre-authorized admins (SEED_ADMIN_EMAILS at deploy, §3) are flagged on login,
  // so it works in production without running a seed script.
  if (env.seedAdminEmails.includes(email) && !user.is_admin) {
    user = await queryOne<any>(`UPDATE users SET is_admin = true WHERE id = $1 RETURNING *`, [user.id]);
  }
  await query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [user.id]);

  // Admins/scorekeepers get the 12-hour privileged session; participants get 30 days (§5.5).
  const privileged = Boolean(user.is_admin || user.is_scorekeeper);
  const { token, expiresAt } = await createSession(user.id, privileged, req.headers.get("user-agent"));
  const res = NextResponse.json({
    ok: true,
    needsProfile,
    user: {
      id: user.id,
      displayName: user.display_name,
      isAdmin: user.is_admin,
      isScorekeeper: user.is_scorekeeper,
    },
  });
  // Set on the response object directly (reliable inside route handlers).
  res.cookies.set({
    name: "wso_session",
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  void setSessionCookie; // (cookies() helper retained for Server Action callers)
  return res;
});
