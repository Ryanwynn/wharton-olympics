import crypto from "node:crypto";
import { env } from "./env";

/** 6-digit numeric code via CSPRNG — never Math.random (§5.3). */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** HMAC-SHA256 with the server secret. We store this, never the plaintext code. */
export function hashCode(code: string): string {
  return crypto.createHmac("sha256", env.authSecret).update(code).digest("hex");
}

/** Constant-time comparison of two hex digests (§5.3). */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Opaque session token (sent to client) + its at-rest hash (stored in DB). */
export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHmac("sha256", env.authSecret).update(token).digest("hex");
}

/** Human-friendly team invite code: 6 chars, no ambiguous 0/O/1/I/L. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
