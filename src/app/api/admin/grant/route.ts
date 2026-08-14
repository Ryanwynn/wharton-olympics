import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { normalizeEmail, isEligible } from "@/lib/email";
import { prettifyLocalPart } from "@/lib/format";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grant admin or scorekeeper by email — the easy path for adding organizers who can
 * update scores live during the day. Works even before the person has signed in:
 * a placeholder user is created and pre-flagged, so the role is active on first login.
 */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const { email: rawEmail, role } = await readJson<{ email?: string; role?: "admin" | "scorekeeper" }>(req);
  if (!rawEmail || !role) return jsonError("Provide an email and a role.", 400);
  if (!["admin", "scorekeeper"].includes(role)) return jsonError("Role must be admin or scorekeeper.", 400);

  const email = normalizeEmail(rawEmail);
  if (!isEligible(email)) return jsonError("That isn't an eligible Penn email address.", 400);

  const col = role === "admin" ? "is_admin" : "is_scorekeeper";
  let user = await queryOne<any>(`SELECT id, email, display_name, is_admin, is_scorekeeper FROM users WHERE email = $1`, [email]);
  let created = false;
  if (!user) {
    user = await queryOne<any>(
      `INSERT INTO users (email, display_name, ${col}) VALUES ($1, $2, true)
       RETURNING id, email, display_name, is_admin, is_scorekeeper`,
      [email, prettifyLocalPart(email)]
    );
    created = true;
  } else {
    user = await queryOne<any>(
      `UPDATE users SET ${col} = true WHERE id = $1 RETURNING id, email, display_name, is_admin, is_scorekeeper`,
      [user.id]
    );
  }

  await writeAudit({ actorId: admin.id, action: `grant.${role}`, entityType: "user", entityId: user.id, after: { email, created } });
  return NextResponse.json({
    ok: true,
    created,
    user: { id: user.id, email: user.email, displayName: user.display_name, isAdmin: user.is_admin, isScorekeeper: user.is_scorekeeper },
  });
});
