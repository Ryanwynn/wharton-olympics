-- ============================================================================
-- Wharton Student Olympics — DEMO DATA  (Office of Student Life demo)
-- ----------------------------------------------------------------------------
-- Populates the CURRENT active season with sample participants, events, teams,
-- and results so every page (scoreboard, schedule, registration, teams) looks
-- fully alive. Run once in the Neon SQL Editor.
--
-- Everything it creates is TAGGED so it can be removed cleanly later:
--     • demo participants:  email ends in   @demo.pennolympics.test
--     • demo events:         slug starts with  demo-
-- Real participants, clusters, and the season are never touched.
-- To undo, run db/demo-remove.sql.
--
-- Requires: an active season that already has your four clusters.
-- ============================================================================

-- 1) Demo participants, evenly split across the clusters ----------------------
WITH co AS (
  SELECT id, (row_number() OVER (ORDER BY sort_order)) - 1 AS idx
  FROM cohorts WHERE season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
),
n AS (SELECT count(*)::int AS k FROM co)
INSERT INTO users (email, display_name, cohort_id)
SELECT
  'demo' || g.n || '@demo.pennolympics.test',
  (ARRAY['Ava','Liam','Maya','Noah','Sofia','Ethan','Priya','Diego','Chloe','Omar',
         'Grace','Lucas','Aisha','Marco','Hannah','Ravi','Zoe','Jamal','Isla','Kenji'])[1 + (g.n % 20)]
  || ' ' ||
  (ARRAY['Patel','Nguyen','Garcia','Kim','Cohen','Okafor','Rossi','Silva','Chen','Haddad',
         'Johnson','Martinez','Ali','Novak','Reyes','Sato','Brown','Dubois','Ivanov','Mensah'])[1 + ((g.n / 20) % 20)],
  co.id
FROM generate_series(1, 120) AS g(n)
CROSS JOIN n
JOIN co ON co.idx = (g.n % n.k);

-- 2) Eight sample events on the active season (start_h/end_h are hours vs now) -
INSERT INTO events
  (season_id, slug, name, description, entry_type, min_team_size, max_team_size,
   capacity, waitlist_enabled, signup_opens_at, signup_closes_at, starts_at, ends_at,
   location, status, points_schema, live_score, sort_order)
SELECT
  (SELECT id FROM seasons WHERE is_active LIMIT 1),
  v.slug, v.name, v.descr, v.entry::entry_type, v.mn, v.mx, v.cap, true,
  now() - interval '1 day',
  now() + make_interval(hours => v.start_h),
  now() + make_interval(hours => v.start_h),
  now() + make_interval(hours => v.end_h),
  v.loc, v.status::event_status, v.points::jsonb, v.live, v.ord
FROM (VALUES
  ('demo-5k-run',      '5K Fun Run',         'Chip-timed loop around Penn Park. All paces welcome.', 'individual', NULL, NULL, 150, -5, -4, 'Penn Park — Field A', 'complete',    '{"1":15,"2":10,"3":6,"participation":2}',  NULL,                        1),
  ('demo-chess',       'Chess Blitz',        '5-minute blitz, Swiss format, five rounds.',           'individual', NULL, NULL, 24,  -4, -3, 'Houston Hall',        'complete',    '{"1":15,"2":10,"3":6,"participation":2}',  NULL,                        2),
  ('demo-basketball',  '3v3 Basketball',     'Half-court, first to 21. Teams of 3-5.',               'team',       3,    5,    16,  -3, -1, 'Pottruck Gym',        'complete',    '{"1":25,"2":15,"3":10,"participation":4}', NULL,                        3),
  ('demo-spikeball',   'Spikeball Singles',  'Round-robin into a single-elimination bracket.',       'individual', NULL, NULL, 32,   0,  2, 'Shoemaker Green',     'in_progress', '{"1":15,"2":10,"3":6,"participation":2}',  'Ava P. 21 - Diego M. 18',   4),
  ('demo-dodgeball',   'Dodgeball',          'Six-a-side. Rolling matches until one team stands.',   'team',       3,    6,    12,   2,  4, 'Penn Park — Field B', 'published',   '{"1":25,"2":15,"3":10,"participation":4}', NULL,                        5),
  ('demo-relay',       '4x100 Sprint Relay', 'Cluster relay on the Franklin Field track.',           'individual', NULL, NULL, 40,   3,  4, 'Franklin Field',      'published',   '{"1":15,"2":10,"3":6,"participation":2}',  NULL,                        6),
  ('demo-cornhole',    'Cornhole',           'Bags. Double elimination. Bring your A-toss.',         'individual', NULL, NULL, 32,   4,  6, 'College Green',       'published',   '{"1":15,"2":10,"3":6,"participation":2}',  NULL,                        7),
  ('demo-trivia',      'Trivia Night',       'Five rounds, teams of 2-4. Wharton lore included.',    'team',       2,    4,    20,   5,  7, 'Bodek Lounge',        'published',   '{"1":25,"2":15,"3":10,"participation":4}', NULL,                        8)
) AS v(slug, name, descr, entry, mn, mx, cap, start_h, end_h, loc, status, points, live, ord);

-- 3) One team per cluster for each team event --------------------------------
INSERT INTO teams (event_id, name, captain_id, cohort_id, invite_code, status)
SELECT e.id, c.name || ' ' || e.name, cap.captain, c.id,
       upper(substr(md5(e.id::text || c.id::text), 1, 6)), 'registered'::team_status
FROM events e
JOIN cohorts c ON c.season_id = (SELECT id FROM seasons WHERE is_active LIMIT 1)
JOIN LATERAL (
  SELECT id AS captain FROM users
  WHERE cohort_id = c.id AND email LIKE '%@demo.pennolympics.test'
  ORDER BY email LIMIT 1
) cap ON true
WHERE e.slug LIKE 'demo-%' AND e.entry_type = 'team';

-- 4) Team members (captain + a few, all from the team's cluster) --------------
INSERT INTO team_members (team_id, user_id, event_id)
SELECT t.id, m.id, t.event_id
FROM teams t
JOIN events e ON e.id = t.event_id AND e.slug LIKE 'demo-%'
JOIN LATERAL (
  SELECT id FROM users
  WHERE cohort_id = t.cohort_id AND email LIKE '%@demo.pennolympics.test'
  ORDER BY email
  LIMIT (SELECT min_team_size FROM events WHERE id = t.event_id) + 1
) m ON true;

-- 5) Register the demo teams --------------------------------------------------
INSERT INTO registrations (event_id, team_id, status)
SELECT t.event_id, t.id, 'registered'::reg_status
FROM teams t JOIN events e ON e.id = t.event_id AND e.slug LIKE 'demo-%';

-- 6) Register participants for the individual events --------------------------
INSERT INTO registrations (event_id, user_id, status)
SELECT e.id, u.id, 'registered'::reg_status
FROM events e
JOIN LATERAL (
  SELECT id FROM users
  WHERE email LIKE '%@demo.pennolympics.test'
  ORDER BY email
  LIMIT LEAST(e.capacity, 48)
) u ON true
WHERE e.slug LIKE 'demo-%' AND e.entry_type = 'individual';

-- 7a) Results for completed INDIVIDUAL events (placements + points) -----------
INSERT INTO scores (event_id, registration_id, cohort_id, points, placement, recorded_by)
SELECT x.event_id, x.id, x.cohort_id,
  COALESCE((x.points_schema ->> (x.rn::text))::numeric, (x.points_schema ->> 'participation')::numeric, 0),
  x.rn,
  COALESCE((SELECT id FROM users WHERE is_admin ORDER BY created_at LIMIT 1), x.user_id)
FROM (
  SELECT r.id, r.event_id, r.user_id, u.cohort_id, e.points_schema,
         row_number() OVER (PARTITION BY r.event_id ORDER BY random()) AS rn
  FROM registrations r
  JOIN events e ON e.id = r.event_id
  JOIN users u ON u.id = r.user_id
  WHERE e.slug LIKE 'demo-%' AND e.status = 'complete' AND e.entry_type = 'individual'
) x;

-- 7b) Results for completed TEAM events --------------------------------------
INSERT INTO scores (event_id, registration_id, cohort_id, points, placement, recorded_by)
SELECT x.event_id, x.id, x.cohort_id,
  COALESCE((x.points_schema ->> (x.rn::text))::numeric, (x.points_schema ->> 'participation')::numeric, 0),
  x.rn,
  COALESCE((SELECT id FROM users WHERE is_admin ORDER BY created_at LIMIT 1), x.captain_id)
FROM (
  SELECT r.id, r.event_id, t.cohort_id, t.captain_id, e.points_schema,
         row_number() OVER (PARTITION BY r.event_id ORDER BY random()) AS rn
  FROM registrations r
  JOIN events e ON e.id = r.event_id
  JOIN teams t ON t.id = r.team_id
  WHERE e.slug LIKE 'demo-%' AND e.status = 'complete' AND e.entry_type = 'team' AND r.team_id IS NOT NULL
) x;

-- Summary ---------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM users  WHERE email LIKE '%@demo.pennolympics.test')                                   AS demo_participants,
  (SELECT count(*) FROM events WHERE slug  LIKE 'demo-%')                                                     AS demo_events,
  (SELECT count(*) FROM registrations r JOIN events e ON e.id = r.event_id WHERE e.slug LIKE 'demo-%')        AS demo_registrations,
  (SELECT count(*) FROM scores s JOIN events e ON e.id = s.event_id WHERE e.slug LIKE 'demo-%')               AS demo_scores;
