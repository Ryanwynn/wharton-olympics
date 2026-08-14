import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public event detail + results (§8: GET /api/events/:slug). The dynamic segment is
// named [id] to stay consistent with the register/withdraw/teams routes below it
// (Next requires one param name per path position); the value here is the slug.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const event = await getEventBySlug(params.id);
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(
    { event },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } }
  );
}
