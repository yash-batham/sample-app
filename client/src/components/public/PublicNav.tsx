import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useDashboardOverview } from "../../api/hooks";
import { useSocketInvalidate } from "../../hooks/useSocketInvalidate";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  // { to: "/standings", label: "Standings" },
  { to: "/bracket", label: "Standings" },
  { to: "/matches", label: "Schedule" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const { data } = useDashboardOverview();
  useSocketInvalidate(["match:updated", "match:completed"], [["dashboard-overview"]]);
  const liveNow = data?.stats.live_now ?? 0;

  return (
    <header className="pb-nav">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3">
            <span className="pb-nav__brand-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
                <circle cx="9" cy="9" r="1.2" fill="white" />
                <circle cx="15" cy="9" r="1.2" fill="white" />
                <circle cx="9" cy="15" r="1.2" fill="white" />
                <circle cx="15" cy="15" r="1.2" fill="white" />
                <circle cx="12" cy="12" r="1.2" fill="white" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block font-display font-bold text-base text-slate-800">Game on.</span>
              {/* <span className="block text-[0.65rem] font-semibold text-slate-400 uppercase tracking-wider">
                Championship 2026
              </span> */}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) => `pb-nav__link${isActive ? " is-active" : ""}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {liveNow > 0 && (
              <span className="live-pill">
                <span className="live-pill__dot" /> {liveNow} LIVE NOW
              </span>
            )}
            <Link to="/admin/login" className="btn btn-outline btn-sm">
              Admin Login
            </Link>
          </div>

          <button
            className="md:hidden p-2 -mr-2 text-slate-600"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`pb-nav__mobile-panel md:hidden${open ? " is-open" : ""}`}>
        <div className="px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => `pb-nav__link !py-2${isActive ? " is-active" : ""}`}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <Link to="/admin/login" className="pb-nav__link !py-2" onClick={() => setOpen(false)}>
            Admin Login
          </Link>
          {liveNow > 0 && (
            <span className="live-pill mt-2 w-fit">
              <span className="live-pill__dot" /> {liveNow} LIVE NOW
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
