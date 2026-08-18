import type { Match, MatchStatus } from "../../types";

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<MatchStatus, (m: Match) => string> = {
  live: () => "Live",
  upcoming: (m) => formatTime(m.scheduled_time),
  completed: () => "COMPLETED",
  delayed: () => "Delayed",
  forfeited: () => "Forfeited",
  unscheduled: () => "Unscheduled",
};

// components.css only defines is-live/is-upcoming/is-completed/is-delayed —
// map the two extra backend statuses onto the closest visual variant.
const STATUS_CLASS: Record<MatchStatus, string> = {
  live: "is-live",
  upcoming: "is-upcoming",
  completed: "is-completed",
  delayed: "is-delayed",
  forfeited: "is-completed",
  unscheduled: "is-upcoming",
};

export function StatusBadge({ match, label }: { match: Match; label?: string }) {
  return (
    <span className={`status-badge ${STATUS_CLASS[match.status]}`}>
      <span className="status-badge__dot" />
      {label ?? STATUS_LABEL[match.status](match)}
    </span>
  );
}
