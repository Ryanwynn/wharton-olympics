import { NextResponse } from "next/server";
import { getSchedule, getLastUpdated, getWeatherNotice } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [events, lastUpdated, notice] = await Promise.all([getSchedule(), getLastUpdated(), getWeatherNotice()]);
  return NextResponse.json(
    { events, lastUpdated, notice },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } }
  );
}
