-- Championship (bracket final at a different place/time) + auto go-live at start time.
-- Run once in the Neon SQL Editor against the production database.

ALTER TABLE events ADD COLUMN IF NOT EXISTS championship_location   text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS championship_map_url    text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS championship_starts_at  timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS championship_ends_at    timestamptz;

-- When true, a published event shows as live automatically once starts_at passes.
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_go_live boolean NOT NULL DEFAULT true;
