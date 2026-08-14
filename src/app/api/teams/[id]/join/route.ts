import { NextResponse } from "next/server";
import { route, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinTeamById } from "@/lib/registration";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Join a team directly by id — no invite code (browse-and-join).
export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const tripped = await rateLimitAll([{ key: `write:user:${user.id}:m`, limit: 30, windowMs: MINUTE }]);
  if (tripped) return jsonError("You're going too fast. Try again in a moment.", 429);

  const result = await joinTeamById(user.id, params.id);
  await writeAudit({ actorId: user.id, action: "team.join", entityType: "team", entityId: params.id });
  return NextResponse.json({ ok: true, ...result });
});
