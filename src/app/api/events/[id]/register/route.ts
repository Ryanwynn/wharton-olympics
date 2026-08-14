import { NextResponse } from "next/server";
import { route, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { registerIndividual } from "@/lib/registration";
import { rateLimitAll, MINUTE } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const tripped = await rateLimitAll([{ key: `write:user:${user.id}:m`, limit: 30, windowMs: MINUTE }]);
  if (tripped) return jsonError("You're going too fast. Try again in a moment.", 429);

  // Idempotency-Key header — double-taps on mobile return the same result (§9.2).
  const idem = req.headers.get("idempotency-key") || undefined;
  const result = await registerIndividual(user.id, params.id, idem);
  if (!result.already) {
    await writeAudit({ actorId: user.id, action: "register", entityType: "event", entityId: params.id, after: result });
  }
  return NextResponse.json({ ok: true, ...result });
});
