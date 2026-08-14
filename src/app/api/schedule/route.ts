import { NextResponse } from "next/server";
import { getSchedule, getLastUpdated } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [events, lastUpdated] = await Promise.all([getSchedule(), getLastUpdated()]);
  return NextResponse.json(
    { events, lastUpdated },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } }
  );
}
