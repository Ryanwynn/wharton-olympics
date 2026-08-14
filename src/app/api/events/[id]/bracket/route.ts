import { NextResponse } from "next/server";
import { getBracket } from "@/lib/bracket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, cacheable bracket (first name + last initial only). Polled for live updates.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const bracket = await getBracket(params.id, true);
  if (!bracket) return NextResponse.json({ error: "No bracket for this event." }, { status: 404 });
  return NextResponse.json(
    { bracket },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } }
  );
}
