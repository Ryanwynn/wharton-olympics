-- Food trucks section on the home page.
-- Run once in the Neon SQL Editor against the production database.

CREATE TABLE IF NOT EXISTS food_trucks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name        text NOT NULL,
  location    text,
  menu_text   text,   -- one item per line; rendered as bullets
  menu_url    text,   -- external menu link
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_trucks_season ON food_trucks (season_id, sort_order);
