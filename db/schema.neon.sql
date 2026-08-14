-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION schema (Neon / real Postgres) — spec §7 verbatim, with two fixes the
-- spec itself calls for:
--   1. team_members uses a denormalized event_id column + UNIQUE(user_id,event_id)
--      instead of the (impossible) subquery index in the spec draft.
--   2. idempotency_keys table added to satisfy the register idempotency requirement (§9.2).
-- Local dev uses db/schema.sql (citext dropped for PGlite); this file is the
-- reference you run against Neon. Apply with: psql "$DATABASE_URL" -f db/schema.neon.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE seasons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_season ON seasons (is_active) WHERE is_active;

CREATE TABLE cohorts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color_hex     text,
  icon_key      text,
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (season_id, name)
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  display_name   text NOT NULL,
  cohort_id      uuid REFERENCES cohorts(id),
  is_admin       boolean NOT NULL DEFAULT false,
  is_scorekeeper boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz
);

CREATE TABLE verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL,
  code_hash     text NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  request_ip    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON verification_codes (email, created_at DESC);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (user_id);

CREATE TYPE entry_type AS ENUM ('individual', 'team');
CREATE TYPE event_status AS ENUM ('draft','published','in_progress','complete','cancelled');

CREATE TABLE events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  slug             text NOT NULL,
  name             text NOT NULL,
  description      text,
  entry_type       entry_type NOT NULL,
  min_team_size    int,
  max_team_size    int,
  capacity         int,
  waitlist_enabled boolean NOT NULL DEFAULT true,
  signup_opens_at  timestamptz,
  signup_closes_at timestamptz,
  starts_at        timestamptz,
  ends_at          timestamptz,
  location         text,
  location_note    text,
  status           event_status NOT NULL DEFAULT 'draft',
  points_schema    jsonb,
  live_score       text,
  has_bracket      boolean NOT NULL DEFAULT false,
  sort_order       int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, slug),
  CHECK (entry_type = 'individual' OR (min_team_size IS NOT NULL AND max_team_size >= min_team_size))
);
CREATE INDEX ON events (season_id, starts_at);

CREATE TYPE team_status AS ENUM ('forming','registered','waitlisted','withdrawn');

CREATE TABLE teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          text NOT NULL,
  captain_id    uuid NOT NULL REFERENCES users(id),
  invite_code   text NOT NULL UNIQUE,
  status        team_status NOT NULL DEFAULT 'forming',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE TABLE team_members (
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE UNIQUE INDEX one_team_per_event ON team_members (user_id, event_id);

-- Added (spec §3/§6.4 require it; §7 omitted the mapping table):
CREATE TABLE scorekeeper_events (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TYPE reg_status AS ENUM ('registered','waitlisted','withdrawn');

CREATE TABLE registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES teams(id) ON DELETE CASCADE,
  status        reg_status NOT NULL DEFAULT 'registered',
  waitlist_pos  int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (team_id IS NULL))
);
CREATE UNIQUE INDEX ON registrations (event_id, user_id) WHERE user_id IS NOT NULL AND status <> 'withdrawn';
CREATE UNIQUE INDEX ON registrations (event_id, team_id) WHERE team_id IS NOT NULL AND status <> 'withdrawn';
CREATE INDEX ON registrations (event_id, status);

CREATE TABLE scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  cohort_id       uuid REFERENCES cohorts(id),
  points          numeric(8,2) NOT NULL DEFAULT 0,
  placement       int,
  notes           text,
  recorded_by     uuid NOT NULL REFERENCES users(id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, registration_id)
);
CREATE INDEX ON scores (cohort_id);

CREATE TABLE idempotency_keys (
  key           text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bracket_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round          int NOT NULL,
  slot           int NOT NULL,
  entrant_a      uuid REFERENCES registrations(id) ON DELETE SET NULL,
  entrant_b      uuid REFERENCES registrations(id) ON DELETE SET NULL,
  score_a        int,
  score_b        int,
  winner         uuid REFERENCES registrations(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending',
  next_match_id  uuid REFERENCES bracket_matches(id) ON DELETE SET NULL,
  next_slot      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, round, slot)
);
CREATE INDEX ON bracket_matches (event_id, round, slot);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  actor_id      uuid REFERENCES users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (created_at DESC);

CREATE TABLE rate_limits (
  key           text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         int NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
