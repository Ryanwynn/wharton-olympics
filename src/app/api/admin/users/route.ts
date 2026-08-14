import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { searchUsers } from "@/lib/adminQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.trim().length < 2) return NextResponse.json({ users: [] });
  return NextResponse.json({ users: await searchUsers(q.trim()) });
});
