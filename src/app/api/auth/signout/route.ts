import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { route } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ends the session immediately (§5.5). Posted from the header form, so redirect home.
export const POST = route(async (req) => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
});
