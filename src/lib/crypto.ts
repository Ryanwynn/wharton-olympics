import crypto from "node:crypto";
import { env } from "./env";

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
