import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Assign or unassign a scorekeeper to a specific event (§6.4). Assigning also flags
// the user as a scorekeeper so the /score surface authorizes them.
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const { userId, assigned } = await readJson<{ userId?: string; assigned?: boolean }>(req);
  if (!userId) return jsonError("Pick a user.", 400);
  const user = await queryOne(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  if (!user) return jsonError("User not found.", 404);

  if (assigned === false) {
    await query(`DELETE FROM scorekeeper_events WHERE user_id = $1 AND event_id = $2`, [userId, params.id]);
    await writeAudit({ actorId: admin.id, action: "scorekeeper.unassign", entityType: "event", entityId: params.id, after: { userId } });
  } else {
    await query(`INSERT INTO scorekeeper_events (user_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, params.id]);
    await query(`UPDATE users SET is_scorekeeper = true WHERE id = $1`, [userId]);
    await writeAudit({ actorId: admin.id, action: "scorekeeper.assign", entityType: "event", entityId: params.id, after: { userId } });
  }
  return NextResponse.json({ ok: true });
});
