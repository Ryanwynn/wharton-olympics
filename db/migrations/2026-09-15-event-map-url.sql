-- Per-event Google Maps link (shown as a "Google Maps" link on the schedule).
-- Run once in the Neon SQL Editor against the production database.
ALTER TABLE events ADD COLUMN IF NOT EXISTS map_url text;
