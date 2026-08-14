import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getAuditLog } from "@/lib/adminQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const entries = await getAuditLog({
    actor: url.searchParams.get("actor") || undefined,
    entity: url.searchParams.get("entity") || undefined,
  });
  return NextResponse.json({ entries });
});
