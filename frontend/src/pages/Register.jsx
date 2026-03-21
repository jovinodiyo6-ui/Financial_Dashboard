import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast();
  const { register, isAuthenticated, loading } = useAuth();
  const [form, setForm] = useState({
    org: "",
    email: "",
    password: "",
    business_type: "sole_proprietor",
  });
  const [partnerNames, setPartnerNames] = useState(["", ""]);
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
      const payload = {
        ...form,
        partner_names:
          form.business_type === "partnership"
            ? partnerNames.map((name) => name.trim()).filter(Boolean)
            : [],
      };
      await register(payload);
      toast.success("Workspace created", "Your account is ready and your session is active.");
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed.");
      toast.error("Registration failed", err.message || "We could not create the account.");
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
              required
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
              <option value="company">Company</option>
            </select>
          </label>

          {form.business_type === "partnership" ? (
            <div className="stack">
              <label className="field">
                <span>Partner 1</span>
                <input
                  required
                  value={partnerNames[0] || ""}
                  onChange={(event) =>
                    setPartnerNames((current) => [event.target.value, current[1] || "", ...current.slice(2)])
                  }
                />
              </label>
              <label className="field">
                <span>Partner 2</span>
                <input
                  required
                  value={partnerNames[1] || ""}
                  onChange={(event) =>
                    setPartnerNames((current) => [current[0] || "", event.target.value, ...current.slice(2)])
                  }
                />
              </label>

              {partnerNames.slice(2).map((name, index) => (
                <div key={`extra-partner-${index}`} className="partner-name-row">
                  <label className="field">
                    <span>Partner {index + 3}</span>
                    <input
                      value={name}
                      onChange={(event) =>
                        setPartnerNames((current) =>
                          current.map((item, partnerIndex) =>
                            partnerIndex === index + 2 ? event.target.value : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setPartnerNames((current) => current.filter((_, partnerIndex) => partnerIndex !== index + 2))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="button-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPartnerNames((current) => [...current, ""])}
                >
                  Add Partner
                </button>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength="8"
              autoComplete="new-password"
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
