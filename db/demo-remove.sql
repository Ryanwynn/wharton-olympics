-- ============================================================================
-- Wharton Student Olympics — REMOVE DEMO DATA
-- ----------------------------------------------------------------------------
-- Deletes everything created by db/demo-seed.sql and nothing else. Real
-- participants, clusters, the season, and any real events/results are untouched.
--
-- Order matters: deleting the demo events first cascades their teams,
-- registrations, scores, team members, and bracket matches — which frees the
-- foreign keys (team captain, score recorder) before the demo users are deleted.
-- ============================================================================

DELETE FROM events WHERE slug LIKE 'demo-%';
DELETE FROM users  WHERE email LIKE '%@demo.pennolympics.test';

-- Verify nothing demo remains (both counts should be 0):
SELECT
  (SELECT count(*) FROM events WHERE slug LIKE 'demo-%')                             AS events_left,
  (SELECT count(*) FROM users  WHERE email LIKE '%@demo.pennolympics.test')          AS participants_left;
