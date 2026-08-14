import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson } from "@/lib/api";
import { requireScorekeeperFor } from "@/lib/auth";
import { query } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set the free-text live score for an in-progress event (e.g. "Lions 40 – Tigers 50").
 * Shown publicly in the "happening now" strip. Separate from final placement/points.
 */
export const PATCH = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireScorekeeperFor(params.id);
  const { live_score } = await readJson<{ live_score?: string }>(req);
  const value = (live_score ?? "").trim().slice(0, 120) || null;
  await query(`UPDATE events SET live_score = $1, updated_at = now() WHERE id = $2`, [value, params.id]);
  await writeAudit({ actorId: user.id, action: "event.live_score", entityType: "event", entityId: params.id, after: { live_score: value } });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true, liveScore: value });
});
