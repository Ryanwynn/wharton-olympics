import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Flip an event's live state: published → in_progress ("Go live") and back.
// (draft⇄published is handled by /publish; →complete by /finalize.)
const ALLOWED: Record<string, string[]> = {
  published: ["in_progress"],
  in_progress: ["published"],
};

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const ev = await queryOne<{ id: string; status: string }>(`SELECT id, status FROM events WHERE id = $1`, [params.id]);
  if (!ev) return jsonError("Event not found.", 404);

  const { status } = await readJson<{ status?: string }>(req);
  if (status !== "in_progress" && status !== "published") return jsonError("Invalid status.", 400);
  if (status === ev.status) return NextResponse.json({ ok: true, status }); // idempotent
  if (!ALLOWED[ev.status]?.includes(status)) {
    return jsonError(`Can't move a ${ev.status} event to ${status}. Publish it first, or finalize to end it.`, 409);
  }

  await query(`UPDATE events SET status = $1, updated_at = now() WHERE id = $2`, [status, params.id]);
  await writeAudit({ actorId: admin.id, action: "event.status", entityType: "event", entityId: params.id, before: { status: ev.status }, after: { status } });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true, status });
});
