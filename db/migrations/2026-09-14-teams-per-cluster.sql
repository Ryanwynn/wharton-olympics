-- Configurable number of teams per cluster per event.
-- Run once in the Neon SQL Editor against the production database.
--
-- Before: a hard UNIQUE index allowed exactly one team per cluster per event.
-- After:  events.max_teams_per_cohort caps how many teams each cluster may enter
--         (default 1, so existing events keep behaving exactly as before), and the
--         cap is enforced in app code under the event row lock.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS max_teams_per_cohort int NOT NULL DEFAULT 1;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_max_teams_per_cohort_check;
ALTER TABLE events
  ADD CONSTRAINT events_max_teams_per_cohort_check CHECK (max_teams_per_cohort >= 1);

-- Allow multiple teams per cluster: drop the uniqueness, keep a plain index for the count.
DROP INDEX IF EXISTS one_team_per_cohort;
CREATE INDEX IF NOT EXISTS teams_event_cohort ON teams (event_id, cohort_id);

-- Example: let each cluster enter up to 3 pickleball teams.
-- UPDATE events SET max_teams_per_cohort = 3 WHERE slug = 'pickleball';
