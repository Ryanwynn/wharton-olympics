import { tx, query, queryOne, type Queryable } from "./db";
import { generateInviteCode } from "./crypto";

/**
 * Registration + capacity logic (§9.2). Capacity is enforced atomically: every
 * write locks the event row with SELECT ... FOR UPDATE, so contenders for the same
 * event serialize and it can never oversell — even under a stampede. Different
 * events proceed in parallel. Never check-count-then-insert in app code.
 */

export class RegError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface EventRow {
  id: string;
  entry_type: "individual" | "team";
  capacity: number | null;
  waitlist_enabled: boolean;
  status: string;
  signup_opens_at: string | null;
  signup_closes_at: string | null;
  min_team_size: number | null;
  max_team_size: number | null;
}

function assertSignupOpen(ev: EventRow) {
  const now = Date.now();
  if (ev.status !== "published") throw new RegError(409, "Registration isn't open for this event.");
  if (ev.signup_opens_at && new Date(ev.signup_opens_at).getTime() > now)
    throw new RegError(409, "Signups haven't opened yet.");
  if (ev.signup_closes_at && new Date(ev.signup_closes_at).getTime() < now)
    throw new RegError(409, "Signups are closed for this event.");
}

async function lockEvent(t: Queryable, eventId: string): Promise<EventRow> {
  const rows = (await t.query<EventRow>(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId])).rows;
  if (!rows[0]) throw new RegError(404, "Event not found.");
  return rows[0];
}

async function countRegistered(t: Queryable, eventId: string): Promise<number> {
  const r = (
    await t.query<{ c: string }>(
      `SELECT count(*)::text c FROM registrations WHERE event_id = $1 AND status = 'registered'`,
      [eventId]
    )
  ).rows[0];
  return Number(r.c);
}

export interface RegResult {
  status: "registered" | "waitlisted" | "withdrawn";
  waitlistPos?: number | null;
  already?: boolean;
}

// ── Individual registration ────────────────────────────────────────────────────
export async function registerIndividual(
  userId: string,
  eventId: string,
  idempotencyKey?: string
): Promise<RegResult> {
  return tx(async (t) => {
    if (idempotencyKey) {
      const prior = (
        await t.query<{ response: RegResult }>(
          `SELECT response FROM idempotency_keys WHERE key = $1 AND user_id = $2`,
          [idempotencyKey, userId]
        )
      ).rows[0];
      if (prior) return prior.response;
    }

    const ev = await lockEvent(t, eventId);
    if (ev.entry_type !== "individual") throw new RegError(400, "This is a team event — form or join a team.");
    assertSignupOpen(ev);

    const existing = (
      await t.query<{ status: RegResult["status"]; waitlist_pos: number | null }>(
        `SELECT status, waitlist_pos FROM registrations
          WHERE event_id = $1 AND user_id = $2 AND status <> 'withdrawn'`,
        [eventId, userId]
      )
    ).rows[0];

    let response: RegResult;
    if (existing) {
      response = { status: existing.status, waitlistPos: existing.waitlist_pos, already: true };
    } else {
      const count = await countRegistered(t, eventId);
      if (ev.capacity == null || count < ev.capacity) {
        await t.query(`INSERT INTO registrations (event_id, user_id, status) VALUES ($1, $2, 'registered')`, [eventId, userId]);
        response = { status: "registered" };
      } else if (ev.waitlist_enabled) {
        const pos = await nextWaitlistPos(t, eventId);
        await t.query(
          `INSERT INTO registrations (event_id, user_id, status, waitlist_pos) VALUES ($1, $2, 'waitlisted', $3)`,
          [eventId, userId, pos]
        );
        response = { status: "waitlisted", waitlistPos: pos };
      } else {
        throw new RegError(409, "This event is full.");
      }
    }

    if (idempotencyKey) {
      await t.query(
        `INSERT INTO idempotency_keys (key, user_id, response) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [idempotencyKey, userId, JSON.stringify(response)]
      );
    }
    return response;
  });
}

export async function withdrawIndividual(userId: string, eventId: string): Promise<RegResult> {
  return tx(async (t) => {
    await lockEvent(t, eventId);
    const reg = (
      await t.query<{ id: string; status: string }>(
        `SELECT id, status FROM registrations WHERE event_id = $1 AND user_id = $2 AND status <> 'withdrawn'`,
        [eventId, userId]
      )
    ).rows[0];
    if (!reg) return { status: "withdrawn", already: true };
    await t.query(`UPDATE registrations SET status = 'withdrawn', waitlist_pos = NULL WHERE id = $1`, [reg.id]);
    if (reg.status === "registered") await promoteNextWaitlisted(t, eventId);
    await resequenceWaitlist(t, eventId);
    return { status: "withdrawn" };
  });
}

// ── Teams ──────────────────────────────────────────────────────────────────────
export async function createTeam(userId: string, eventId: string, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) throw new RegError(400, "Team name must be 2–60 characters.");
  return tx(async (t) => {
    const ev = await lockEvent(t, eventId);
    if (ev.entry_type !== "team") throw new RegError(400, "This is an individual event.");
    assertSignupOpen(ev);

    const already = (
      await t.query(`SELECT 1 FROM team_members WHERE user_id = $1 AND event_id = $2`, [userId, eventId])
    ).rows[0];
    if (already) throw new RegError(409, "You're already on a team for this event.");

    const dup = (await t.query(`SELECT 1 FROM teams WHERE event_id = $1 AND lower(name) = lower($2)`, [eventId, clean])).rows[0];
    if (dup) throw new RegError(409, "A team with that name already exists for this event.");

    let invite = generateInviteCode();
    // Ensure global uniqueness of the invite code.
    for (let i = 0; i < 5; i++) {
      const clash = (await t.query(`SELECT 1 FROM teams WHERE invite_code = $1`, [invite])).rows[0];
      if (!clash) break;
      invite = generateInviteCode();
    }

    const team = (
      await t.query<{ id: string }>(
        `INSERT INTO teams (event_id, name, captain_id, invite_code, status)
         VALUES ($1, $2, $3, $4, 'forming') RETURNING id`,
        [eventId, clean, userId, invite]
      )
    ).rows[0];
    await t.query(`INSERT INTO team_members (team_id, user_id, event_id) VALUES ($1, $2, $3)`, [team.id, userId, eventId]);
    await reevaluateTeam(t, team.id);
    const status = await teamStatus(t, team.id);
    return { teamId: team.id, inviteCode: invite, status };
  });
}

export async function joinTeam(userId: string, inviteCode: string) {
  return tx(async (t) => {
    const team = (
      await t.query<{ id: string; event_id: string; name: string }>(
        `SELECT id, event_id, name FROM teams WHERE invite_code = $1`,
        [inviteCode.trim().toUpperCase()]
      )
    ).rows[0];
    if (!team) throw new RegError(404, "That invite code doesn't match a team.");

    const ev = await lockEvent(t, team.event_id);
    assertSignupOpen(ev);

    const already = (
      await t.query(`SELECT 1 FROM team_members WHERE user_id = $1 AND event_id = $2`, [userId, team.event_id])
    ).rows[0];
    if (already) throw new RegError(409, "You're already on a team for this event.");

    const size = await teamSize(t, team.id);
    if (ev.max_team_size != null && size >= ev.max_team_size) throw new RegError(409, "That team is already full.");

    await t.query(`INSERT INTO team_members (team_id, user_id, event_id) VALUES ($1, $2, $3)`, [team.id, userId, team.event_id]);
    await reevaluateTeam(t, team.id);
    return { teamId: team.id, name: team.name, status: await teamStatus(t, team.id) };
  });
}

/** Join a specific team by id — no invite code required (browse-and-join, § up­dated team flow). */
export async function joinTeamById(userId: string, teamId: string) {
  return tx(async (t) => {
    const team = (
      await t.query<{ id: string; event_id: string; name: string }>(`SELECT id, event_id, name FROM teams WHERE id = $1`, [teamId])
    ).rows[0];
    if (!team) throw new RegError(404, "That team no longer exists.");

    const ev = await lockEvent(t, team.event_id);
    assertSignupOpen(ev);

    const already = (
      await t.query(`SELECT 1 FROM team_members WHERE user_id = $1 AND event_id = $2`, [userId, team.event_id])
    ).rows[0];
    if (already) throw new RegError(409, "You're already on a team for this event.");

    const size = await teamSize(t, team.id);
    if (ev.max_team_size != null && size >= ev.max_team_size) throw new RegError(409, "That team is already full.");

    await t.query(`INSERT INTO team_members (team_id, user_id, event_id) VALUES ($1, $2, $3)`, [team.id, userId, team.event_id]);
    await reevaluateTeam(t, team.id);
    return { teamId: team.id, name: team.name, status: await teamStatus(t, team.id) };
  });
}

export async function leaveTeam(userId: string, teamId: string) {
  return tx(async (t) => {
    const team = (
      await t.query<{ id: string; event_id: string; captain_id: string }>(
        `SELECT id, event_id, captain_id FROM teams WHERE id = $1`,
        [teamId]
      )
    ).rows[0];
    if (!team) throw new RegError(404, "Team not found.");
    await lockEvent(t, team.event_id);

    const member = (await t.query(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId])).rows[0];
    if (!member) throw new RegError(400, "You're not on this team.");

    await t.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);

    const remaining = await teamMembers(t, teamId);
    if (remaining.length === 0) {
      // Last member left — withdraw any registration and delete the team.
      await t.query(`UPDATE registrations SET status = 'withdrawn', waitlist_pos = NULL WHERE team_id = $1 AND status <> 'withdrawn'`, [teamId]);
      await promoteNextWaitlisted(t, team.event_id);
      await resequenceWaitlist(t, team.event_id);
      await t.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
      return { deleted: true };
    }
    if (team.captain_id === userId) {
      // Reassign captaincy to the earliest remaining member.
      await t.query(`UPDATE teams SET captain_id = $1 WHERE id = $2`, [remaining[0], teamId]);
    }
    await reevaluateTeam(t, teamId);
    return { deleted: false, status: await teamStatus(t, teamId) };
  });
}

export async function removeMember(captainId: string, teamId: string, memberId: string) {
  return tx(async (t) => {
    const team = (
      await t.query<{ event_id: string; captain_id: string }>(`SELECT event_id, captain_id FROM teams WHERE id = $1`, [teamId])
    ).rows[0];
    if (!team) throw new RegError(404, "Team not found.");
    if (team.captain_id !== captainId) throw new RegError(403, "Only the captain can remove members.");
    if (memberId === captainId) throw new RegError(400, "Captains leave via 'leave team', which reassigns the captaincy.");
    await lockEvent(t, team.event_id);
    await t.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, memberId]);
    await reevaluateTeam(t, teamId);
    return { status: await teamStatus(t, teamId) };
  });
}

export async function renameTeam(captainId: string, teamId: string, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 60) throw new RegError(400, "Team name must be 2–60 characters.");
  const team = await queryOne<{ event_id: string; captain_id: string }>(`SELECT event_id, captain_id FROM teams WHERE id = $1`, [teamId]);
  if (!team) throw new RegError(404, "Team not found.");
  if (team.captain_id !== captainId) throw new RegError(403, "Only the captain can rename the team.");
  const dup = await queryOne(`SELECT 1 FROM teams WHERE event_id = $1 AND lower(name) = lower($2) AND id <> $3`, [team.event_id, clean, teamId]);
  if (dup) throw new RegError(409, "Another team already uses that name.");
  await query(`UPDATE teams SET name = $1 WHERE id = $2`, [clean, teamId]);
  return { ok: true };
}

/**
 * Re-evaluate a team after any membership change: at/above min size it claims a
 * capacity slot (registered, or waitlisted if full); below min it releases any
 * slot and returns to 'forming' — never consuming capacity while forming (§6.2).
 */
async function reevaluateTeam(t: Queryable, teamId: string) {
  const team = (
    await t.query<{ event_id: string; status: string }>(`SELECT event_id, status FROM teams WHERE id = $1`, [teamId])
  ).rows[0];
  const ev = (await t.query<EventRow>(`SELECT * FROM events WHERE id = $1`, [team.event_id])).rows[0];
  const size = await teamSize(t, teamId);
  const reg = (
    await t.query<{ id: string; status: string }>(
      `SELECT id, status FROM registrations WHERE team_id = $1 AND status <> 'withdrawn'`,
      [teamId]
    )
  ).rows[0];

  const min = ev.min_team_size ?? 1;
  if (size >= min) {
    if (reg) return; // already registered/waitlisted
    const count = await countRegistered(t, team.event_id);
    if (ev.capacity == null || count < ev.capacity) {
      await t.query(`INSERT INTO registrations (event_id, team_id, status) VALUES ($1, $2, 'registered')`, [team.event_id, teamId]);
      await t.query(`UPDATE teams SET status = 'registered' WHERE id = $1`, [teamId]);
    } else if (ev.waitlist_enabled) {
      const pos = await nextWaitlistPos(t, team.event_id);
      await t.query(`INSERT INTO registrations (event_id, team_id, status, waitlist_pos) VALUES ($1, $2, 'waitlisted', $3)`, [team.event_id, teamId, pos]);
      await t.query(`UPDATE teams SET status = 'waitlisted' WHERE id = $1`, [teamId]);
    } else {
      // At min size but event full with no waitlist — stays forming, no slot taken.
      await t.query(`UPDATE teams SET status = 'forming' WHERE id = $1`, [teamId]);
    }
  } else {
    if (reg) {
      await t.query(`UPDATE registrations SET status = 'withdrawn', waitlist_pos = NULL WHERE id = $1`, [reg.id]);
      if (reg.status === "registered") await promoteNextWaitlisted(t, team.event_id);
      await resequenceWaitlist(t, team.event_id);
    }
    await t.query(`UPDATE teams SET status = 'forming' WHERE id = $1`, [teamId]);
  }
}

// ── Waitlist helpers ─────────────────────────────────────────────────────────
async function nextWaitlistPos(t: Queryable, eventId: string): Promise<number> {
  const r = (
    await t.query<{ p: string }>(
      `SELECT COALESCE(MAX(waitlist_pos), 0) + 1 AS p FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
      [eventId]
    )
  ).rows[0];
  return Number(r.p);
}

/** Promote the earliest waitlisted entrant if a registered slot is free. */
export async function promoteNextWaitlisted(t: Queryable, eventId: string) {
  const ev = (await t.query<EventRow>(`SELECT * FROM events WHERE id = $1`, [eventId])).rows[0];
  if (ev.capacity == null) return;
  const count = await countRegistered(t, eventId);
  if (count >= ev.capacity) return;
  const next = (
    await t.query<{ id: string; team_id: string | null }>(
      `SELECT id, team_id FROM registrations WHERE event_id = $1 AND status = 'waitlisted'
        ORDER BY waitlist_pos ASC NULLS LAST, created_at ASC LIMIT 1`,
      [eventId]
    )
  ).rows[0];
  if (!next) return;
  await t.query(`UPDATE registrations SET status = 'registered', waitlist_pos = NULL WHERE id = $1`, [next.id]);
  if (next.team_id) await t.query(`UPDATE teams SET status = 'registered' WHERE id = $1`, [next.team_id]);
}

async function resequenceWaitlist(t: Queryable, eventId: string) {
  const rows = (
    await t.query<{ id: string }>(
      `SELECT id FROM registrations WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_pos ASC NULLS LAST, created_at ASC`,
      [eventId]
    )
  ).rows;
  for (let i = 0; i < rows.length; i++) {
    await t.query(`UPDATE registrations SET waitlist_pos = $1 WHERE id = $2`, [i + 1, rows[i].id]);
  }
}

// ── Small team helpers ─────────────────────────────────────────────────────────
async function teamSize(t: Queryable, teamId: string): Promise<number> {
  const r = (await t.query<{ c: string }>(`SELECT count(*)::text c FROM team_members WHERE team_id = $1`, [teamId])).rows[0];
  return Number(r.c);
}
async function teamMembers(t: Queryable, teamId: string): Promise<string[]> {
  const rows = (await t.query<{ user_id: string }>(`SELECT user_id FROM team_members WHERE team_id = $1 ORDER BY joined_at ASC`, [teamId])).rows;
  return rows.map((r) => r.user_id);
}
async function teamStatus(t: Queryable, teamId: string): Promise<string> {
  const r = (await t.query<{ status: string }>(`SELECT status FROM teams WHERE id = $1`, [teamId])).rows[0];
  return r?.status ?? "forming";
}
