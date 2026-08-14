import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { route, readJson, jsonError, clientIp } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const cohort = user.cohortId
    ? await queryOne<any>(`SELECT id, name, icon_key, color_hex FROM cohorts WHERE id = $1`, [user.cohortId])
    : null;
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email, // the user's own email — fine to return to themselves
      displayName: user.displayName,
      cohortId: user.cohortId,
      isAdmin: user.isAdmin,
      isScorekeeper: user.isScorekeeper,
    },
    cohort: cohort ? { id: cohort.id, name: cohort.name, iconKey: cohort.icon_key, colorHex: cohort.color_hex } : null,
  });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();

  // Registration/profile writes per session (§5.4).
  const tripped = await rateLimitAll([{ key: `write:user:${user.id}:m`, limit: 30, windowMs: MINUTE }]);
  if (tripped) return jsonError("Slow down a moment and try again.", 429);

  const body = await readJson<{ display_name?: string; cohort_id?: string }>(req);
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.display_name !== undefined) {
    const name = body.display_name.trim();
    if (name.length < 2 || name.length > 80) return jsonError("Enter a name between 2 and 80 characters.", 400);
    params.push(name);
    updates.push(`display_name = $${params.length}`);
  }

  if (body.cohort_id !== undefined) {
    const cohort = await queryOne(
      `SELECT id FROM cohorts WHERE id = $1 AND season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)`,
      [body.cohort_id]
    );
    if (!cohort) return jsonError("Pick a valid cluster.", 400);
    params.push(body.cohort_id);
    updates.push(`cohort_id = $${params.length}`);
  }

  if (updates.length === 0) return jsonError("Nothing to update.", 400);

  params.push(user.id);
  const updated = await queryOne<any>(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, display_name, cohort_id`,
    params
  );
  await writeAudit({ actorId: user.id, action: "update", entityType: "user", entityId: user.id, after: updated });

  return NextResponse.json({
    ok: true,
    user: { id: updated.id, displayName: updated.display_name, cohortId: updated.cohort_id },
  });
});
