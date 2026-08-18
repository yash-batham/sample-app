import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { muiTheme } from "./theme/muiTheme";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ToastProvider } from "./context/ToastContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PublicLayout } from "./components/public/PublicLayout";
import { AdminShell } from "./components/admin/AdminShell";

import Dashboard from "./pages/public/Dashboard";
import Standings from "./pages/public/Standings";
import Bracket from "./pages/public/Bracket";
import Matches from "./pages/public/Matches";
import MatchDetail from "./pages/public/MatchDetail";
import TeamsList from "./pages/public/TeamsList";
import TeamProfile from "./pages/public/TeamProfile";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminMatches from "./pages/admin/AdminMatches";
import AdminScore from "./pages/admin/AdminScore";
import AdminTeams from "./pages/admin/AdminTeams";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminStandings from "./pages/admin/AdminStandings";
import AdminSettings from "./pages/admin/AdminSettings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/matches/:id" element={<MatchDetail />} />
          <Route path="/teams" element={<TeamsList />} />
          <Route path="/teams/:id" element={<TeamProfile />} />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminOverview />} />
            <Route path="matches" element={<AdminMatches />} />
            <Route path="matches/:id/score" element={<AdminScore />} />
            <Route path="teams" element={<AdminTeams />} />
            <Route path="schedule" element={<AdminSchedule />} />
            <Route path="standings" element={<AdminStandings />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
