import { NextResponse } from "next/server";
import { route, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createTeam } from "@/lib/registration";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a team for a team event: the caller becomes captain and gets an invite code (§6.2).
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const tripped = await rateLimitAll([{ key: `write:user:${user.id}:m`, limit: 30, windowMs: MINUTE }]);
  if (tripped) return jsonError("You're going too fast. Try again in a moment.", 429);

  // The team name is generated server-side ("Dragons Rock Paper Scissors", "Lions Tug of War Team 2").
  const result = await createTeam(user.id, params.id);
  await writeAudit({ actorId: user.id, action: "team.create", entityType: "team", entityId: result.teamId, after: { name: result.name, eventId: params.id } });
  return NextResponse.json({ ok: true, ...result });
});
