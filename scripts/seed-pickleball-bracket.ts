/**
 * Seed the Pickleball doubles teams from the OSL roster and generate the bracket.
 *
 *   Local test:   npx tsx scripts/seed-pickleball-bracket.ts
 *   Production:    DATABASE_URL='postgres://…' npx tsx scripts/seed-pickleball-bracket.ts
 *
 * Idempotent: re-running skips teams that already exist. Players are created as
 * tagged accounts (…@pickleball.manual) so they can be found/removed later.
 */
import { query, queryOne } from "../src/lib/db";
import { generateInviteCode } from "../src/lib/crypto";
import { generateBracket } from "../src/lib/bracket";

const ROSTER: { cluster: string; team: number; player: string }[] = [
  { cluster: "Lions", team: 1, player: "Kristin Jones (KJ)" },
  { cluster: "Lions", team: 1, player: "Supriya Sahajwani" },
  { cluster: "Lions", team: 2, player: "Ribhu Nag" },
  { cluster: "Lions", team: 2, player: "Vishal Vardhineedi" },
  { cluster: "Dragons", team: 1, player: "Tomas Vonderheide" },
  { cluster: "Dragons", team: 1, player: "Zach Lieb" },
  { cluster: "Dragons", team: 2, player: "Shilpi Shah" },
  { cluster: "Dragons", team: 2, player: "Alec Kaplan" },
  { cluster: "Bees", team: 1, player: "Shawn Khetarpal" },
  { cluster: "Bees", team: 1, player: "Nikhil Mangtani" },
  { cluster: "Bees", team: 2, player: "Alex Yoo" },
  { cluster: "Bees", team: 2, player: "Alex Lustig" },
  { cluster: "Tigers", team: 1, player: "Brad Greenberg" },
  { cluster: "Tigers", team: 1, player: "Sid Marupudi" },
  { cluster: "Tigers", team: 2, player: "Ted Price" },
  { cluster: "Tigers", team: 2, player: "Amanda Sharng" },
];

const slugify = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

(async () => {
  const season = await queryOne<any>(`SELECT id FROM seasons WHERE is_active LIMIT 1`);
  if (!season) throw new Error("No active season.");

  // Use the existing Pickleball event; create one only if none exists (never touches pickleball-test).
  let ev = await queryOne<any>(
    `SELECT id, name FROM events
      WHERE season_id = $1 AND slug <> 'pickleball-test' AND name ILIKE '%pickleball%'
      ORDER BY sort_order ASC, name ASC LIMIT 1`,
    [season.id]
  );
  if (!ev) {
    ev = await queryOne<any>(
      `INSERT INTO events (season_id, slug, name, entry_type, min_team_size, max_team_size, max_teams_per_cohort,
         capacity, waitlist_enabled, status)
       VALUES ($1,'pickleball','Pickleball','team',2,2,2,16,true,'published') RETURNING id, name`,
      [season.id]
    );
    console.log(`Created event "${ev.name}"`);
  } else {
    await query(
      `UPDATE events SET max_teams_per_cohort = GREATEST(COALESCE(max_teams_per_cohort,1), 2),
              min_team_size = LEAST(COALESCE(min_team_size,2), 2), max_team_size = GREATEST(COALESCE(max_team_size,2), 2)
        WHERE id = $1`,
      [ev.id]
    );
    console.log(`Using existing event "${ev.name}" (${ev.id})`);
  }

  const cohorts: Record<string, string> = {};
  for (const c of await query<any>(`SELECT id, name FROM cohorts WHERE season_id = $1`, [season.id])) cohorts[c.name] = c.id;

  const groups = new Map<string, { cluster: string; team: number; players: string[] }>();
  for (const r of ROSTER) {
    const k = `${r.cluster}|${r.team}`;
    if (!groups.has(k)) groups.set(k, { cluster: r.cluster, team: r.team, players: [] });
    groups.get(k)!.players.push(r.player);
  }

  // Seed order = by team number, then cluster. Bracket seeding follows creation
  // order, so this interleaves clusters (Lions 1, Dragons 1, …, Lions 2, …) which
  // puts a cluster's two teams in opposite halves — they can only meet in the final.
  const clusterOrder = ["Lions", "Dragons", "Bees", "Tigers"];
  const ordered = [...groups.values()].sort(
    (a, b) => a.team - b.team || clusterOrder.indexOf(a.cluster) - clusterOrder.indexOf(b.cluster)
  );

  let created = 0;
  for (const g of ordered) {
    const cohortId = cohorts[g.cluster];
    if (!cohortId) throw new Error(`No cluster named ${g.cluster}`);
    const teamName = `${g.cluster} ${g.team}`;
    if (await queryOne<any>(`SELECT id FROM teams WHERE event_id = $1 AND lower(name) = lower($2)`, [ev.id, teamName])) {
      console.log(`skip existing team ${teamName}`);
      continue;
    }
    const userIds: string[] = [];
    for (const p of g.players) {
      const email = `${slugify(p)}@pickleball.manual`;
      let u = await queryOne<any>(`SELECT id FROM users WHERE email = $1`, [email]);
      if (!u) u = await queryOne<any>(`INSERT INTO users (email, display_name, cohort_id) VALUES ($1,$2,$3) RETURNING id`, [email, p, cohortId]);
      else await query(`UPDATE users SET cohort_id = $1 WHERE id = $2`, [cohortId, u.id]);
      userIds.push(u.id);
    }
    let code = generateInviteCode();
    for (let i = 0; i < 6; i++) {
      if (!(await queryOne<any>(`SELECT 1 FROM teams WHERE invite_code = $1`, [code]))) break;
      code = generateInviteCode();
    }
    const team = await queryOne<any>(
      `INSERT INTO teams (event_id, name, captain_id, cohort_id, invite_code, status)
       VALUES ($1,$2,$3,$4,$5,'registered') RETURNING id`,
      [ev.id, teamName, userIds[0], cohortId, code]
    );
    for (const uid of userIds) await query(`INSERT INTO team_members (team_id, user_id, event_id) VALUES ($1,$2,$3)`, [team.id, uid, ev.id]);
    await query(`INSERT INTO registrations (event_id, team_id, status) VALUES ($1,$2,'registered')`, [ev.id, team.id]);
    console.log(`created ${teamName}: ${g.players.join(" & ")}`);
    created++;
  }

  const gen = await generateBracket(ev.id);
  const regs = await queryOne<any>(`SELECT count(*)::int c FROM registrations WHERE event_id = $1 AND status = 'registered'`, [ev.id]);
  console.log(`\nDone. New teams: ${created}. Registered teams: ${regs.c}. Bracket: ${gen.rounds} rounds, ${gen.matches} matches. Event id: ${ev.id}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
