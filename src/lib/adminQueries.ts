import { query, queryOne } from "./db";
import { publicName } from "./format";
import { rangesOverlap } from "./time";
import type { IconKey } from "./types";

// ── Scorekeeper entry data (§6.5) ───────────────────────────────────────────────
export interface ScoreEntrant {
  registrationId: string;
  label: string;
  cohortName: string | null;
  cohortIcon: IconKey | null;
  points: number | null;
  placement: number | null;
}
export interface ScoringEvent {
  id: string;
  name: string;
  slug: string;
  status: string;
  entryType: "individual" | "team";
  pointsSchema: Record<string, number> | null;
  liveScore: string | null;
  hasBracket: boolean;
  entrants: ScoreEntrant[];
}

export async function getEventForScoring(eventId: string): Promise<ScoringEvent | null> {
  const e = await queryOne<any>(
    `SELECT id, name, slug, status, entry_type, points_schema, live_score, has_bracket FROM events WHERE id = $1`,
    [eventId]
  );
  if (!e) return null;
  const rows = await query<any>(
    `SELECT r.id AS reg_id,
            u.display_name AS user_name, t.name AS team_name,
            c.name AS cohort_name, c.icon_key AS cohort_icon,
            s.points::float8 AS points, s.placement
       FROM registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users cap ON cap.id = t.captain_id
       LEFT JOIN cohorts c ON c.id = COALESCE(u.cohort_id, cap.cohort_id)
       LEFT JOIN scores s ON s.registration_id = r.id
      WHERE r.event_id = $1 AND r.status = 'registered'
      ORDER BY s.placement ASC NULLS LAST, COALESCE(t.name, u.display_name) ASC`,
    [eventId]
  );
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    status: e.status,
    entryType: e.entry_type,
    pointsSchema: e.points_schema ?? null,
    liveScore: e.live_score ?? null,
    hasBracket: Boolean(e.has_bracket),
    entrants: rows.map((r) => ({
      registrationId: r.reg_id,
      label: r.team_name ? r.team_name : r.user_name ? r.user_name : "—",
      cohortName: r.cohort_name ?? null,
      cohortIcon: r.cohort_icon ?? null,
      points: r.points == null ? null : Number(r.points),
      placement: r.placement,
    })),
  };
}

// ── Admin: events list ──────────────────────────────────────────────────────────
export async function listAdminEvents() {
  const rows = await query<any>(
    `SELECT e.id, e.slug, e.name, e.description, e.entry_type, e.status, e.capacity, e.waitlist_enabled,
            e.min_team_size, e.max_team_size, e.starts_at, e.ends_at, e.location, e.location_note,
            e.signup_opens_at, e.signup_closes_at, e.points_schema,
            (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered,
            (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'waitlisted')::int AS waitlisted
       FROM events e
      WHERE e.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
      ORDER BY e.starts_at ASC NULLS LAST, e.sort_order ASC`
  );
  return rows.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description ?? null,
    entryType: e.entry_type,
    status: e.status,
    capacity: e.capacity,
    waitlistEnabled: e.waitlist_enabled,
    minTeamSize: e.min_team_size,
    maxTeamSize: e.max_team_size,
    startsAt: e.starts_at ? new Date(e.starts_at).toISOString() : null,
    endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
    location: e.location,
    locationNote: e.location_note ?? null,
    signupOpensAt: e.signup_opens_at ? new Date(e.signup_opens_at).toISOString() : null,
    signupClosesAt: e.signup_closes_at ? new Date(e.signup_closes_at).toISOString() : null,
    pointsSchema: e.points_schema ?? null,
    registered: Number(e.registered),
    waitlisted: Number(e.waitlisted),
  }));
}

// ── Admin: roster with conflict badges (§6.4) ───────────────────────────────────
export interface RosterEntry {
  registrationId: string;
  kind: "user" | "team";
  label: string;
  status: string;
  waitlistPos: number | null;
  userId: string | null;
  teamId: string | null;
  conflict: { name: string } | null;
}

export async function getRoster(eventId: string): Promise<{ eventName: string; entries: RosterEntry[] }> {
  const ev = await queryOne<any>(`SELECT name, starts_at, ends_at FROM events WHERE id = $1`, [eventId]);
  if (!ev) return { eventName: "", entries: [] };

  const rows = await query<any>(
    `SELECT r.id, r.status, r.waitlist_pos, r.user_id, r.team_id,
            u.display_name AS user_name, t.name AS team_name
       FROM registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN teams t ON t.id = r.team_id
      WHERE r.event_id = $1 AND r.status <> 'withdrawn'
      ORDER BY (r.status = 'registered') DESC, r.waitlist_pos ASC NULLS LAST, r.created_at ASC`,
    [eventId]
  );

  // Conflict detection for individual entrants: another active registration overlapping.
  const entries: RosterEntry[] = [];
  for (const r of rows) {
    let conflict: { name: string } | null = null;
    if (r.user_id) {
      const others = await query<any>(
        `SELECT e.name, e.starts_at, e.ends_at
           FROM registrations rr JOIN events e ON e.id = rr.event_id
          WHERE rr.user_id = $1 AND rr.status <> 'withdrawn' AND e.id <> $2`,
        [r.user_id, eventId]
      );
      for (const o of others) {
        if (rangesOverlap(ev.starts_at, ev.ends_at, o.starts_at, o.ends_at)) {
          conflict = { name: o.name };
          break;
        }
      }
    }
    entries.push({
      registrationId: r.id,
      kind: r.team_id ? "team" : "user",
      label: r.team_name ? r.team_name : r.user_name ?? "—",
      status: r.status,
      waitlistPos: r.waitlist_pos,
      userId: r.user_id,
      teamId: r.team_id,
      conflict,
    });
  }
  return { eventName: ev.name, entries };
}

export async function getRosterCsv(eventId: string): Promise<string> {
  const { entries } = await getRoster(eventId);
  const header = ["entrant", "kind", "status", "waitlist_pos", "conflict"];
  const lines = [header.join(",")];
  for (const e of entries) {
    const cells = [e.label, e.kind, e.status, e.waitlistPos ?? "", e.conflict ? e.conflict.name : ""];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Admin: user search + audit ──────────────────────────────────────────────────
export async function searchUsers(q: string) {
  const like = `%${q.toLowerCase()}%`;
  const rows = await query<any>(
    `SELECT id, email, display_name, is_admin, is_scorekeeper FROM users
      WHERE lower(email) LIKE $1 OR lower(display_name) LIKE $1
      ORDER BY display_name ASC LIMIT 25`,
    [like]
  );
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    isAdmin: u.is_admin,
    isScorekeeper: u.is_scorekeeper,
  }));
}

export async function getAuditLog(filter: { actor?: string; entity?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.entity) {
    params.push(filter.entity);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (filter.actor) {
    params.push(`%${filter.actor.toLowerCase()}%`);
    where.push(`lower(u.display_name) LIKE $${params.length}`);
  }
  const rows = await query<any>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.display_name AS actor
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.created_at DESC LIMIT 100`,
    params
  );
  return rows.map((r) => ({
    id: String(r.id),
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actor: r.actor ?? "system",
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
