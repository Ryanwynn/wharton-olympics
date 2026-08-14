import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireScorekeeperFor } from "@/lib/auth";
import { getEventForScoring } from "@/lib/adminQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entrants + current scores for the scorekeeper surface (§6.5). Authorized to the
// event's assigned scorekeepers and admins; re-checked server-side every request.
export const GET = route(async (_req: Request, { params }: { params: { eventId: string } }) => {
  await requireScorekeeperFor(params.eventId);
  const event = await getEventForScoring(params.eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ event });
});
