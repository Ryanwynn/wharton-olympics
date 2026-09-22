import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Update the landing-page weather notice for the active season.
export const PATCH = route(async (req: Request) => {
  const admin = await requireAdmin();
  const season = await queryOne<{ id: string }>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) return jsonError("No active season.", 500);

  const b = await readJson<{ enabled?: boolean; level?: string; title?: string; body?: string }>(req);
  const enabled = Boolean(b.enabled);
  const level = ["info", "warning", "danger"].includes(b.level ?? "") ? b.level : "warning";
  const title = (b.title ?? "").trim().slice(0, 120) || null;
  const body = (b.body ?? "").trim().slice(0, 1000) || null;
  if (enabled && !body) return jsonError("Add a message before enabling the weather notice.", 400);

  await query(
    `UPDATE seasons SET weather_notice_enabled = $1, weather_notice_level = $2,
            weather_notice_title = $3, weather_notice_body = $4 WHERE id = $5`,
    [enabled, level, title, body, season.id]
  );
  await writeAudit({ actorId: admin.id, action: "weather.update", entityType: "season", entityId: season.id, after: { enabled, level } });
  revalidatePath("/");
  revalidatePath("/api/schedule");
  return NextResponse.json({ ok: true });
});
