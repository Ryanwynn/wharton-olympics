import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withdrawIndividual } from "@/lib/registration";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const result = await withdrawIndividual(user.id, params.id);
  if (!result.already) {
    await writeAudit({ actorId: user.id, action: "withdraw", entityType: "event", entityId: params.id, after: result });
  }
  return NextResponse.json({ ok: true, ...result });
});
