import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../api/errorMessage";

export default function AdminLogin() {
  const { login, staff, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (staff) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from ? (from as any).pathname ?? "/admin" : "/admin"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(name, password);
      const from = (location.state as { from?: Location })?.from;
      navigate(from ? (from as any).pathname ?? "/admin" : "/admin", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(circle at 20% 20%, var(--pb-teal-700), var(--pb-blue-900) 60%)" }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-white">
          <span className="pb-nav__brand-mark mb-3" style={{ width: 52, height: 52 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
              <circle cx="9" cy="9" r="1.2" fill="white" />
              <circle cx="15" cy="9" r="1.2" fill="white" />
              <circle cx="9" cy="15" r="1.2" fill="white" />
              <circle cx="15" cy="15" r="1.2" fill="white" />
              <circle cx="12" cy="12" r="1.2" fill="white" />
            </svg>
          </span>
          <p className="font-display font-bold text-lg">PickleBall</p>
          <p className="text-xs uppercase tracking-widest text-teal-200 font-bold">Tournament Staff Access</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-7 sm:p-8">
          <h1 className="font-display font-bold text-2xl text-slate-800 mb-1">Admin Login</h1>
          <p className="text-sm text-slate-400 mb-6">Sign in to manage matches, pools, and live scoring.</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">Name</label>
              <input
                type="text"
                required
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
            </div>

            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full !py-2.5 !text-sm">
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/70 text-sm mt-6">
          <Link to="/" className="font-semibold text-white hover:underline">
            &larr; Back to public site
          </Link>
        </p>
      </div>
    </div>
  );
}
