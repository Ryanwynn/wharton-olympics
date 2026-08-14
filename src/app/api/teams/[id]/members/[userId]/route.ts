import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { removeMember } from "@/lib/registration";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Captain removes a member (§6.2).
export const DELETE = route(async (_req: Request, { params }: { params: { id: string; userId: string } }) => {
  const user = await requireUser();
  const result = await removeMember(user.id, params.id, params.userId);
  await writeAudit({ actorId: user.id, action: "team.remove_member", entityType: "team", entityId: params.id, after: { removed: params.userId } });
  return NextResponse.json({ ok: true, ...result });
});
