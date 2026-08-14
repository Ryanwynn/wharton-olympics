import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getRosterCsv } from "@/lib/adminQueries";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV export is admin-only and every export is audit-logged (§13).
export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const csv = await getRosterCsv(params.id);
  await writeAudit({ actorId: admin.id, action: "roster.export_csv", entityType: "event", entityId: params.id });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-${params.id}.csv"`,
    },
  });
});
