import { queryOne } from "./db";

/**
 * Database-backed fixed-window rate limiting (§5.4). At this scale Postgres handles
 * it comfortably — no Redis unless load testing proves otherwise. The atomic
 * INSERT ... ON CONFLICT DO UPDATE increments and returns the new count in one
 * round-trip, so concurrent requests can't race past the limit.
 */
export interface RateResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: Date;
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowStart.toISOString()]
  );
  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= limit,
    count,
    limit,
    resetAt: new Date(windowStart.getTime() + windowMs),
  };
}

/** Check several windows; the request is allowed only if all pass. */
export async function rateLimitAll(
  checks: { key: string; limit: number; windowMs: number }[]
): Promise<RateResult | null> {
  for (const c of checks) {
    const r = await rateLimit(c.key, c.limit, c.windowMs);
    if (!r.allowed) return r; // first tripped limit
  }
  return null; // all passed
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
