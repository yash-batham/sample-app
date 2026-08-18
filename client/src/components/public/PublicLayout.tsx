import { Outlet } from "react-router-dom";
import { PublicNav } from "./PublicNav";
import { PublicTabBar } from "./PublicTabBar";
import { LiveNotificationBar } from "./LiveNotificationBar";

export function PublicLayout() {
  return (
    <div className="pb-30">
      <PublicNav />

      <LiveNotificationBar />

      <Outlet />

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 mt-4 border-t border-slate-200 text-sm text-slate-400 flex items-center justify-center gap-2">
        {/* <Link to="/admin/login" className="font-semibold text-slate-500 hover:text-teal-700">
          Tournament Staff Login
        </Link> */}
        From the players, for the players.
      </footer>

      <PublicTabBar />
    </div>
  );
}
