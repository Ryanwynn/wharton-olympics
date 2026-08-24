import { cookies } from "next/headers";
import { query, queryOne } from "./db";
import { env } from "./env";
import { generateSessionToken, hashToken } from "./crypto";
import { prettifyLocalPart } from "./format";

export const SESSION_COOKIE = "wso_session";

/**
 * Find or create the user for a verified email, flag pre-authorized admins
 * (SEED_ADMIN_EMAILS), and touch last_seen. Shared by the Google OAuth callback
 * and the dev login. Assumes the email is already normalized and domain-checked.
 */
export async function findOrCreateUser(
  email: string,
  name: string | null
): Promise<{ user: any; needsProfile: boolean }> {
  let user = await queryOne<any>(`SELECT * FROM users WHERE email = $1`, [email]);
  if (!user) {
    user = await queryOne<any>(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *`,
      [email, name?.trim() || prettifyLocalPart(email)]
    );
  }
  if (env.seedAdminEmails.includes(email) && !user.is_admin) {
    user = await queryOne<any>(`UPDATE users SET is_admin = true WHERE id = $1 RETURNING *`, [user.id]);
  }
  await query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [user.id]);
  return { user, needsProfile: !user.cohort_id };
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  cohortId: string | null;
  isAdmin: boolean;
  isScorekeeper: boolean;
}

/**
 * Session lifetime (§5.5): participants 30 days (env), admins/scorekeepers step
 * down to 12 hours — the privileged surface is where short sessions buy something.
 */
export function sessionTtlMs(isPrivileged: boolean): number {
  return isPrivileged
    ? env.privilegedSessionHours * 3600_000
    : env.sessionTtlDays * 24 * 3600_000;
}

export async function createSession(
  userId: string,
  isPrivileged: boolean,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs(isPrivileged));
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4)`,
    [userId, tokenHash, expiresAt.toISOString(), userAgent ?? null]
  );
  return { token, expiresAt };
}

export function setSessionCookie(token: string, expiresAt: Date): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd, // lax on http://localhost in dev so the cookie sticks
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
  }
  cookies().delete(SESSION_COOKIE);
}

/**
 * Resolve the current user from the session cookie, or null. Anonymous visitors
 * (no cookie) never touch the database — this is what keeps the public scoreboard
 * auth-free and cheap (§5.5).
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<any>(
    `SELECT u.id, u.email, u.display_name, u.cohort_id, u.is_admin, u.is_scorekeeper,
            s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashToken(token)]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    // Expired — clean it up opportunistically.
    await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    cohortId: row.cohort_id,
    isAdmin: row.is_admin,
    isScorekeeper: row.is_scorekeeper,
  };
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Server-side gate: every admin/scorekeeper route re-checks the DB per request (§3). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) throw new AuthError(401, "Sign in required.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new AuthError(403, "Admin only.");
  return user;
}

/** Scorekeeper for a specific event, OR admin (admins score anything) (§3, §6.5). */
export async function requireScorekeeperFor(eventId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isAdmin) return user;
  if (!user.isScorekeeper) throw new AuthError(403, "Scorekeeper access required.");
  const assigned = await queryOne(
    `SELECT 1 FROM scorekeeper_events WHERE user_id = $1 AND event_id = $2`,
    [user.id, eventId]
  );
  if (!assigned) throw new AuthError(403, "You are not assigned to this event.");
  return user;
}
