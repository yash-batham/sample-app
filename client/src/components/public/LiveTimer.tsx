import { useEffect, useState } from "react";

function elapsed(startedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function LiveTimer({ startedAt, className = "" }: { startedAt: string | null; className?: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  return <span className={`tabular ${className}`}>{elapsed(startedAt)}</span>;
}
