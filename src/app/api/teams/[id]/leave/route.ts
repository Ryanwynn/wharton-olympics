import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { leaveTeam } from "@/lib/registration";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const result = await leaveTeam(user.id, params.id);
  await writeAudit({ actorId: user.id, action: "team.leave", entityType: "team", entityId: params.id });
  return NextResponse.json({ ok: true, ...result });
});
