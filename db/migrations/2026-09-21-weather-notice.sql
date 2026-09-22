-- Optional weather notice on the public landing page (toggled from the admin console).
-- Run once in the Neon SQL Editor.
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weather_notice_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weather_notice_level    text;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weather_notice_title    text;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weather_notice_body     text;
