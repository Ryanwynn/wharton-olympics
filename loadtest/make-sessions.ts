/**
 * Seed N test users + valid sessions in the TARGET database, and a dedicated
 * capacity-limited event, so the k6 stampede can register as authenticated users
 * without doing 200 Google logins. Writes loadtest/tokens.csv (session tokens, one
 * per line) and loadtest/target.txt (the event id).
 *
 *   DATABASE_URL='<neon-branch-pooled-url>' \
 *   AUTH_SECRET='<the SAME secret as the deployment under test>' \
 *   N=200 CAP=50 npx tsx loadtest/make-sessions.ts
 *
 * IMPORTANT:
 *  • Point DATABASE_URL at a NEON BRANCH, never production.
 *  • AUTH_SECRET must match the deployment, or the session cookies won't validate.
 *  • Test rows are tagged (@loadtest.invalid, slug loadtest-stampede) — delete with
 *    loadtest/cleanup.sql afterwards.
 */
import "../db/_loadenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { query } from "../src/lib/db";
import { hashToken } from "../src/lib/crypto";

const N = Number(process.env.N || 200);
const CAP = Number(process.env.CAP || 50);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Refusing to run: set DATABASE_URL to your Neon BRANCH (never production).");
    process.exit(1);
  }

  const season = (await query<any>(`SELECT id FROM seasons WHERE is_active LIMIT 1`))[0];
  if (!season) {
    console.error("Target DB has no active season. Run your bootstrap/season setup first.");
    process.exit(1);
  }

  // Dedicated, tagged event: individual, published, signup open, fresh (no prior regs).
  let ev = (await query<any>(`SELECT id FROM events WHERE slug = 'loadtest-stampede'`))[0];
  if (!ev) {
    ev = (
      await query<any>(
        `INSERT INTO events (season_id, slug, name, entry_type, capacity, waitlist_enabled,
           signup_opens_at, signup_closes_at, starts_at, status)
         VALUES ($1,'loadtest-stampede','Load Test Stampede','individual',$2,true,
           now() - interval '1 hour', now() + interval '1 day', now() + interval '2 days','published')
         RETURNING id`,
        [season.id, CAP]
      )
    )[0];
  } else {
    await query(
      `UPDATE events SET capacity=$2, status='published',
         signup_opens_at = now() - interval '1 hour', signup_closes_at = now() + interval '1 day'
       WHERE id=$1`,
      [ev.id, CAP]
    );
    await query(`DELETE FROM registrations WHERE event_id=$1`, [ev.id]); // clean slate
  }

  const tokens: string[] = [];
  for (let i = 0; i < N; i++) {
    const email = `loadtest${i}@loadtest.invalid`;
    let u = (await query<any>(`SELECT id FROM users WHERE email=$1`, [email]))[0];
    if (!u) u = (await query<any>(`INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id`, [email, `Load Test ${i}`]))[0];
    const token = crypto.randomBytes(32).toString("base64url");
    await query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 day')`, [u.id, hashToken(token)]);
    tokens.push(token);
  }

  const dir = path.resolve(process.cwd(), "loadtest");
  fs.writeFileSync(path.join(dir, "tokens.csv"), tokens.join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "target.txt"), ev.id);
  console.log(`✓ Seeded ${N} sessions → loadtest/tokens.csv`);
  console.log(`✓ Target event (capacity ${CAP}): ${ev.id} → loadtest/target.txt`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
