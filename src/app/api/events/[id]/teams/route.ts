import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
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

  const { name } = await readJson<{ name?: string }>(req);
  if (!name) return jsonError("Give your team a name.", 400);
  const result = await createTeam(user.id, params.id, name);
  await writeAudit({ actorId: user.id, action: "team.create", entityType: "team", entityId: result.teamId, after: { name, eventId: params.id } });
  return NextResponse.json({ ok: true, ...result });
});
