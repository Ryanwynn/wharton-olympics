import { NextResponse } from "next/server";
import { getStandings, getLastUpdated } from "@/lib/queries";

// Node runtime (PGlite/Postgres); never edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public standings. The CDN serves ~99% of hits from cache (§9.1): origin sees
 * roughly one query every 10s no matter how many people are watching. This single
 * header is what makes the 500-concurrent target trivial on a free tier.
 */
export async function GET() {
  const [standings, lastUpdated] = await Promise.all([getStandings(), getLastUpdated()]);
  return NextResponse.json(
    { standings, lastUpdated },
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60",
      },
    }
  );
}
