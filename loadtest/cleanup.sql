-- Remove all load-test data. Run against the SAME database you seeded (the Neon
-- branch). Events are deleted first so their registrations cascade before users.
DELETE FROM events WHERE slug = 'loadtest-stampede';
DELETE FROM users  WHERE email LIKE '%@loadtest.invalid';   -- cascades their sessions

SELECT
  (SELECT count(*) FROM events WHERE slug = 'loadtest-stampede')        AS events_left,
  (SELECT count(*) FROM users  WHERE email LIKE '%@loadtest.invalid')   AS users_left;
