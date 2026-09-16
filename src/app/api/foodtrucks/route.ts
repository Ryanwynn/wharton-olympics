import { NextResponse } from "next/server";
import { getFoodTrucks } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, CDN-cached like the other live surfaces.
export async function GET() {
  const trucks = await getFoodTrucks();
  return NextResponse.json(
    { trucks },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
  );
}
