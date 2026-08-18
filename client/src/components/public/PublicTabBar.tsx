import { NavLink } from "react-router-dom";

export function PublicTabBar() {
  return (
    <nav className="pb-tabbar">
      <NavLink to="/" end className={({ isActive }) => `pb-tabbar__item${isActive ? " is-active" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Dashboard
      </NavLink>
      <NavLink to="/standings" className={({ isActive }) => `pb-tabbar__item${isActive ? " is-active" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19V10M12 19V4M20 19v-7" strokeLinecap="round" />
        </svg>
        Standings
      </NavLink>
      <NavLink to="/matches" className={({ isActive }) => `pb-tabbar__item${isActive ? " is-active" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9h16" strokeLinecap="round" />
        </svg>
        Schedule
      </NavLink>
      <NavLink to="/teams" className={({ isActive }) => `pb-tabbar__item${isActive ? " is-active" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" />
        </svg>
        Teams
      </NavLink>
    </nav>
  );
}
