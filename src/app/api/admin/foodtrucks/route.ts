import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { listAdminFoodTrucks } from "@/lib/adminQueries";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trim to null; normalize a menu URL to include a scheme. */
function cleanText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}
function cleanUrl(v: unknown): string | null {
  const s = cleanText(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json({ trucks: await listAdminFoodTrucks() });
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const b = await readJson<any>(req);
  const name = cleanText(b.name);
  if (!name) return jsonError("A food truck needs a name.", 400);

  const season = await queryOne<{ id: string }>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) return jsonError("No active season.", 500);

  const t = await queryOne<{ id: string }>(
    `INSERT INTO food_trucks (season_id, name, location, menu_text, menu_url, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      season.id,
      name,
      cleanText(b.location),
      cleanText(b.menu_text),
      cleanUrl(b.menu_url),
      b.active === false ? false : true,
      Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0,
    ]
  );
  await writeAudit({ actorId: admin.id, action: "foodtruck.create", entityType: "food_truck", entityId: t!.id, after: { name } });
  revalidatePath("/");
  return NextResponse.json({ ok: true, id: t!.id });
});
