import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manage an event's live state. Accepts { status?, autoGoLive? }:
//   status only toggles within {published, in_progress} ("Go live" / stop forcing);
//   autoGoLive turns the auto-at-start behavior on/off (used to pause a delayed event).
// (draft⇄published is handled by /publish; →complete by /finalize.)
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const ev = await queryOne<{ id: string; status: string; auto_go_live: boolean }>(
    `SELECT id, status, auto_go_live FROM events WHERE id = $1`,
    [params.id]
  );
  if (!ev) return jsonError("Event not found.", 404);

  const { status, autoGoLive } = await readJson<{ status?: string; autoGoLive?: boolean }>(req);
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (status !== undefined) {
    if (status !== "in_progress" && status !== "published") return jsonError("Invalid status.", 400);
    if (!["published", "in_progress"].includes(ev.status)) {
      return jsonError(`Can't change a ${ev.status} event's live state. Publish it first, or finalize to end it.`, 409);
    }
    vals.push(status);
    sets.push(`status = $${vals.length}`);
  }
  if (autoGoLive !== undefined) {
    vals.push(Boolean(autoGoLive));
    sets.push(`auto_go_live = $${vals.length}`);
  }
  if (sets.length === 0) return jsonError("Nothing to change.", 400);

  vals.push(params.id);
  await query(`UPDATE events SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
  await writeAudit({
    actorId: admin.id,
    action: "event.status",
    entityType: "event",
    entityId: params.id,
    before: { status: ev.status, autoGoLive: ev.auto_go_live },
    after: { status: status ?? ev.status, autoGoLive: autoGoLive ?? ev.auto_go_live },
  });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true });
});
