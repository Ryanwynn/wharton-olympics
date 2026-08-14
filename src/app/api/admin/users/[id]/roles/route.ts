import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grant/revoke roles. Every change is audit-logged (§3).
export const PATCH = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const before = await queryOne<any>(`SELECT id, is_admin, is_scorekeeper FROM users WHERE id = $1`, [params.id]);
  if (!before) return jsonError("User not found.", 404);

  const body = await readJson<{ is_admin?: boolean; is_scorekeeper?: boolean }>(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof body.is_admin === "boolean") {
    vals.push(body.is_admin);
    sets.push(`is_admin = $${vals.length}`);
  }
  if (typeof body.is_scorekeeper === "boolean") {
    vals.push(body.is_scorekeeper);
    sets.push(`is_scorekeeper = $${vals.length}`);
  }
  if (sets.length === 0) return jsonError("No role changes provided.", 400);

  // Guard: don't let an admin strip their own admin (avoid locking everyone out).
  if (body.is_admin === false && params.id === admin.id) {
    return jsonError("You can't remove your own admin role.", 400);
  }

  vals.push(params.id);
  const after = await queryOne<any>(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING id, is_admin, is_scorekeeper`, vals);
  await writeAudit({ actorId: admin.id, action: "user.roles", entityType: "user", entityId: params.id, before, after });
  return NextResponse.json({ ok: true, user: after });
});
