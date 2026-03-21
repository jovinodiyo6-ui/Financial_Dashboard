import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import SystemStatusPill from "./SystemStatusPill";

const THEME_KEY = "financepro_theme";

const readTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function Navbar() {
  const navigate = useNavigate();
  const toast = useToast();
  const { deleteAccount, logout, user } = useAuth();
  const onboardingComplete = Boolean(user?.default_company?.onboarding_complete);
  const [theme, setTheme] = useState(readTheme);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const themeLabel = useMemo(() => (theme === "dark" ? "Light Mode" : "Dark Mode"), [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const submitDeleteAccount = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount({ password });
      toast.success("Account deleted", "Your workspace account has been deleted successfully.");
      navigate("/", { replace: true });
    } catch (error) {
      setDeleteError(error.message || "We could not delete the account.");
      toast.error("Delete failed", error.message || "We could not delete the account.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="eyebrow">Control Tower</span>
        <strong>Finance Control Tower</strong>
      </div>

      <nav className="topbar__nav">
        {!onboardingComplete ? (
          <NavLink to="/setup" className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
            Setup
          </NavLink>
        ) : null}
        {onboardingComplete ? (
          <>
            <NavLink to="/app" end className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
              Dashboard
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
              Reports
            </NavLink>
            <NavLink to="/entries" className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
              Entries
            </NavLink>
            <NavLink to="/billing" className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
              Billing
            </NavLink>
          </>
        ) : null}
      </nav>

      <div className="topbar__actions">
        <SystemStatusPill />
        <span className="status-pill">{user?.plan_code || "free"}</span>
        <span className="topbar__meta">{user?.email}</span>
        <button type="button" className="ghost-button" onClick={toggleTheme}>
          {themeLabel}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setShowAccountPanel((current) => !current);
            setDeleteError("");
          }}
        >
          Account
        </button>
        <button type="button" className="ghost-button" onClick={logout}>
          Logout
        </button>
      </div>

      {showAccountPanel ? (
        <div className="account-popover">
          <div className="account-popover__header">
            <span className="eyebrow">Account Controls</span>
            <strong>{user?.email}</strong>
          </div>

          <p className="lead">
            Delete your account from here. This action is permanent and requires your password.
          </p>

          <form className="stack" onSubmit={submitDeleteAccount}>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {deleteError ? <div className="form-error">{deleteError}</div> : null}

            <div className="button-row">
              <button type="submit" className="danger-button" disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Account"}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setShowAccountPanel(false);
                  setDeleteError("");
                  setPassword("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </header>
  );
}
