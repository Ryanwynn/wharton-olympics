import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireScorekeeperFor } from "@/lib/auth";
import { query } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScoreInput {
  registrationId: string;
  points: number;
  placement: number | null;
}

/**
 * Bulk upsert scores, idempotent (§8 PUT /api/admin/events/:id/scores). Re-sending
 * the same row is safe (ON CONFLICT updates in place), which is what lets the
 * scorekeeper's offline retry queue replay writes without creating duplicates.
 * cohort_id is derived server-side from the entrant (individual → their cluster;
 * team → captain's cluster) so points roll up correctly.
 */
export const PUT = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireScorekeeperFor(params.id);
  const body = await readJson<{ scores?: ScoreInput[] }>(req);
  const scores = body.scores ?? [];
  if (!Array.isArray(scores) || scores.length === 0) return jsonError("No scores to save.", 400);

  const saved: string[] = [];
  for (const s of scores) {
    if (!s.registrationId) continue;
    const points = Number.isFinite(s.points) ? s.points : 0;
    const placement = s.placement == null ? null : Math.trunc(s.placement);
    await query(
      `INSERT INTO scores (event_id, registration_id, cohort_id, points, placement, recorded_by)
       SELECT $1, r.id, COALESCE(u.cohort_id, cap.cohort_id), $3, $4, $5
         FROM registrations r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN teams t ON t.id = r.team_id
         LEFT JOIN users cap ON cap.id = t.captain_id
        WHERE r.id = $2 AND r.event_id = $1
       ON CONFLICT (event_id, registration_id)
       DO UPDATE SET points = EXCLUDED.points, placement = EXCLUDED.placement,
                     cohort_id = EXCLUDED.cohort_id, recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
      [params.id, s.registrationId, points, placement, user.id]
    );
    saved.push(s.registrationId);
  }

  await writeAudit({
    actorId: user.id,
    action: "score.upsert",
    entityType: "event",
    entityId: params.id,
    after: { count: saved.length, registrationIds: saved },
  });
  return NextResponse.json({ ok: true, saved });
});
