-- Summer Smash Pickleball Championship — structural seed data
-- Run manually after 001_schema.sql: psql -d <dbname> -f 002_seed.sql
--
-- This seeds only data the application cannot create for itself:
--   - one director account, since nothing can create a staff account except an
--     already-authenticated staff member (this is how you bootstrap first login)
--   - courts, so the event has a starting set (directors can add/remove more from Settings)
--   - settings, since bracket/pool-play logic reads these with no fallback default
-- Everything else (pools, teams, matches, games, staff beyond the director) is
-- created through the running application itself.
--
-- The seeded director's password is: ChangeMe123!  Change it after first login.

BEGIN;

INSERT INTO staff (name, email, password_hash, assigned_court, contact) VALUES
  ('Dana Alvarez', 'dana.alvarez@summersmash.example', '$2b$12$bgRmM/SUrjrgFputiSXpKOdtxNErW1YHLCoTkhOH64PXi8tokS9MO', 'All Courts', 'dana.alvarez@summersmash.example');

INSERT INTO staff_roles (staff_id, role) VALUES
  ((SELECT id FROM staff WHERE email='dana.alvarez@summersmash.example'), 'director');

INSERT INTO courts (label, status, note) VALUES
  ('Court 1', 'open', NULL),
  ('Court 2', 'open', NULL),
  ('Court 3', 'open', NULL);

-- pool_play_format / bracket_format / qualifiers_per_pool are legacy keys from the old
-- generic pool-play + bracket flow. League/Super4/Final match formats are now hardcoded
-- in app/routers/pools.py and app/routers/matches.py, not read from these settings.
INSERT INTO settings (key, value) VALUES
  ('tournament_info', '{"name": "Pickleball Championship", "venue": "Infocity", "event_date": "2026-08-21", "checkin_open_time": "17:00"}'),
  ('pool_play_format', '{"target_score": 11, "win_by": 1, "best_of": 1, "scoring": "rally"}'),
  ('bracket_format', '{"target_score": 11, "win_by": 2, "best_of": 3, "scoring": "rally"}'),
  ('qualifiers_per_pool', '2');

INSERT INTO match_formats (label, target_score, win_by, best_of) VALUES
  ('Points 11 - Set 1', 11, 2, 1),
  ('Points 11 - Set 3', 11, 2, 3);

COMMIT;
