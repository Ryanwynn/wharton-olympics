/**
 * Seed ~500 users, 10 events (single day), the 4 cohorts, registrations, teams,
 * and scored/complete events so the public scoreboard is alive on first load.
 *
 * Times are anchored to "now" at seed time so the demo always has finished events
 * (standings), in-progress events ("happening now"), and open upcoming events
 * (registration). Idempotent: re-running is a no-op unless SEED_FORCE=1.
 */
import "./_loadenv";
import { query, queryOne, tx, getDb, type Queryable } from "../src/lib/db";
import { COHORTS } from "../src/lib/cohorts";
import { env } from "../src/lib/env";
import { generateInviteCode } from "../src/lib/crypto";

const FIRST = [
  "Ava", "Liam", "Maya", "Noah", "Sofia", "Ethan", "Priya", "Diego", "Chloe", "Omar",
  "Grace", "Lucas", "Aisha", "Marco", "Hannah", "Ravi", "Zoe", "Jamal", "Isla", "Kenji",
  "Nina", "Leo", "Fatima", "Owen", "Lena", "Andre", "Mei", "Caleb", "Sara", "Tariq",
  "Ruby", "Yuki", "Elias", "Nadia", "Theo", "Amara", "Victor", "Lucia", "Sam", "Wei",
];
const LAST = [
  "Patel", "Nguyen", "Garcia", "Kim", "Cohen", "Okafor", "Rossi", "Silva", "Chen", "Haddad",
  "Johnson", "Martinez", "Ali", "Novak", "Reyes", "Sato", "Brown", "Dubois", "Ivanov", "Mensah",
  "Park", "Rahman", "Fischer", "Lopez", "Adeyemi", "Costa", "Weber", "Khan", "Murphy", "Tanaka",
];
const DOMAINS = [
  "wharton.upenn.edu", "seas.upenn.edu", "sas.upenn.edu", "upenn.edu",
  "nursing.upenn.edu", "gse.upenn.edu", "design.upenn.edu", "law.upenn.edu",
];
const LOCATIONS = [
  "Penn Park — Field A", "Penn Park — Field B", "Pottruck Gym — Court 1",
  "Pottruck Gym — Court 2", "Shoemaker Green", "Hollenback Center",
  "Franklin Field", "College Green",
];

const H = 3600_000;
const now = Date.now();
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];
const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

const IND_POINTS = { "1": 15, "2": 10, "3": 6, participation: 2 };
const TEAM_POINTS = { "1": 25, "2": 15, "3": 10, participation: 4 };

interface EventDef {
  slug: string;
  name: string;
  description: string;
  entry: "individual" | "team";
  min?: number;
  max?: number;
  capacity: number;
  status: "draft" | "published" | "in_progress" | "complete";
  startOffsetH: number;
  durationH: number;
}

const EVENTS: EventDef[] = [
  { slug: "5k-fun-run", name: "5K Fun Run", description: "Chip-timed loop around Penn Park. All paces welcome.", entry: "individual", capacity: 150, status: "complete", startOffsetH: -4, durationH: 1 },
  { slug: "chess-blitz", name: "Chess Blitz", description: "5-minute blitz, Swiss format, five rounds.", entry: "individual", capacity: 24, status: "complete", startOffsetH: -3.5, durationH: 1.5 },
  { slug: "3v3-basketball", name: "3v3 Basketball", description: "Half-court, first to 21. Teams of 3–4.", entry: "team", min: 3, max: 4, capacity: 16, status: "complete", startOffsetH: -3, durationH: 2 },
  { slug: "spikeball-singles", name: "Spikeball Singles", description: "Round-robin into a single-elimination bracket.", entry: "individual", capacity: 32, status: "in_progress", startOffsetH: -0.5, durationH: 2 },
  { slug: "table-tennis", name: "Table Tennis", description: "Best of five, self-refereed group stage.", entry: "individual", capacity: 24, status: "in_progress", startOffsetH: -0.25, durationH: 2 },
  { slug: "dodgeball", name: "Dodgeball", description: "Six-a-side. Rolling matches until one team stands.", entry: "team", min: 6, max: 10, capacity: 12, status: "published", startOffsetH: 1.5, durationH: 2 },
  { slug: "sprint-relay", name: "4×100 Sprint Relay", description: "Cohort relay on the Franklin Field track.", entry: "individual", capacity: 40, status: "published", startOffsetH: 2.5, durationH: 1 },
  { slug: "cornhole", name: "Cornhole", description: "Bags. Double elimination. Bring your A-toss.", entry: "individual", capacity: 32, status: "published", startOffsetH: 3.5, durationH: 2 },
  { slug: "trivia-night", name: "Trivia Night", description: "Five rounds, teams of 2–4. Wharton lore included.", entry: "team", min: 2, max: 4, capacity: 20, status: "published", startOffsetH: 5, durationH: 2 },
  { slug: "sand-volleyball", name: "Sand Volleyball", description: "Coming soon — bracket TBA.", entry: "team", min: 4, max: 6, capacity: 10, status: "draft", startOffsetH: 4, durationH: 2 },
];

function pointsFor(schema: Record<string, number>, placement: number | null): number {
  if (placement && schema[String(placement)] != null) return schema[String(placement)];
  return schema.participation ?? 0;
}

async function alreadySeeded(): Promise<boolean> {
  const row = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM cohorts");
  return Number(row?.n ?? 0) > 0;
}

export async function seed(): Promise<void> {
  if (!process.env.SEED_FORCE && (await alreadySeeded())) {
    console.log("↳ already seeded (set SEED_FORCE=1 to reseed). Skipping.");
    return;
  }
  if (process.env.SEED_FORCE) {
    await query(
      `TRUNCATE scores, scorekeeper_events, team_members, teams, registrations,
        idempotency_keys, verification_codes, sessions, audit_log, events, users,
        cohorts, seasons RESTART IDENTITY CASCADE`
    );
  }

  await tx(async (t: Queryable) => {
    // Season
    const season = (
      await t.query<{ id: string }>(
        `INSERT INTO seasons (name, is_active) VALUES ($1, true) RETURNING id`,
        ["Wharton Student Olympics 2026"]
      )
    ).rows[0];

    // Cohorts
    const cohortIds: string[] = [];
    for (const c of COHORTS) {
      const row = (
        await t.query<{ id: string }>(
          `INSERT INTO cohorts (season_id, name, color_hex, icon_key, sort_order)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [season.id, c.name, c.colorHex, c.iconKey, c.sortOrder]
        )
      ).rows[0];
      cohortIds.push(row.id);
    }

    // Users — 500, round-robin cohorts, unique emails.
    const userIds: string[] = [];
    const userCohort: Record<string, string> = {};
    const used = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      let email = `${first}.${last}${i}`.toLowerCase() + "@" + pick(DOMAINS);
      while (used.has(email)) email = `${first}.${last}${i}${rand(9999)}`.toLowerCase() + "@" + pick(DOMAINS);
      used.add(email);
      const cohortId = cohortIds[i % cohortIds.length];
      const row = (
        await t.query<{ id: string }>(
          `INSERT INTO users (email, display_name, cohort_id) VALUES ($1,$2,$3) RETURNING id`,
          [email, `${first} ${last}`, cohortId]
        )
      ).rows[0];
      userIds.push(row.id);
      userCohort[row.id] = cohortId;
    }

    // Seed admins (from env). Create if absent; else flag admin.
    const adminIds: string[] = [];
    for (const email of env.seedAdminEmails) {
      const existing = await t.query<{ id: string }>(`SELECT id FROM users WHERE email=$1`, [email]);
      if (existing.rows[0]) {
        await t.query(`UPDATE users SET is_admin=true WHERE id=$1`, [existing.rows[0].id]);
        adminIds.push(existing.rows[0].id);
        userCohort[existing.rows[0].id] ??= cohortIds[0];
      } else {
        const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
        const row = (
          await t.query<{ id: string }>(
            `INSERT INTO users (email, display_name, cohort_id, is_admin) VALUES ($1,$2,$3,true) RETURNING id`,
            [email, name || "Admin", cohortIds[0]]
          )
        ).rows[0];
        adminIds.push(row.id);
        userIds.push(row.id);
        userCohort[row.id] = cohortIds[0];
      }
    }
    const recorder = adminIds[0] ?? userIds[0];

    // A few scorekeepers.
    const scorekeepers = shuffle(userIds).slice(0, 4);
    for (const id of scorekeepers) await t.query(`UPDATE users SET is_scorekeeper=true WHERE id=$1`, [id]);

    // Events
    const eventIds: Record<string, string> = {};
    for (let idx = 0; idx < EVENTS.length; idx++) {
      const e = EVENTS[idx];
      const startsAt = new Date(now + e.startOffsetH * H);
      const endsAt = new Date(now + (e.startOffsetH + e.durationH) * H);
      const opensAt = new Date(now - 24 * H);
      // Published events keep a wide signup window so registration stays open across a
      // long dev/demo session (times are anchored to seed-time and would otherwise drift
      // closed). Started/finished events have signup already closed.
      const closesAt = e.status === "published" ? new Date(now + 12 * H) : new Date(now - 1 * H);
      const schema = e.entry === "team" ? TEAM_POINTS : IND_POINTS;
      const row = (
        await t.query<{ id: string }>(
          `INSERT INTO events
            (season_id, slug, name, description, entry_type, min_team_size, max_team_size,
             capacity, waitlist_enabled, signup_opens_at, signup_closes_at, starts_at, ends_at,
             location, location_note, status, points_schema, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
          [
            season.id, e.slug, e.name, e.description, e.entry, e.min ?? null, e.max ?? null,
            e.capacity, opensAt.toISOString(), closesAt.toISOString(), startsAt.toISOString(),
            endsAt.toISOString(), pick(LOCATIONS), idx % 3 === 0 ? "Meet at the north gate" : null,
            e.status, JSON.stringify(schema), idx,
          ]
        )
      ).rows[0];
      eventIds[e.slug] = row.id;
    }

    // Live scores on the in-progress events (§ live score).
    await t.query(`UPDATE events SET live_score = $1 WHERE id = $2`, ["Games: Ava L. 2 – Diego M. 1", eventIds["spikeball-singles"]]);
    await t.query(`UPDATE events SET live_score = $1 WHERE id = $2`, ["Set 2: 19 – 17", eventIds["table-tennis"]]);

    // Assign the scorekeepers to a couple of live/complete events.
    for (const slug of ["spikeball-singles", "table-tennis", "5k-fun-run", "chess-blitz"]) {
      await t.query(
        `INSERT INTO scorekeeper_events (user_id, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [scorekeepers[rand(scorekeepers.length)], eventIds[slug]]
      );
    }

    // ── Individual events: registrations (+ scores for complete) ────────────────
    for (const e of EVENTS.filter((x) => x.entry === "individual" && x.status !== "draft")) {
      const eventId = eventIds[e.slug];
      const pool = shuffle(userIds);
      // Fill most of capacity for started/finished events; lighter for upcoming.
      const target =
        e.status === "published" ? Math.floor(e.capacity * (0.4 + Math.random() * 0.4)) : e.capacity;
      const regIds: { regId: string; userId: string }[] = [];
      let placed = 0;
      for (const userId of pool) {
        if (placed >= e.capacity) break;
        const r = (
          await t.query<{ id: string }>(
            `INSERT INTO registrations (event_id, user_id, status) VALUES ($1,$2,'registered') RETURNING id`,
            [eventId, userId]
          )
        ).rows[0];
        regIds.push({ regId: r.id, userId });
        placed++;
        if (placed >= target) break;
      }

      // Cornhole: overfill to demonstrate a waitlist.
      if (e.slug === "cornhole") {
        let wpos = 1;
        for (const userId of pool.slice(placed, placed + 8)) {
          await t.query(
            `INSERT INTO registrations (event_id, user_id, status, waitlist_pos) VALUES ($1,$2,'waitlisted',$3)`,
            [eventId, userId, wpos++]
          );
        }
      }

      if (e.status === "complete") {
        const ranked = shuffle(regIds);
        for (let i = 0; i < ranked.length; i++) {
          const placement = i + 1;
          const pts = pointsFor(e.entry === "team" ? TEAM_POINTS : IND_POINTS, placement <= 3 ? placement : null);
          await t.query(
            `INSERT INTO scores (event_id, registration_id, cohort_id, points, placement, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [eventId, ranked[i].regId, userCohort[ranked[i].userId], pts, placement, recorder]
          );
        }
      }
    }

    // ── Team events: teams (single-cohort), registrations (+ scores for complete) ─
    for (const e of EVENTS.filter((x) => x.entry === "team" && x.status !== "draft")) {
      const eventId = eventIds[e.slug];
      const teamCount = Math.min(e.capacity, e.status === "published" ? 4 + rand(4) : e.capacity);
      const usableCohorts = shuffle(cohortIds);
      const teamRegs: { regId: string; cohortId: string }[] = [];
      const takenUsers = new Set<string>();
      const usedNames = new Set<string>();
      for (let ti = 0; ti < teamCount; ti++) {
        const cohortId = usableCohorts[ti % usableCohorts.length];
        const members = shuffle(userIds.filter((u) => userCohort[u] === cohortId && !takenUsers.has(u))).slice(
          0,
          e.min! + rand((e.max ?? e.min!) - e.min! + 1)
        );
        if (members.length < e.min!) continue;
        members.forEach((m) => takenUsers.add(m));
        const captain = members[0];
        // Some upcoming teams stay 'forming' (below min → but we only create ≥min);
        // mark a couple upcoming teams 'forming' explicitly to show that state.
        const status =
          e.status === "published" && ti % 3 === 0 ? "forming" : e.status === "complete" ? "registered" : "registered";
        const suffixes = ["Crew", "Squad", "Union", "Collective", "Five", "Alliance", "Pack"];
        let teamName = `${pick(FIRST)}'s ${pick(suffixes)}`;
        while (usedNames.has(teamName)) teamName = `${pick(FIRST)}'s ${pick(suffixes)} ${rand(999)}`;
        usedNames.add(teamName);
        const team = (
          await t.query<{ id: string }>(
            `INSERT INTO teams (event_id, name, captain_id, invite_code, status)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [eventId, teamName, captain, generateInviteCode(), status]
          )
        ).rows[0];
        for (const m of members) {
          await t.query(`INSERT INTO team_members (team_id, user_id, event_id) VALUES ($1,$2,$3)`, [team.id, m, eventId]);
        }
        if (status !== "forming") {
          const reg = (
            await t.query<{ id: string }>(
              `INSERT INTO registrations (event_id, team_id, status) VALUES ($1,$2,'registered') RETURNING id`,
              [eventId, team.id]
            )
          ).rows[0];
          teamRegs.push({ regId: reg.id, cohortId });
        }
      }
      if (e.status === "complete") {
        const ranked = shuffle(teamRegs);
        for (let i = 0; i < ranked.length; i++) {
          const placement = i + 1;
          const pts = pointsFor(TEAM_POINTS, placement <= 3 ? placement : null);
          await t.query(
            `INSERT INTO scores (event_id, registration_id, cohort_id, points, placement, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [eventId, ranked[i].regId, ranked[i].cohortId, pts, placement, recorder]
          );
        }
      }
    }

    // Put each seed admin into a few OPEN events so /me and /events states are populated
    // without pushing an already-full event over capacity.
    for (const adminId of adminIds) {
      for (const slug of ["sprint-relay", "cornhole"]) {
        const eventId = eventIds[slug];
        const exists = await t.query(`SELECT 1 FROM registrations WHERE event_id=$1 AND user_id=$2 AND status<>'withdrawn'`, [eventId, adminId]);
        if (!exists.rows[0]) {
          await t.query(`INSERT INTO registrations (event_id, user_id, status) VALUES ($1,$2,'registered')`, [eventId, adminId]);
        }
      }
    }

    await t.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after)
       VALUES ($1,'seed','season',$2,$3)`,
      [recorder, season.id, JSON.stringify({ users: userIds.length, events: EVENTS.length })]
    );
  });

  // Demo tournament bracket for 3v3 Basketball, played through to a champion (§ brackets).
  const bball = await queryOne<{ id: string }>(
    `SELECT id FROM events WHERE slug = '3v3-basketball' AND season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)`
  );
  if (bball) {
    const { generateBracket, recordMatch } = await import("../src/lib/bracket");
    await generateBracket(bball.id);
    for (let guard = 0; guard < 100; guard++) {
      const playable = await query<{ id: string }>(
        `SELECT id FROM bracket_matches
          WHERE event_id = $1 AND entrant_a IS NOT NULL AND entrant_b IS NOT NULL AND status <> 'final'`,
        [bball.id]
      );
      if (playable.length === 0) break;
      for (const m of playable) {
        let sa = 15 + rand(11);
        const sb = 15 + rand(11);
        if (sa === sb) sa += 1;
        await recordMatch(bball.id, m.id, { scoreA: sa, scoreB: sb, status: "final" });
      }
    }
  }

  const counts = await query<{ t: string; n: string }>(
    `SELECT 'users' t, count(*)::text n FROM users
     UNION ALL SELECT 'events', count(*)::text FROM events
     UNION ALL SELECT 'registrations', count(*)::text FROM registrations
     UNION ALL SELECT 'teams', count(*)::text FROM teams
     UNION ALL SELECT 'scores', count(*)::text FROM scores`
  );
  console.log("✓ seed complete:", Object.fromEntries(counts.map((c) => [c.t, Number(c.n)])));
}

// Run when invoked directly (npm run db:seed)
const invokedDirectly = process.argv[1]?.includes("seed");
if (invokedDirectly) {
  seed()
    .then(async () => {
      await (await getDb()).close?.();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
