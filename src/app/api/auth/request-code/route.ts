import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { route, readJson, jsonError, clientIp } from "@/lib/api";
import { normalizeEmail, isEligible, getMailer } from "@/lib/email";
import { generateCode, hashCode } from "@/lib/crypto";
import { rateLimitAll, HOUR, DAY } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "If that's a valid Penn address, a code is on its way.";

export const POST = route(async (req) => {
  const { email: rawEmail } = await readJson<{ email?: string }>(req);
  const ip = clientIp(req);

  // Identical response whether or not the address is eligible — no enumeration (§5.1).
  const genericOk = (devCode?: string) =>
    NextResponse.json({ ok: true, message: GENERIC_MESSAGE, ...(devCode ? { devCode } : {}) });

  if (!rawEmail || typeof rawEmail !== "string") return genericOk();
  const email = normalizeEmail(rawEmail);

  // Rate limits per email + per IP (§5.4).
  const tripped = await rateLimitAll([
    { key: `code:email:${email}:h`, limit: 3, windowMs: HOUR },
    { key: `code:email:${email}:d`, limit: 10, windowMs: DAY },
    { key: `code:ip:${ip}:h`, limit: 10, windowMs: HOUR },
  ]);
  if (tripped) return jsonError("Too many code requests. Please wait and try again.", 429);

  if (!isEligible(email)) return genericOk();

  // Requesting a new code invalidates all prior outstanding codes for this address (§5.3).
  await query(`UPDATE verification_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL`, [email]);

  const code = generateCode();
  await query(
    `INSERT INTO verification_codes (email, code_hash, expires_at, request_ip)
     VALUES ($1, $2, now() + interval '10 minutes', $3)`,
    [email, hashCode(code), ip]
  );
  await getMailer().sendCode(email, code);

  // Dev-only: surface the code so the demo works without a real mailbox. Never in prod.
  const devCode = env.mailer === "console" && !env.isProd ? code : undefined;
  return genericOk(devCode);
});
