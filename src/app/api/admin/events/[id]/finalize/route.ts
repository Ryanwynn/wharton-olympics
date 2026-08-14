import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route } from "@/lib/api";
import { requireScorekeeperFor } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark an event final (§6.5): flip status to 'complete' so its scores roll into the
 * public standings, then bust the CDN cache on-demand so the result shows up
 * immediately rather than up to 10s later (§9.1).
 */
export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireScorekeeperFor(params.id);
  const before = await queryOne<any>(`SELECT status FROM events WHERE id = $1`, [params.id]);
  if (!before) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  await query(`UPDATE events SET status = 'complete', updated_at = now() WHERE id = $1`, [params.id]);
  await writeAudit({
    actorId: user.id,
    action: "event.finalize",
    entityType: "event",
    entityId: params.id,
    before: { status: before.status },
    after: { status: "complete" },
  });

  // On-demand revalidation so the finalized result appears on the scoreboard now.
  revalidatePath("/");
  revalidatePath("/api/standings");
  revalidatePath("/api/schedule");

  return NextResponse.json({ ok: true, status: "complete" });
});
