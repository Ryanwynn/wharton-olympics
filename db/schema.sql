-- ─────────────────────────────────────────────────────────────────────────────
-- Wharton Student Olympics — schema migration (idempotent).
-- This runs on both embedded PGlite (local dev) and real Postgres. It is kept
-- faithful to spec §7; the one deviation is `email text` instead of `citext`
-- (PGlite does not bundle the citext extension), so emails are normalized to
-- lowercase in application code before every insert and lookup — see lib/email.ts.
-- The verbatim production schema (with citext) is in db/schema.neon.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE entry_type AS ENUM ('individual','team'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE event_status AS ENUM ('draft','published','in_progress','complete','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE team_status AS ENUM ('forming','registered','waitlisted','withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE reg_status AS ENUM ('registered','waitlisted','withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS seasons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_season ON seasons (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS cohorts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color_hex     text,
  icon_key      text,                              -- 'lion' | 'dragon' | 'bee' | 'tiger' (§12.6)
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE (season_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,             -- normalized lowercase, plus-tags stripped
  display_name   text NOT NULL,
  cohort_id      uuid REFERENCES cohorts(id),
  is_admin       boolean NOT NULL DEFAULT false,
  is_scorekeeper boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  code_hash     text NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  request_ip    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_codes_email_created ON verification_codes (email, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS events (
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
  live_score       text,                           -- free-text running score while in_progress (§ live score)
  has_bracket      boolean NOT NULL DEFAULT false,  -- true once a bracket is generated
  sort_order       int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, slug),
  CHECK (entry_type = 'individual' OR (min_team_size IS NOT NULL AND max_team_size >= min_team_size))
);
CREATE INDEX IF NOT EXISTS events_season_starts ON events (season_id, starts_at);

CREATE TABLE IF NOT EXISTS teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          text NOT NULL,
  captain_id    uuid NOT NULL REFERENCES users(id),
  invite_code   text NOT NULL UNIQUE,
  status        team_status NOT NULL DEFAULT 'forming',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,  -- denormalized (§7)
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
-- A user may join only one team per event (spec's recommended denormalized approach):
CREATE UNIQUE INDEX IF NOT EXISTS one_team_per_event ON team_members (user_id, event_id);

-- Scorekeeper → event assignments. The spec (§3, §6.4) requires scorekeepers to be
-- limited to "assigned events only" but §7 omitted the mapping table; added here.
CREATE TABLE IF NOT EXISTS scorekeeper_events (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES teams(id) ON DELETE CASCADE,
  status        reg_status NOT NULL DEFAULT 'registered',
  waitlist_pos  int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (team_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reg_one_per_user  ON registrations (event_id, user_id) WHERE user_id IS NOT NULL AND status <> 'withdrawn';
CREATE UNIQUE INDEX IF NOT EXISTS reg_one_per_team  ON registrations (event_id, team_id) WHERE team_id IS NOT NULL AND status <> 'withdrawn';
CREATE INDEX IF NOT EXISTS reg_event_status ON registrations (event_id, status);

CREATE TABLE IF NOT EXISTS scores (
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
CREATE INDEX IF NOT EXISTS scores_cohort ON scores (cohort_id);

-- Idempotency keys for register calls (§9.2). Same key returns the same result.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Single-elimination tournament bracket (§ brackets). Each match links to the next
-- match the winner advances into. Entrants are registrations (user or team).
CREATE TABLE IF NOT EXISTS bracket_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round          int NOT NULL,                     -- 1 = first round; increases toward the final
  slot           int NOT NULL,                     -- position within the round (0-based)
  entrant_a      uuid REFERENCES registrations(id) ON DELETE SET NULL,
  entrant_b      uuid REFERENCES registrations(id) ON DELETE SET NULL,
  score_a        int,
  score_b        int,
  winner         uuid REFERENCES registrations(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending',  -- pending | live | final
  next_match_id  uuid REFERENCES bracket_matches(id) ON DELETE SET NULL,
  next_slot      text,                             -- 'a' | 'b' : which slot of next_match the winner fills
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, round, slot)
);
CREATE INDEX IF NOT EXISTS bracket_event ON bracket_matches (event_id, round, slot);

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  actor_id      uuid REFERENCES users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key           text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         int NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
