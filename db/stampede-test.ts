/**
 * Acceptance criterion #2 (§9.3, §16): 300 simultaneous registrations for a
 * 50-slot event → exactly 50 registered, the rest cleanly waitlisted, zero
 * duplicates, zero oversell. Runs against an isolated PGlite dir so it never
 * touches the demo database or needs the dev server stopped.
 *
 * Note: PGlite is single-connection, so this exercises the capacity *logic*
 * (SELECT ... FOR UPDATE + count + insert in one transaction). On real Postgres
 * the row lock is what serializes true concurrent contenders — same code path.
 */
process.env.PGDATA_DIR = ".pgdata-test";
delete process.env.DATABASE_URL;

(async () => {
  const fs = await import("node:fs");
  fs.rmSync(".pgdata-test", { recursive: true, force: true });

  const { getDb, query } = await import("../src/lib/db");
  const { registerIndividual, createTeam, joinTeam } = await import("../src/lib/registration");
  await getDb();

  const season = (await query<any>(`INSERT INTO seasons (name, is_active) VALUES ('test', true) RETURNING id`))[0];

  // Four clusters; users get a cohort so team rules (cluster-bound) can be exercised.
  const cohortIds: string[] = [];
  for (const [name, icon] of [["Lions", "lion"], ["Dragons", "dragon"], ["Bees", "bee"], ["Tigers", "tiger"]]) {
    const c = (await query<any>(`INSERT INTO cohorts (season_id, name, icon_key, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`, [season.id, name, icon, cohortIds.length + 1]))[0];
    cohortIds.push(c.id);
  }

  // A 50-capacity individual event, signup currently open.
  const ev = (
    await query<any>(
      `INSERT INTO events (season_id, slug, name, entry_type, capacity, waitlist_enabled,
        signup_opens_at, signup_closes_at, starts_at, status)
       VALUES ($1,'stampede','Stampede','individual',50,true,
         now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', 'published')
       RETURNING id`,
      [season.id]
    )
  )[0];

  const users: string[] = [];
  for (let i = 0; i < 300; i++) {
    const u = (await query<any>(`INSERT INTO users (email, display_name, cohort_id) VALUES ($1,$2,$3) RETURNING id`, [`u${i}@upenn.edu`, `User ${i}`, cohortIds[i % 4]]))[0];
    users.push(u.id);
  }
  // Helpers to pick users by cluster (user i is in cohort i % 4).
  const inCohort = (mod: number) => users.filter((_, i) => i % 4 === mod);

  // Fire all 300 "simultaneously" with a per-user idempotency key.
  const t0 = Date.now();
  const results = await Promise.allSettled(users.map((uid) => registerIndividual(uid, ev.id, `idem-${uid}`)));
  const ms = Date.now() - t0;

  const rejected = results.filter((r) => r.status === "rejected");

  // Double-tap: same user + same idempotency key twice must NOT create two rows.
  const dt1 = await registerIndividual(users[0], ev.id, "idem-" + users[0]);
  const dt2 = await registerIndividual(users[0], ev.id, "idem-" + users[0]);

  const registered = Number((await query<any>(`SELECT count(*) c FROM registrations WHERE event_id=$1 AND status='registered'`, [ev.id]))[0].c);
  const waitlisted = Number((await query<any>(`SELECT count(*) c FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [ev.id]))[0].c);
  const dupes = (await query<any>(`SELECT user_id FROM registrations WHERE event_id=$1 AND status<>'withdrawn' GROUP BY user_id HAVING count(*)>1`, [ev.id])).length;
  const maxPos = Number((await query<any>(`SELECT COALESCE(max(waitlist_pos),0) m FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [ev.id]))[0].m);

  console.log("── Stampede (300 → 50-slot event) ──");
  console.log({ registered, waitlisted, dupes, maxWaitlistPos: maxPos, rejected: rejected.length, ms });
  console.log("double-tap same result:", JSON.stringify(dt1) === JSON.stringify(dt2), dt1);

  // ── Team min-size gating ──
  const tev = (
    await query<any>(
      `INSERT INTO events (season_id, slug, name, entry_type, min_team_size, max_team_size, capacity, waitlist_enabled,
        signup_opens_at, signup_closes_at, starts_at, status)
       VALUES ($1,'team-ev','Team Ev','team',3,5,2,true,
         now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours','published') RETURNING id`,
      [season.id]
    )
  )[0];
  const lions = inCohort(0); // Lions cluster users
  const dragons = inCohort(1); // Dragons cluster users
  const cap = await createTeam(lions[10], tev.id, "Lions Alpha");
  const capCountAfterCreate = Number((await query<any>(`SELECT count(*) c FROM registrations WHERE event_id=$1 AND status='registered'`, [tev.id]))[0].c);
  const code = cap.inviteCode;
  await joinTeam(lions[11], code);
  const capCountAt2 = Number((await query<any>(`SELECT count(*) c FROM registrations WHERE event_id=$1 AND status='registered'`, [tev.id]))[0].c);
  await joinTeam(lions[12], code); // now at min size 3 → should register (consume slot)
  const capCountAt3 = Number((await query<any>(`SELECT count(*) c FROM registrations WHERE event_id=$1 AND status='registered'`, [tev.id]))[0].c);
  const teamStatus = (await query<any>(`SELECT status FROM teams WHERE invite_code=$1`, [code]))[0].status;

  // Cluster rules: a different-cluster user can't join, and a second team for the
  // same cluster can't be created.
  let diffClusterBlocked = false;
  try {
    await joinTeam(dragons[0], code);
  } catch {
    diffClusterBlocked = true;
  }
  let secondTeamSameClusterBlocked = false;
  try {
    await createTeam(lions[20], tev.id, "Lions Beta");
  } catch {
    secondTeamSameClusterBlocked = true;
  }

  console.log("\n── Cluster-bound teams (min 3, cap 2 teams) ──");
  console.log({
    slotsAfter1member: capCountAfterCreate,
    slotsAfter2: capCountAt2,
    slotsAfter3: capCountAt3,
    teamStatusAt3: teamStatus,
    diffClusterBlocked,
    secondTeamSameClusterBlocked,
  });

  const pass =
    registered === 50 && waitlisted === 250 && dupes === 0 && maxPos === 250 &&
    JSON.stringify(dt1) === JSON.stringify(dt2) &&
    capCountAfterCreate === 0 && capCountAt2 === 0 && capCountAt3 === 1 && teamStatus === "registered" &&
    diffClusterBlocked && secondTeamSameClusterBlocked;

  console.log("\n" + (pass ? "✅ PASS — no oversell, waitlist correct, idempotent, cluster-bound teams correct" : "❌ FAIL"));
  // Hard-exit WITHOUT closing PGlite. Deleting the data dir and then calling close()
  // makes the WASM abort during shutdown (it flushes to a now-missing dir), which
  // taints the exit code even on PASS. Clean up the throwaway dir and exit directly.
  try {
    fs.rmSync(".pgdata-test", { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
