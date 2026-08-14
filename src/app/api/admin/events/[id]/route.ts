import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE: Record<string, string> = {
  name: "text",
  description: "text",
  capacity: "int",
  waitlist_enabled: "bool",
  min_team_size: "int",
  max_team_size: "int",
  signup_opens_at: "ts",
  signup_closes_at: "ts",
  starts_at: "ts",
  ends_at: "ts",
  location: "text",
  location_note: "text",
  points_schema: "json",
  sort_order: "int",
};

export const PATCH = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const before = await queryOne<any>(`SELECT * FROM events WHERE id = $1`, [params.id]);
  if (!before) return jsonError("Event not found.", 404);

  const body = await readJson<Record<string, unknown>>(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, kind] of Object.entries(EDITABLE)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (kind === "json") v = v == null ? null : JSON.stringify(v);
    if (kind === "int" && v === "") v = null;
    vals.push(v);
    sets.push(`${key} = $${vals.length}`);
  }
  if (sets.length === 0) return jsonError("Nothing to update.", 400);
  vals.push(params.id);
  const updated = await queryOne<any>(
    `UPDATE events SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING id, slug, status`,
    vals
  );
  await writeAudit({ actorId: admin.id, action: "event.update", entityType: "event", entityId: params.id, before, after: updated });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true, event: updated });
});

export const DELETE = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const ev = await queryOne<any>(`SELECT id, name, status FROM events WHERE id = $1`, [params.id]);
  if (!ev) return jsonError("Event not found.", 404);
  await query(`DELETE FROM events WHERE id = $1`, [params.id]);
  await writeAudit({ actorId: admin.id, action: "event.delete", entityType: "event", entityId: params.id, before: ev });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true });
});
