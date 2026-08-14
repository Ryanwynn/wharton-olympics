import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Toggle draft ⇄ published so a half-built event is never publicly visible (§6.4).
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const ev = await queryOne<any>(`SELECT id, status FROM events WHERE id = $1`, [params.id]);
  if (!ev) return jsonError("Event not found.", 404);
  const { publish } = await readJson<{ publish?: boolean }>(req);
  const next = publish === false ? "draft" : "published";
  if (!["draft", "published"].includes(ev.status) && ev.status !== next) {
    return jsonError(`Can't change a ${ev.status} event's visibility.`, 409);
  }
  await query(`UPDATE events SET status = $1, updated_at = now() WHERE id = $2`, [next, params.id]);
  await writeAudit({ actorId: admin.id, action: "event.publish", entityType: "event", entityId: params.id, before: { status: ev.status }, after: { status: next } });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true, status: next });
});
