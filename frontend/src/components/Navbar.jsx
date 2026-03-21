import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Navbar() {
  const { logout, user } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="eyebrow">Product Mode</span>
        <strong>Finance Control Tower</strong>
      </div>

      <nav className="topbar__nav">
        <NavLink to="/" end className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
          Dashboard
        </NavLink>
        <NavLink to="/billing" className={({ isActive }) => `topbar__link${isActive ? " topbar__link--active" : ""}`}>
          Billing
        </NavLink>
      </nav>

      <div className="topbar__actions">
        <span className="topbar__meta">{user?.email}</span>
        <button type="button" className="ghost-button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
