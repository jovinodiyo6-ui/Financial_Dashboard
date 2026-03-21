import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const plans = [
  {
    name: "Starter",
    price: "KES 0",
    summary: "For founders who need clean numbers and a calm daily finance view.",
    features: ["Live dashboard", "Invoices and bills", "Core reports"],
  },
  {
    name: "Pro",
    price: "KES 900",
    summary: "For growing teams that want better control over cash and operations.",
    features: ["Multi-company workspace", "Advanced billing", "Priority workflows"],
  },
  {
    name: "AI CFO",
    price: "KES 1,500",
    summary: "For businesses that want decisions, not just data.",
    features: ["AI recommendations", "Scenario prompts", "Actionable finance coaching"],
  },
];

const pillars = [
  {
    title: "Know the truth",
    body: "Revenue, expenses, profit, receivables, and tax stay anchored to the backend you trust.",
  },
  {
    title: "Act faster",
    body: "Capture invoices, bills, and payment upgrades without stuffing financial logic into React.",
  },
  {
    title: "Think like a CFO",
    body: "Use AI prompts and finance alerts to turn raw activity into next actions for the business.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="landing-shell">
      <div className="landing-story">
        <span className="eyebrow">AI CFO For Kenyan Businesses</span>
        <h1>Finance clarity that feels calm, sharp, and ready to scale.</h1>
        <p className="lead">
          Replace spreadsheet guesswork with a live finance workspace for profit, cash flow,
          billing, and action-focused AI guidance.
        </p>

        <div className="hero-actions">
          <Link className="primary-button" to={isAuthenticated ? "/app" : "/register"}>
            {isAuthenticated ? "Open Workspace" : "Start Free"}
          </Link>
          <Link className="ghost-button ghost-button--light" to={isAuthenticated ? "/billing" : "/login"}>
            {isAuthenticated ? "View Billing" : "Sign In"}
          </Link>
        </div>

        <div className="story-grid">
          {pillars.map((pillar) => (
            <article key={pillar.title} className="story-card">
              <strong>{pillar.title}</strong>
              <span>{pillar.body}</span>
            </article>
          ))}
        </div>

        <div className="pricing-strip">
          {plans.map((plan) => (
            <article key={plan.name} className="pricing-card">
              <div className="pricing-head">
                <strong>{plan.name}</strong>
                <span>{plan.price}</span>
              </div>
              <p>{plan.summary}</p>
              <ul className="feature-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <aside className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">Why This Product Wins</span>
          <h2>Built for operators who need answers, not accounting theater.</h2>
        </div>

        <div className="stack">
          <div className="insight-card">
            <strong>Backend-first architecture</strong>
            <p>The frontend stays thin. The finance engine, billing rules, and AI logic stay authoritative.</p>
          </div>
          <div className="insight-card">
            <strong>Kenya-native workflows</strong>
            <p>KES pricing, M-Pesa upgrade flows, and local business language are already part of the product.</p>
          </div>
          <div className="insight-card">
            <strong>Launch-ready focus</strong>
            <p>You can log in, see numbers, create activity, and upgrade plans without touching the legacy stack.</p>
          </div>
        </div>

        <div className="auth-cta">
          <Link className="primary-button" to={isAuthenticated ? "/app" : "/register"}>
            {isAuthenticated ? "Go To Dashboard" : "Create Account"}
          </Link>
          <p className="auth-link-row">
            Already have access? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </aside>
    </section>
  );
}
