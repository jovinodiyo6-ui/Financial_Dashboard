import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SystemStatusPill from "./SystemStatusPill";

export default function Navbar() {
  const { logout, user } = useAuth();
  const onboardingComplete = Boolean(user?.default_company?.onboarding_complete);

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
        <button type="button" className="ghost-button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
