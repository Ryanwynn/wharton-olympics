import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { listAdminEvents } from "@/lib/adminQueries";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json({ events: await listAdminEvents() });
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin();
  const b = await readJson<any>(req);
  if (!b.name || !b.entry_type) return jsonError("Name and entry type are required.", 400);
  if (!["individual", "team"].includes(b.entry_type)) return jsonError("Invalid entry type.", 400);
  if (b.entry_type === "team" && (!b.min_team_size || !b.max_team_size || b.max_team_size < b.min_team_size)) {
    return jsonError("Team events need a valid min/max team size.", 400);
  }

  const season = await queryOne<{ id: string }>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) return jsonError("No active season.", 500);

  // Unique slug within the season.
  let slug = slugify(b.slug || b.name);
  for (let i = 1; ; i++) {
    const clash = await queryOne(`SELECT 1 FROM events WHERE season_id = $1 AND slug = $2`, [season.id, slug]);
    if (!clash) break;
    slug = `${slugify(b.name)}-${i}`;
  }

  const ev = await queryOne<any>(
    `INSERT INTO events (season_id, slug, name, description, entry_type, min_team_size, max_team_size,
       capacity, waitlist_enabled, signup_opens_at, signup_closes_at, starts_at, ends_at,
       location, location_note, points_schema, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft') RETURNING id, slug`,
    [
      season.id, slug, b.name, b.description ?? null, b.entry_type,
      b.entry_type === "team" ? b.min_team_size : null,
      b.entry_type === "team" ? b.max_team_size : null,
      b.capacity ?? null, b.waitlist_enabled ?? true,
      b.signup_opens_at ?? null, b.signup_closes_at ?? null, b.starts_at ?? null, b.ends_at ?? null,
      b.location ?? null, b.location_note ?? null,
      b.points_schema ? JSON.stringify(b.points_schema) : null,
    ]
  );
  await writeAudit({ actorId: admin.id, action: "event.create", entityType: "event", entityId: ev.id, after: { name: b.name, slug: ev.slug } });
  return NextResponse.json({ ok: true, id: ev.id, slug: ev.slug });
});
