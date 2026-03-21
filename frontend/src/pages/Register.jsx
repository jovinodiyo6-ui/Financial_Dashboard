import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Register() {
  const navigate = useNavigate();
  const { register, isAuthenticated, loading } = useAuth();
  const [form, setForm] = useState({
    org: "",
    email: "",
    password: "",
    business_type: "sole_proprietor",
  });
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
      await register(form);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="landing-shell auth-shell">
      <div className="landing-story">
        <span className="eyebrow">Launch Faster</span>
        <h1>Start your finance workspace with structure from day one.</h1>
        <p className="lead">
          Set up the business once, then let the backend drive dashboards, billing, and AI
          insights from a clean product surface.
        </p>

        <div className="story-grid">
          <article className="story-card">
            <strong>Backend as truth</strong>
            <span>No spreadsheet drift. No duplicated calculations in the UI.</span>
          </article>
          <article className="story-card">
            <strong>Built for Kenya</strong>
            <span>KES pricing, M-Pesa upgrades, and finance language your users already understand.</span>
          </article>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Create Account</span>
          <h2>Start with a clean product-mode frontend</h2>
        </div>

        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Organization</span>
            <input
              value={form.org}
              onChange={(event) => setForm((current) => ({ ...current, org: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Business Type</span>
            <select
              value={form.business_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, business_type: event.target.value }))
              }
            >
              <option value="sole_proprietor">Sole proprietor</option>
              <option value="partnership">Partnership</option>
              <option value="manufacturing">Manufacturing</option>
            </select>
          </label>

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
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Creating..." : "Register"}
          </button>
        </form>

        <p className="auth-link-row">
          Already have access? <Link to="/login">Login</Link>
        </p>
      </div>
    </section>
  );
}
