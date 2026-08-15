/**
 * Minimal PRODUCTION bootstrap. Unlike db/seed.ts (which creates ~500 fake users,
 * events, and scores for local demos), this creates only what a real deployment
 * needs: one active season, the four clusters, and the admin flags from
 * SEED_ADMIN_EMAILS. Idempotent — safe to run repeatedly.
 *
 * Run it against Neon once after deploying:
 *   DATABASE_URL='postgres://...pooler...neon.tech/db?sslmode=require' npm run db:bootstrap
 *
 * (Apply db/schema.neon.sql to the database first if you haven't.)
 */
import "./_loadenv";
import { query, queryOne, getDb } from "../src/lib/db";
import { COHORTS } from "../src/lib/cohorts";
import { prettifyLocalPart } from "../src/lib/format";
import { env } from "../src/lib/env";

async function main() {
  if (!env.databaseUrl) {
    console.warn("⚠  DATABASE_URL is not set — this will bootstrap the LOCAL PGlite DB, not Neon.");
    console.warn("   For production:  DATABASE_URL='postgres://...' npm run db:bootstrap\n");
  } else {
    console.log("→ bootstrapping the database at DATABASE_URL\n");
  }

  // 1. One active season.
  let season = await queryOne<{ id: string }>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) {
    season = await queryOne<{ id: string }>(
      `INSERT INTO seasons (name, is_active) VALUES ($1, true) RETURNING id`,
      ["Wharton Student Olympics 2026"]
    );
    console.log("✓ created active season");
  } else {
    console.log("• active season already exists");
  }

  // 2. The four clusters (§4).
  for (const c of COHORTS) {
    const exists = await queryOne(`SELECT id FROM cohorts WHERE season_id = $1 AND name = $2`, [season!.id, c.name]);
    if (exists) {
      // Keep color/icon/sort in sync with the code (e.g. an updated cluster color).
      await query(
        `UPDATE cohorts SET color_hex = $3, icon_key = $4, sort_order = $5 WHERE season_id = $1 AND name = $2`,
        [season!.id, c.name, c.colorHex, c.iconKey, c.sortOrder]
      );
      console.log(`• cluster ${c.name} exists — synced color/icon`);
    } else {
      await query(
        `INSERT INTO cohorts (season_id, name, color_hex, icon_key, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [season!.id, c.name, c.colorHex, c.iconKey, c.sortOrder]
      );
      console.log(`✓ created cluster ${c.name}`);
    }
  }

  // 3. Admins from SEED_ADMIN_EMAILS (create if they haven't signed in yet).
  if (env.seedAdminEmails.length === 0) {
    console.log("• no SEED_ADMIN_EMAILS set — skipping admin grants");
  }
  for (const email of env.seedAdminEmails) {
    const u = await queryOne<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
    if (u) {
      await query(`UPDATE users SET is_admin = true WHERE id = $1`, [u.id]);
      console.log(`✓ ${email} is now an admin`);
    } else {
      await query(`INSERT INTO users (email, display_name, is_admin) VALUES ($1, $2, true)`, [email, prettifyLocalPart(email)]);
      console.log(`✓ pre-registered admin ${email} (active on first sign-in)`);
    }
  }

  const counts = await query<{ t: string; n: string }>(
    `SELECT 'active_seasons' t, count(*)::text n FROM seasons WHERE is_active
     UNION ALL SELECT 'clusters', count(*)::text FROM cohorts
     UNION ALL SELECT 'admins', count(*)::text FROM users WHERE is_admin`
  );
  console.log("\n✓ bootstrap complete:", Object.fromEntries(counts.map((c) => [c.t, Number(c.n)])));
  await (await getDb()).close?.();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
