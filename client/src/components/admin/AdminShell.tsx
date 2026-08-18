import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Link, Outlet, useLocation, useOutletContext } from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Button from "@mui/material/Button";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { getErrorMessage } from "../../api/errorMessage";
import { useToast } from "../../context/ToastContext";
import type { NotificationLevel } from "../../types";

interface AdminHeaderState {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

type AdminOutletContext = { setHeader: (header: AdminHeaderState) => void };

export function useAdminHeader(header: AdminHeaderState) {
  const { setHeader } = useOutletContext<AdminOutletContext>();
  useEffect(() => {
    setHeader(header);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.title, header.subtitle, header.actions]);
}

const LINKS = [
  {
    to: "/admin",
    label: "Overview",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    to: "/admin/matches",
    label: "Matches",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 9h16" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/admin/standings",
    label: "Pools & Standings",
    icon: <path d="M4 19V10M12 19V4M20 19v-7" strokeLinecap="round" />,
  },
  {
    to: "/admin/teams",
    label: "Teams",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
        <circle cx="17.5" cy="8.5" r="2.3" />
        <path d="M15.5 14.3c2.9.3 5 2.3 5 5.2" />
      </>
    ),
  },
  {
    to: "/admin/schedule",
    label: "Courts & Schedule",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
      </>
    ),
  },
  {
    to: "/admin/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    ),
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AdminShell() {
  const { staff, logout } = useAuth();
  const location = useLocation();
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down("sm"));
  const { showError, showSuccess } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [header, setHeader] = useState<AdminHeaderState>({ title: "" });
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyLevel, setNotifyLevel] = useState<NotificationLevel>("info");
  const [sendingNotify, setSendingNotify] = useState(false);

  const outletContext = useMemo<AdminOutletContext>(() => ({ setHeader }), []);

  async function sendNotification() {
    if (!notifyMessage.trim()) return;
    setSendingNotify(true);
    try {
      await api.post("/api/notifications", { message: notifyMessage.trim(), level: notifyLevel });
      showSuccess("Notification pushed");
      setNotifyOpen(false);
      setNotifyMessage("");
      setNotifyLevel("info");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSendingNotify(false);
    }
  }

  return (
    <div className="admin-shell">
      {sidebarOpen && <div className="admin-sidebar-backdrop lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`admin-sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="pb-nav__brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
              <circle cx="9" cy="9" r="1.2" fill="white" />
              <circle cx="15" cy="9" r="1.2" fill="white" />
              <circle cx="9" cy="15" r="1.2" fill="white" />
              <circle cx="15" cy="15" r="1.2" fill="white" />
              <circle cx="12" cy="12" r="1.2" fill="white" />
            </svg>
          </span>
          <div className="leading-tight">
            {/* <p className="font-display font-bold text-white text-sm">Welcome to</p> */}
            <p className="text-[0.62rem] text-slate-400 uppercase tracking-wider font-bold">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 py-2 space-y-0.5">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/admin"}
              className={({ isActive }) => `admin-sidebar__link${isActive ? " is-active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {link.icon}
              </svg>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 mb-3">
            <span className="avatar" style={{ width: 34, height: 34, fontSize: "0.8rem", background: "var(--pb-orange-500)" }}>
              {staff ? initials(staff.name) : "?"}
            </span>
            <div className="leading-tight">
              <p className="text-white text-sm font-semibold">{staff?.name}</p>
              <p className="text-[0.68rem] text-slate-400 capitalize">
                {staff?.roles.map((r) => r.replace("_", " ")).join(", ")}
              </p>
            </div>
          </div>
          <button className="admin-sidebar__link !px-2 w-full" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" />
              <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Log Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="admin-topbar">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-2 -ml-2 text-slate-500" onClick={() => setSidebarOpen((v) => !v)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                </svg>
              </button>
              <div>
                <h1 className="font-display font-bold text-lg text-slate-800 leading-tight">{header.title}</h1>
                {header.subtitle && <p className="text-xs text-slate-400">{header.subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/" className="btn btn-outline btn-sm hidden sm:inline-flex">
                View Public Site
              </Link>
              <button
                className="btn btn-outline btn-sm !px-2"
                title="Push public announcement"
                onClick={() => setNotifyOpen(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {header.actions}
            </div>
          </div>
        </div>

        <main className="p-4 sm:p-6 space-y-7">
          <Outlet key={location.pathname} context={outletContext} />
        </main>
      </div>

      <Dialog open={notifyOpen} onClose={() => setNotifyOpen(false)} fullWidth maxWidth="sm" fullScreen={fullScreenDialog}>
        <DialogTitle>Push Public Announcement</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              label="Message"
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel id="notify-level-label">Level</InputLabel>
              <Select
                labelId="notify-level-label"
                label="Level"
                value={notifyLevel}
                onChange={(e) => setNotifyLevel(e.target.value as NotificationLevel)}
              >
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotifyOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={sendNotification} disabled={!notifyMessage.trim() || sendingNotify}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
