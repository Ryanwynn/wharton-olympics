import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}
function cleanUrl(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

const FIELDS: Record<string, (v: unknown) => unknown> = {
  name: (v) => cleanText(v),
  location: (v) => cleanText(v),
  menu_text: (v) => cleanText(v),
  menu_url: (v) => cleanUrl(v),
  active: (v) => Boolean(v),
  sort_order: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
};

export const PATCH = route(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const before = await queryOne<any>(`SELECT * FROM food_trucks WHERE id = $1`, [params.id]);
  if (!before) return jsonError("Food truck not found.", 404);

  const body = await readJson<Record<string, unknown>>(req);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, norm] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;
    vals.push(norm(body[key]));
    sets.push(`${key} = $${vals.length}`);
  }
  if (sets.length === 0) return jsonError("Nothing to update.", 400);
  if ("name" in body && !cleanText(body.name)) return jsonError("A food truck needs a name.", 400);

  vals.push(params.id);
  const updated = await queryOne<any>(
    `UPDATE food_trucks SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING id, name`,
    vals
  );
  await writeAudit({ actorId: admin.id, action: "foodtruck.update", entityType: "food_truck", entityId: params.id, before, after: updated });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const t = await queryOne<any>(`SELECT id, name FROM food_trucks WHERE id = $1`, [params.id]);
  if (!t) return jsonError("Food truck not found.", 404);
  await query(`DELETE FROM food_trucks WHERE id = $1`, [params.id]);
  await writeAudit({ actorId: admin.id, action: "foodtruck.delete", entityType: "food_truck", entityId: params.id, before: t });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
});
