export type StaffRole = "director" | "referee" | "checkin_desk" | "court_marshal";

export interface Staff {
  id: number;
  name: string;
  email: string;
  roles: StaffRole[];
  assigned_court: string | null;
  contact: string | null;
}

export interface Pool {
  id: number;
  label: string;
  team_count: number;
}

export type CourtStatus = "open" | "live" | "delayed" | "maintenance";

export interface Court {
  id: number;
  label: string;
  status: CourtStatus;
  note: string | null;
  current_match_id: number | null;
}

export type TeamStatus = "registered" | "withdrawn";

export interface Team {
  id: number;
  name: string;
  player1_name: string;
  player1_phone: string | null;
  player1_email: string | null;
  player2_name: string;
  player2_phone: string | null;
  player2_email: string | null;
  seed: number | null;
  rating: number | null;
  pool_id: number | null;
  pool_label: string | null;
  status: TeamStatus;
  wins: number;
  losses: number;
}

export type MatchStage = "league" | "super4" | "final";
export type MatchStatus = "unscheduled" | "upcoming" | "live" | "delayed" | "completed" | "forfeited";
export type Side = "a" | "b";

export interface GameOut {
  id: number;
  game_number: number;
  score_a: number;
  score_b: number;
  winner: Side | null;
}

export interface EventOut {
  id: number;
  event_type: string;
  description: string;
  created_by: number | null;
  created_at: string;
}

export interface Match {
  id: number;
  stage: MatchStage;
  round_label: string | null;
  pool_id: number | null;
  pool_label: string | null;
  team_a_id: number | null;
  team_a_name: string | null;
  team_b_id: number | null;
  team_b_name: string | null;
  placeholder_label_a: string | null;
  placeholder_label_b: string | null;
  court_id: number | null;
  court_label: string | null;
  scheduled_time: string | null;
  status: MatchStatus;
  delay_reason: string | null;
  winner_team_id: number | null;
  forfeit_reason: string | null;
  format_target: number;
  format_win_by: number;
  format_best_of: number;
  started_at: string | null;
  started_by: number | null;
  started_by_name: string | null;
  games: GameOut[];
  events: EventOut[];
}

export interface TeamStanding {
  team_id: number;
  team_name: string;
  wins: number;
  losses: number;
  games_won: number;
  games_lost: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  rank: number;
  is_qualifying: boolean;
  tiebreak_note: string | null;
}

export interface PoolStandings {
  pool_id: number;
  pool_label: string;
  total_matches: number;
  completed_matches: number;
  teams: TeamStanding[];
}

export interface StageStandings {
  stage: string;
  total_matches: number;
  completed_matches: number;
  teams: TeamStanding[];
}

export interface MatchFormatPreset {
  id: number;
  label: string;
  target_score: number;
  win_by: number;
  best_of: number;
}

export type NotificationLevel = "info" | "warning" | "critical";

export interface LiveNotification {
  id: number;
  message: string;
  level: NotificationLevel;
  created_at: string;
}

export interface TimelineBlock {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
}

export interface SettingsData {
  values: Record<string, any>;
  timeline: TimelineBlock[];
}

export interface DashboardOverview {
  stats: {
    total_matches: number;
    live_now: number;
    completed: number;
    teams_registered: number;
  };
  courts: Array<{
    id: number;
    label: string;
    status: CourtStatus;
    note: string | null;
    match_id: number | null;
    team_a_name: string | null;
    team_b_name: string | null;
    scheduled_time: string | null;
  }>;
  ready_queue: Array<{
    id: number;
    round_label: string | null;
    team_a_name: string;
    team_b_name: string;
    pool_label: string | null;
  }>;
  alerts: Array<{ level: "info" | "warning" | "critical"; message: string }>;
}
