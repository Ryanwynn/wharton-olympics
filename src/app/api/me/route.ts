import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { route, readJson, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";
import { changeUserCohort } from "@/lib/registration";

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
  if (body.display_name === undefined && body.cohort_id === undefined) {
    return jsonError("Nothing to update.", 400);
  }

  if (body.display_name !== undefined) {
    const name = body.display_name.trim();
    if (name.length < 2 || name.length > 80) return jsonError("Enter a name between 2 and 80 characters.", 400);
    await query(`UPDATE users SET display_name = $1 WHERE id = $2`, [name, user.id]);
  }

  // Cluster change runs the cascade: leave mismatched teams, keep individual
  // registrations, and move individual-event points to the new cluster.
  let teamsLeft = 0;
  let cohortChanged = false;
  if (body.cohort_id !== undefined) {
    const result = await changeUserCohort(user.id, body.cohort_id);
    cohortChanged = result.changed;
    teamsLeft = result.teamsLeft;
  }

  const updated = await queryOne<any>(`SELECT id, display_name, cohort_id FROM users WHERE id = $1`, [user.id]);
  await writeAudit({ actorId: user.id, action: "update", entityType: "user", entityId: user.id, after: updated });

  if (cohortChanged) {
    revalidatePath("/");
    revalidatePath("/api/standings");
  }

  return NextResponse.json({
    ok: true,
    cohortChanged,
    teamsLeft,
    user: { id: updated.id, displayName: updated.display_name, cohortId: updated.cohort_id },
  });
});
