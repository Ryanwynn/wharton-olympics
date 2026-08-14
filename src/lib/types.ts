// Client-safe shared types. This module imports nothing server-side, so both the
// query layer and client components can depend on it.

export type IconKey = "lion" | "dragon" | "bee" | "tiger";

export interface StandingRow {
  cohortId: string;
  name: string;
  iconKey: IconKey;
  colorHex: string;
  points: number;
  eventsScored: number;
  rank: number;
}

export interface ScheduleEvent {
  id: string;
  slug: string;
  name: string;
  entryType: "individual" | "team";
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationNote: string | null;
  capacity: number | null;
  registeredCount: number;
  liveScore: string | null;
  hasBracket: boolean;
}

export interface EventResultRow {
  placement: number | null;
  points: number;
  entrantLabel: string;
  cohortName: string | null;
  cohortIcon: IconKey | null;
}

export interface TeamMemberLite {
  userId: string;
  name: string;
  isCaptain: boolean;
}

export interface ViewerTeam {
  id: string;
  name: string;
  status: string; // forming | registered | waitlisted | withdrawn
  isCaptain: boolean;
  inviteCode: string | null;
  memberCount: number;
  members: TeamMemberLite[];
}

export interface BrowseEvent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  entryType: "individual" | "team";
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationNote: string | null;
  capacity: number | null;
  registeredCount: number;
  waitlistCount: number;
  waitlistEnabled: boolean;
  signupOpensAt: string | null;
  signupClosesAt: string | null;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  spotsRemaining: number | null;
  liveScore: string | null;
  hasBracket: boolean;
  joinableTeams: { id: string; name: string; status: string; memberCount: number }[];
  viewer: {
    registrationStatus: "registered" | "waitlisted" | "none";
    waitlistPos: number | null;
    team: ViewerTeam | null;
  } | null;
  conflictsWith: { name: string; startsAt: string | null } | null;
}

// ── Brackets ─────────────────────────────────────────────────────────────────
export interface BracketEntrantLite {
  registrationId: string;
  label: string;
  cohortIcon: IconKey | null;
}
export interface BracketMatchView {
  id: string;
  round: number;
  slot: number;
  a: BracketEntrantLite | null;
  b: BracketEntrantLite | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null; // registrationId
  status: string; // pending | live | final
}
export interface BracketView {
  eventId: string;
  eventName: string;
  slug: string;
  rounds: BracketMatchView[][]; // rounds[0] = first round
  champion: BracketEntrantLite | null;
}

export interface AgendaItem {
  eventId: string;
  slug: string;
  eventName: string;
  entryType: "individual" | "team";
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  locationNote: string | null;
  registrationStatus: "registered" | "waitlisted";
  waitlistPos: number | null;
  team: ViewerTeam | null;
}

export interface EventDetail extends ScheduleEvent {
  description: string | null;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  waitlistEnabled: boolean;
  signupOpensAt: string | null;
  signupClosesAt: string | null;
  pointsSchema: Record<string, number> | null;
  results: EventResultRow[];
}
