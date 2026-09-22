import { NextResponse } from "next/server";
import { getStandings, getSchedule, getLastUpdated, getFoodTrucks, getWeatherNotice } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single combined feed for the landing page (standings + schedule + food trucks +
 * weather notice). Folding the scoreboard's polls into one CDN-cached endpoint
 * means the origin — and therefore Neon — is hit once per cache window instead of
 * three times, which keeps compute usage (CU-hours) low. The CDN still serves
 * ~all viewer traffic from cache.
 */
export async function GET() {
  const [standings, events, lastUpdated, trucks, notice] = await Promise.all([
    getStandings(),
    getSchedule(),
    getLastUpdated(),
    getFoodTrucks(),
    getWeatherNotice(),
  ]);
  return NextResponse.json(
    { standings, events, lastUpdated, trucks, notice },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=90" } }
  );
}
