import { query, queryOne } from "./db";
import { publicName } from "./format";
import { rangesOverlap } from "./time";
import type {
  IconKey,
  StandingRow,
  ScheduleEvent,
  EventResultRow,
  EventDetail,
  BrowseEvent,
  ViewerTeam,
  AgendaItem,
} from "./types";

export type { StandingRow, ScheduleEvent, EventResultRow, EventDetail } from "./types";

// ── Standings (§4, §7) ─────────────────────────────────────────────────────────
// SUM(points) GROUP BY cohort over scores whose event is `complete`. Plain indexed
// query; the HTTP layer caches the result (§9.1), so no materialized view.

export async function getStandings(): Promise<StandingRow[]> {
  const rows = await query<{
    id: string;
    name: string;
    icon_key: IconKey;
    color_hex: string;
    points: number;
    events_scored: string;
    sort_order: number;
  }>(
    `SELECT c.id, c.name, c.icon_key, c.color_hex, c.sort_order,
            COALESCE(SUM(CASE WHEN e.status='complete' THEN s.points ELSE 0 END),0)::float8 AS points,
            COUNT(DISTINCT CASE WHEN e.status='complete' THEN s.event_id END)::text AS events_scored
       FROM cohorts c
       LEFT JOIN scores s ON s.cohort_id = c.id
       LEFT JOIN events e ON e.id = s.event_id
      WHERE c.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
      GROUP BY c.id, c.name, c.icon_key, c.color_hex, c.sort_order
      ORDER BY points DESC, c.sort_order ASC`
  );

  // Assign ranks with standard tie handling (equal points share a rank).
  let lastPoints = Number.POSITIVE_INFINITY;
  let rank = 0;
  return rows.map((r, i) => {
    const points = Number(r.points);
    if (points < lastPoints) {
      rank = i + 1;
      lastPoints = points;
    }
    return {
      cohortId: r.id,
      name: r.name,
      iconKey: r.icon_key,
      colorHex: r.color_hex,
      points,
      eventsScored: Number(r.events_scored),
      rank,
    };
  });
}

// ── Schedule (§6.1) ────────────────────────────────────────────────────────────

export async function getSchedule(): Promise<ScheduleEvent[]> {
  const rows = await query<any>(
    `SELECT e.id, e.slug, e.name, e.entry_type, e.status,
            e.starts_at, e.ends_at, e.location, e.location_note, e.capacity, e.live_score, e.has_bracket,
            (SELECT count(*) FROM registrations r
              WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered_count
       FROM events e
      WHERE e.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
        AND e.status <> 'draft'
      ORDER BY e.starts_at ASC NULLS LAST, e.sort_order ASC`
  );
  return rows.map(mapScheduleRow);
}

function mapScheduleRow(e: any): ScheduleEvent {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    entryType: e.entry_type,
    status: e.status,
    startsAt: e.starts_at ? new Date(e.starts_at).toISOString() : null,
    endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
    location: e.location,
    locationNote: e.location_note,
    capacity: e.capacity,
    registeredCount: Number(e.registered_count ?? 0),
    liveScore: e.live_score ?? null,
    hasBracket: Boolean(e.has_bracket),
  };
}

// ── Event detail + public results (§8 GET /api/events/:slug) ────────────────────

export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  const e = await queryOne<any>(
    `SELECT * FROM events
      WHERE slug = $1 AND season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
        AND status <> 'draft'`,
    [slug]
  );
  if (!e) return null;

  const results =
    e.status === "complete" || e.status === "in_progress" ? await getPublicResults(e.id) : [];

  return {
    ...mapScheduleRow(e),
    description: e.description,
    minTeamSize: e.min_team_size,
    maxTeamSize: e.max_team_size,
    waitlistEnabled: e.waitlist_enabled,
    signupOpensAt: e.signup_opens_at ? new Date(e.signup_opens_at).toISOString() : null,
    signupClosesAt: e.signup_closes_at ? new Date(e.signup_closes_at).toISOString() : null,
    pointsSchema: e.points_schema ?? null,
    results,
  };
}

export async function getPublicResults(eventId: string): Promise<EventResultRow[]> {
  const rows = await query<any>(
    `SELECT s.placement, s.points::float8::text AS points,
            u.display_name AS user_name, t.name AS team_name,
            c.name AS cohort_name, c.icon_key AS cohort_icon
       FROM scores s
       JOIN registrations r ON r.id = s.registration_id
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN cohorts c ON c.id = s.cohort_id
      WHERE s.event_id = $1
      ORDER BY s.placement ASC NULLS LAST, s.points DESC`,
    [eventId]
  );
  return rows.map((r) => ({
    placement: r.placement,
    points: Number(r.points),
    entrantLabel: r.team_name ? r.team_name : r.user_name ? publicName(r.user_name) : "—",
    cohortName: r.cohort_name ?? null,
    cohortIcon: r.cohort_icon ?? null,
  }));
}

export interface CohortOption {
  id: string;
  name: string;
  iconKey: IconKey;
  colorHex: string;
}

export async function getCohorts(): Promise<CohortOption[]> {
  const rows = await query<any>(
    `SELECT id, name, icon_key, color_hex FROM cohorts
      WHERE season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
      ORDER BY sort_order ASC`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, iconKey: r.icon_key, colorHex: r.color_hex }));
}

// ── Browse & register (§6.2) ────────────────────────────────────────────────────

/** The viewer's teams keyed by event, with member rosters (for /events and /me). */
async function getViewerTeams(userId: string): Promise<Map<string, ViewerTeam>> {
  const teams = await query<any>(
    `SELECT t.id, t.event_id, t.name, t.status, t.captain_id, t.invite_code
       FROM teams t JOIN team_members m ON m.team_id = t.id
      WHERE m.user_id = $1`,
    [userId]
  );
  const byEvent = new Map<string, ViewerTeam>();
  for (const t of teams) {
    const members = await query<any>(
      `SELECT u.id, u.display_name FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = $1 ORDER BY tm.joined_at ASC`,
      [t.id]
    );
    byEvent.set(t.event_id, {
      id: t.id,
      name: t.name,
      status: t.status,
      isCaptain: t.captain_id === userId,
      inviteCode: t.captain_id === userId ? t.invite_code : null, // only the captain sees the code
      memberCount: members.length,
      members: members.map((m) => ({
        userId: m.id,
        name: publicName(m.display_name),
        isCaptain: m.id === t.captain_id,
      })),
    });
  }
  return byEvent;
}

export async function getBrowseEvents(userId: string | null): Promise<BrowseEvent[]> {
  const rows = await query<any>(
    `SELECT e.*,
            (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered_count,
            (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'waitlisted')::int AS waitlist_count
       FROM events e
      WHERE e.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
        AND e.status <> 'draft'
      ORDER BY e.starts_at ASC NULLS LAST, e.sort_order ASC`
  );

  // Teams with open spots, joinable directly (no invite code) — grouped by event.
  const joinable = new Map<string, { id: string; name: string; status: string; memberCount: number }[]>();
  const openTeamRows = await query<any>(
    `SELECT t.id, t.event_id, t.name, t.status,
            (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id)::int AS member_count
       FROM teams t JOIN events e ON e.id = t.event_id
      WHERE e.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
        AND e.status = 'published' AND t.status <> 'withdrawn'
        AND (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id) < COALESCE(e.max_team_size, 999999)
      ORDER BY t.created_at ASC`
  );
  for (const t of openTeamRows) {
    const list = joinable.get(t.event_id) ?? [];
    list.push({ id: t.id, name: t.name, status: t.status, memberCount: Number(t.member_count) });
    joinable.set(t.event_id, list);
  }

  let myRegs = new Map<string, { status: string; pos: number | null }>();
  let myTeams = new Map<string, ViewerTeam>();
  if (userId) {
    const regs = await query<any>(
      `SELECT event_id, status, waitlist_pos FROM registrations
        WHERE user_id = $1 AND status <> 'withdrawn'`,
      [userId]
    );
    myRegs = new Map(regs.map((r) => [r.event_id, { status: r.status, pos: r.waitlist_pos }]));
    myTeams = await getViewerTeams(userId);
  }

  // Build the viewer's active time ranges for conflict detection (§6.2).
  const active: { name: string; startsAt: string | null; endsAt: string | null }[] = [];
  const byId = new Map(rows.map((e) => [e.id, e]));
  if (userId) {
    for (const [eventId, r] of myRegs) {
      const e = byId.get(eventId);
      if (e && r.status !== "withdrawn") active.push({ name: e.name, startsAt: e.starts_at, endsAt: e.ends_at });
    }
    for (const [eventId, team] of myTeams) {
      if (team.status === "registered" || team.status === "waitlisted") {
        const e = byId.get(eventId);
        if (e) active.push({ name: e.name, startsAt: e.starts_at, endsAt: e.ends_at });
      }
    }
  }

  return rows.map((e) => {
    const team = myTeams.get(e.id) ?? null;
    const indiv = myRegs.get(e.id) ?? null;
    const registrationStatus: "registered" | "waitlisted" | "none" =
      e.entry_type === "team"
        ? team && (team.status === "registered" || team.status === "waitlisted")
          ? (team.status as "registered" | "waitlisted")
          : "none"
        : indiv
        ? (indiv.status as "registered" | "waitlisted")
        : "none";

    // Conflict: another active registration overlapping this event's time.
    let conflictsWith: { name: string; startsAt: string | null } | null = null;
    const isMine = registrationStatus !== "none";
    if (userId && !isMine) {
      for (const a of active) {
        if (a.name !== e.name && rangesOverlap(e.starts_at, e.ends_at, a.startsAt, a.endsAt)) {
          conflictsWith = { name: a.name, startsAt: a.startsAt };
          break;
        }
      }
    }

    const spotsRemaining = e.capacity == null ? null : Math.max(0, e.capacity - Number(e.registered_count));

    return {
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description,
      entryType: e.entry_type,
      status: e.status,
      startsAt: e.starts_at ? new Date(e.starts_at).toISOString() : null,
      endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
      location: e.location,
      locationNote: e.location_note,
      capacity: e.capacity,
      registeredCount: Number(e.registered_count),
      waitlistCount: Number(e.waitlist_count),
      waitlistEnabled: e.waitlist_enabled,
      signupOpensAt: e.signup_opens_at ? new Date(e.signup_opens_at).toISOString() : null,
      signupClosesAt: e.signup_closes_at ? new Date(e.signup_closes_at).toISOString() : null,
      minTeamSize: e.min_team_size,
      maxTeamSize: e.max_team_size,
      spotsRemaining,
      liveScore: e.live_score ?? null,
      hasBracket: Boolean(e.has_bracket),
      joinableTeams: team ? [] : joinable.get(e.id) ?? [], // hide if the viewer already has a team
      viewer: userId ? { registrationStatus, waitlistPos: indiv?.pos ?? null, team } : null,
      conflictsWith,
    } satisfies BrowseEvent;
  });
}

// ── My agenda (§6.3) ─────────────────────────────────────────────────────────
export async function getMyAgenda(userId: string): Promise<AgendaItem[]> {
  const teams = await getViewerTeams(userId);

  // Individual registrations.
  const indiv = await query<any>(
    `SELECT e.id, e.slug, e.name, e.entry_type, e.status, e.starts_at, e.ends_at, e.location, e.location_note,
            r.status AS reg_status, r.waitlist_pos
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.user_id = $1 AND r.status <> 'withdrawn'`,
    [userId]
  );

  const items: AgendaItem[] = indiv.map((e) => ({
    eventId: e.id,
    slug: e.slug,
    eventName: e.name,
    entryType: e.entry_type,
    status: e.status,
    startsAt: e.starts_at ? new Date(e.starts_at).toISOString() : null,
    endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
    location: e.location,
    locationNote: e.location_note,
    registrationStatus: e.reg_status,
    waitlistPos: e.waitlist_pos,
    team: null,
  }));

  // Team memberships (include forming teams so people can see/manage them).
  for (const [eventId, team] of teams) {
    const e = await queryOne<any>(`SELECT id, slug, name, entry_type, status, starts_at, ends_at, location, location_note FROM events WHERE id = $1`, [eventId]);
    if (!e) continue;
    items.push({
      eventId: e.id,
      slug: e.slug,
      eventName: e.name,
      entryType: e.entry_type,
      status: e.status,
      startsAt: e.starts_at ? new Date(e.starts_at).toISOString() : null,
      endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
      location: e.location,
      locationNote: e.location_note,
      registrationStatus: team.status === "waitlisted" ? "waitlisted" : "registered",
      waitlistPos: null,
      team,
    });
  }

  // Chronological.
  return items.sort((a, b) => {
    const ta = a.startsAt ? Date.parse(a.startsAt) : Infinity;
    const tb = b.startsAt ? Date.parse(b.startsAt) : Infinity;
    return ta - tb;
  });
}

/** Freshness stamp for the public surface (§6.1). */
export async function getLastUpdated(): Promise<string> {
  const row = await queryOne<{ ts: string | null }>(
    `SELECT GREATEST(
       (SELECT max(recorded_at) FROM scores),
       (SELECT max(updated_at)  FROM events)
     ) AS ts`
  );
  return row?.ts ? new Date(row.ts).toISOString() : new Date().toISOString();
}
