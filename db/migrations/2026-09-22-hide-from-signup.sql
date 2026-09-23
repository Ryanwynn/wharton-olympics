-- Let admins hide an event from the public sign-up page (e.g. signups done offline).
-- The event still shows on the schedule and can be scored/bracketed.
-- Run once in the Neon SQL Editor.
ALTER TABLE events ADD COLUMN IF NOT EXISTS hide_from_signup boolean NOT NULL DEFAULT false;
