import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { route, readJson, jsonError } from "@/lib/api";
import { requireScorekeeperFor } from "@/lib/auth";
import { generateBracket, getBracket, recordMatch } from "@/lib/bracket";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scorekeeper/admin bracket view (full names for identification).
export const GET = route(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireScorekeeperFor(params.id);
  const bracket = await getBracket(params.id, false);
  return NextResponse.json({ bracket });
});

// Generate (or regenerate) the bracket from the registered entrants.
export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireScorekeeperFor(params.id);
  const result = await generateBracket(params.id);
  await writeAudit({ actorId: user.id, action: "bracket.generate", entityType: "event", entityId: params.id, after: result });
  revalidatePath("/");
  revalidatePath(`/bracket/${params.id}`);
  return NextResponse.json({ ok: true, ...result });
});

// Record a match result; a final result auto-advances the winner.
export const PATCH = route(async (req: Request, { params }: { params: { id: string } }) => {
  const user = await requireScorekeeperFor(params.id);
  const body = await readJson<{ matchId?: string; scoreA?: number | null; scoreB?: number | null; winner?: string | null; status?: string }>(req);
  if (!body.matchId) return jsonError("matchId is required.", 400);
  const result = await recordMatch(params.id, body.matchId, {
    scoreA: body.scoreA,
    scoreB: body.scoreB,
    winner: body.winner,
    status: body.status,
  });
  await writeAudit({ actorId: user.id, action: "bracket.record", entityType: "event", entityId: params.id, after: { matchId: body.matchId, ...result } });
  revalidatePath("/");
  revalidatePath(`/bracket/${params.id}`);
  return NextResponse.json(result);
});
