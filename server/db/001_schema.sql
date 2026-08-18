-- Summer Smash Pickleball Championship — schema
-- Run manually against a PostgreSQL database: psql -d <dbname> -f 001_schema.sql

BEGIN;

CREATE TYPE staff_role AS ENUM ('director', 'referee', 'checkin_desk', 'court_marshal');
CREATE TYPE court_status AS ENUM ('open', 'live', 'delayed', 'maintenance');
CREATE TYPE team_status AS ENUM ('registered', 'withdrawn');
CREATE TYPE match_stage AS ENUM ('league', 'super4', 'final');
CREATE TYPE match_status AS ENUM ('unscheduled', 'upcoming', 'live', 'delayed', 'completed', 'forfeited');
CREATE TYPE match_side AS ENUM ('a', 'b');
CREATE TYPE match_event_type AS ENUM ('point_correction', 'timeout', 'injury', 'forfeit', 'delay', 'note');

CREATE TABLE staff (
    id            SERIAL PRIMARY KEY,
    name          text NOT NULL UNIQUE,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    assigned_court text,
    contact       text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- A staff member can hold more than one role (e.g. a director who also referees);
-- the director decides which roles are assigned to each account.
CREATE TABLE staff_roles (
    staff_id integer NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    role     staff_role NOT NULL,
    PRIMARY KEY (staff_id, role)
);

CREATE TABLE pools (
    id         SERIAL PRIMARY KEY,
    label      text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courts (
    id         SERIAL PRIMARY KEY,
    label      text NOT NULL UNIQUE,
    status     court_status NOT NULL DEFAULT 'open',
    note       text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id             SERIAL PRIMARY KEY,
    name           text NOT NULL,
    player1_name   text NOT NULL,
    player1_phone  text,
    player1_email  text,
    player2_name   text NOT NULL,
    player2_phone  text,
    player2_email  text,
    seed           integer,
    rating         numeric(4,2),
    pool_id        integer REFERENCES pools(id) ON DELETE SET NULL,
    status         team_status NOT NULL DEFAULT 'registered',
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
    id                     SERIAL PRIMARY KEY,
    stage                  match_stage NOT NULL,
    round_label            text,
    pool_id                integer REFERENCES pools(id) ON DELETE SET NULL,
    team_a_id              integer REFERENCES teams(id) ON DELETE SET NULL,
    team_b_id              integer REFERENCES teams(id) ON DELETE SET NULL,
    placeholder_label_a    text,
    placeholder_label_b    text,
    court_id               integer REFERENCES courts(id) ON DELETE SET NULL,
    scheduled_time         timestamptz,
    status                 match_status NOT NULL DEFAULT 'unscheduled',
    delay_reason           text,
    winner_team_id         integer REFERENCES teams(id) ON DELETE SET NULL,
    forfeit_reason         text,
    format_target          integer NOT NULL DEFAULT 11,
    format_win_by          integer NOT NULL DEFAULT 2,
    format_best_of         integer NOT NULL DEFAULT 3,
    started_by             integer REFERENCES staff(id) ON DELETE SET NULL,
    started_at             timestamptz,
    completed_at           timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE games (
    id           SERIAL PRIMARY KEY,
    match_id     integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    game_number  integer NOT NULL,
    score_a      integer NOT NULL DEFAULT 0,
    score_b      integer NOT NULL DEFAULT 0,
    last_scorer_side match_side,
    winner       match_side,
    completed_at timestamptz,
    UNIQUE (match_id, game_number)
);

CREATE TABLE match_events (
    id          SERIAL PRIMARY KEY,
    match_id    integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    event_type  match_event_type NOT NULL,
    description text NOT NULL,
    created_by  integer REFERENCES staff(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
);

CREATE TABLE timeline_blocks (
    id         SERIAL PRIMARY KEY,
    label      text NOT NULL,
    start_time timestamp NOT NULL,
    end_time   timestamp NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE match_formats (
    id           SERIAL PRIMARY KEY,
    label        text NOT NULL UNIQUE,
    target_score integer NOT NULL,
    win_by       integer NOT NULL,
    best_of      integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE notification_level AS ENUM ('info', 'warning', 'critical');

CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    message    text NOT NULL,
    level      notification_level NOT NULL DEFAULT 'info',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_roles_staff_id ON staff_roles(staff_id);
CREATE INDEX idx_teams_pool_id ON teams(pool_id);
CREATE INDEX idx_matches_pool_id ON matches(pool_id);
CREATE INDEX idx_matches_court_id ON matches(court_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_team_a_id ON matches(team_a_id);
CREATE INDEX idx_matches_team_b_id ON matches(team_b_id);
CREATE INDEX idx_games_match_id ON games(match_id);
CREATE INDEX idx_match_events_match_id ON match_events(match_id);

COMMIT;
