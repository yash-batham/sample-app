import { useEffect, useState } from "react";
import { useNotifications } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";

const AUTO_DISMISS_MS = 10_000;

export function LiveNotificationBar() {
  const { data } = useNotifications();
  const [dismissed, setDismissed] = useState<number[]>([]);

  useSocketInvalidate(["notification:new"], [["notifications"]]);

  const visible = (data ?? []).filter((n) => !dismissed.includes(n.id));

  useEffect(() => {
    const timers = visible.map((n) =>
      setTimeout(() => setDismissed((d) => [...d, n.id]), AUTO_DISMISS_MS)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((n) => n.id).join(",")]);

  if (visible.length === 0) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 space-y-2">
      {visible.map((n) => (
        <div key={n.id} className={`alert-banner is-${n.level}`}>
          <span className="flex-1">{n.message}</span>
          <button
            className="alert-banner__dismiss"
            onClick={() => setDismissed((d) => [...d, n.id])}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
