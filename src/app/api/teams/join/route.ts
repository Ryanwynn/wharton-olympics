import { NextResponse } from "next/server";
import { route, readJson, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinTeam } from "@/lib/registration";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const tripped = await rateLimitAll([{ key: `write:user:${user.id}:m`, limit: 30, windowMs: MINUTE }]);
  if (tripped) return jsonError("You're going too fast. Try again in a moment.", 429);

  const { invite_code } = await readJson<{ invite_code?: string }>(req);
  if (!invite_code) return jsonError("Enter an invite code.", 400);
  const result = await joinTeam(user.id, invite_code);
  await writeAudit({ actorId: user.id, action: "team.join", entityType: "team", entityId: result.teamId });
  return NextResponse.json({ ok: true, ...result });
});
