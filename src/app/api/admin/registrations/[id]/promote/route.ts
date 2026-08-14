import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query, queryOne, tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manually promote a specific waitlisted registration to registered (§6.4).
export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const reg = await queryOne<any>(`SELECT id, event_id, status, team_id FROM registrations WHERE id = $1`, [params.id]);
  if (!reg) return jsonError("Registration not found.", 404);
  if (reg.status !== "waitlisted") return jsonError("That registration isn't on the waitlist.", 409);

  await tx(async (t) => {
    await t.query(`UPDATE registrations SET status = 'registered', waitlist_pos = NULL WHERE id = $1`, [params.id]);
    if (reg.team_id) await t.query(`UPDATE teams SET status = 'registered' WHERE id = $1`, [reg.team_id]);
    // Resequence the remaining waitlist.
    const rows = (await t.query<{ id: string }>(`SELECT id FROM registrations WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_pos ASC NULLS LAST, created_at ASC`, [reg.event_id])).rows;
    for (let i = 0; i < rows.length; i++) {
      await t.query(`UPDATE registrations SET waitlist_pos = $1 WHERE id = $2`, [i + 1, rows[i].id]);
    }
  });
  await writeAudit({ actorId: admin.id, action: "registration.promote", entityType: "registration", entityId: params.id });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
});
