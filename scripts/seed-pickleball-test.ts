/**
 * Local test fixture: a pickleball event with 8 registered teams (2 per cluster)
 * so the bracket can be generated and exercised. Tagged with slug 'pickleball-test'
 * for easy cleanup. Run: npx tsx scripts/seed-pickleball-test.ts
 */
import { query, queryOne } from "../src/lib/db";
import { createTeam, joinTeam } from "../src/lib/registration";

const SLUG = "pickleball-test";
const NAMES = ["Dinkers", "Smashers"]; // 2 teams per cluster

(async () => {
  const season = await queryOne<{ id: string }>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) throw new Error("No active season — run db:bootstrap first.");

  // Fresh start if it already exists.
  await query(`DELETE FROM events WHERE season_id = $1 AND slug = $2`, [season.id, SLUG]);

  const ev = await queryOne<{ id: string }>(
    `INSERT INTO events (season_id, slug, name, description, entry_type, min_team_size, max_team_size,
       max_teams_per_cohort, capacity, waitlist_enabled, signup_opens_at, signup_closes_at, starts_at, status)
     VALUES ($1,$2,'Pickleball (TEST)','Bracket test fixture','team',2,2,3,32,true,
       now() - interval '1 hour', now() + interval '7 days', now() + interval '1 day','published')
     RETURNING id`,
    [season.id, SLUG]
  );
  if (!ev) throw new Error("event insert failed");

  const cohorts = await query<{ id: string; name: string }>(
    `SELECT id, name FROM cohorts WHERE season_id = $1 ORDER BY sort_order`,
    [season.id]
  );

  let teamCount = 0;
  for (const c of cohorts) {
    // Distinct members for this cluster: 2 teams × 2 players = 4 users.
    const users = await query<{ id: string }>(
      `SELECT id FROM users WHERE cohort_id = $1 ORDER BY created_at LIMIT 4`,
      [c.id]
    );
    if (users.length < 4) {
      console.warn(`! ${c.name}: only ${users.length} users, skipping some teams`);
    }
    for (let t = 0; t < NAMES.length; t++) {
      const captain = users[t * 2]?.id;
      const partner = users[t * 2 + 1]?.id;
      if (!captain || !partner) continue;
      const { inviteCode } = await createTeam(captain, ev.id, `${c.name} ${NAMES[t]}`);
      await joinTeam(partner, inviteCode); // hits min size 2 -> team registers
      teamCount++;
    }
  }

  const registered = await queryOne<{ c: string }>(
    `SELECT count(*)::text c FROM registrations WHERE event_id = $1 AND status = 'registered'`,
    [ev.id]
  );
  console.log(`✓ Created 'Pickleball (TEST)' with ${teamCount} teams, ${registered?.c} registered entrants.`);
  console.log(`  Event id: ${ev.id}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
