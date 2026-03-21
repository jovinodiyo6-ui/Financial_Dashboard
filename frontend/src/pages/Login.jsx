import { useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(form);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="landing-shell auth-shell">
      <div className="landing-story">
        <span className="eyebrow">Sign In</span>
        <h1>Walk back into the finance picture fast.</h1>
        <p className="lead">
          Your dashboard, billing controls, and AI CFO workspace are ready as soon as your
          session reconnects.
        </p>

        <div className="story-grid">
          <article className="story-card">
            <strong>Daily clarity</strong>
            <span>See profit, receivables, expenses, and tax signals in one place.</span>
          </article>
          <article className="story-card">
            <strong>Fewer clicks</strong>
            <span>Create invoices, bills, and payment upgrades directly from the workspace.</span>
          </article>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Sign In</span>
          <h2>Connect to your backend-driven finance workspace</h2>
        </div>

        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="auth-link-row">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </section>
  );
}
