import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../hooks/useToast";

const themeOptions = [
  {
    code: "light",
    title: "Light Mode",
    summary: "Bright, calm, and ideal for working with statements during the day.",
  },
  {
    code: "dark",
    title: "Dark Mode",
    summary: "Lower glare and stronger contrast for evening work and longer sessions.",
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const toast = useToast();
  const { deleteAccount, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Settings</span>
          <h2>Control the workspace look and your account safely.</h2>
          <p className="lead">
            Change the app theme, review the active workspace, and manage irreversible account
            actions from one clear place.
          </p>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Appearance</span>
              <h3>Theme</h3>
            </div>
          </div>

          <div className="settings-grid">
            {themeOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                className={`theme-card${theme === option.code ? " theme-card--active" : ""}`}
                onClick={() => setTheme(option.code)}
              >
                <strong>{option.title}</strong>
                <span>{option.summary}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Workspace</span>
              <h3>Account summary</h3>
            </div>
          </div>

          <div className="stack">
            <div className="summary-line">
              <strong>Email</strong>
              <span>{user?.email}</span>
            </div>
            <div className="summary-line">
              <strong>Plan</strong>
              <span>{user?.plan_code || "free"}</span>
            </div>
            <div className="summary-line">
              <strong>Role</strong>
              <span>{user?.role || "member"}</span>
            </div>
            <div className="summary-line">
              <strong>Default company</strong>
              <span>{user?.default_company?.name || "Not set"}</span>
            </div>
            <div className="summary-line">
              <strong>Business type</strong>
              <span>{user?.default_company?.business_type || "Not set"}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="panel stack danger-zone">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Danger Zone</span>
            <h3>Delete account</h3>
          </div>
        </div>

        <p className="lead">
          This permanently deletes your account when the backend allows it. If you are the last
          owner in the organization, the API will block the action until another owner exists.
        </p>

        <form className="stack settings-form" onSubmit={submitDeleteAccount}>
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
          </div>
        </form>
      </section>
    </section>
  );
}
