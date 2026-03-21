import { useEffect, useState } from "react";
import Loader from "../components/Loader";
import { useApi } from "../hooks/useApi";

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function Billing() {
  const { billing } = useApi();
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [phone, setPhone] = useState("");
  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [plansPayload, summaryPayload] = await Promise.all([
        billing.getBillingPlans(),
        billing.getBillingSummary(),
      ]);
      setPlans(Array.isArray(plansPayload?.items) ? plansPayload.items : []);
      setSummary(summaryPayload);
    } catch (err) {
      setError(err.message || "Failed to load billing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePay = async (plan) => {
    setSubmitting(plan.code);
    setError("");
    try {
      const payload = await billing.startMpesaPayment(phone, plan.local_price_kes, plan.code);
      setCheckout(payload);
      await load();
    } catch (err) {
      setError(err.message || "Payment failed.");
    } finally {
      setSubmitting("");
    }
  };

  const refreshCheckout = async () => {
    if (!checkout?.id) {
      return;
    }
    try {
      const payload = await billing.getMpesaRequestStatus(checkout.id);
      setCheckout(payload);
      await load();
    } catch (err) {
      setError(err.message || "Failed to refresh checkout.");
    }
  };

  if (loading) {
    return <Loader label="Loading billing..." />;
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <span className="eyebrow">Billing</span>
          <h2>Upgrade plans without putting payment logic in the UI</h2>
        </div>
      </header>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="panel stack">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Current Plan</span>
            <h3>{summary?.plan_label || "Starter"}</h3>
          </div>
        </div>

        <div className="billing-meta">
          <p>Subscription status: {summary?.subscription_status || "free"}</p>
          <p>
            Company slots: {summary?.company_count || 0} / {summary?.max_companies || 1}
          </p>
          <p>AI enabled: {summary?.ai_enabled ? "Yes" : "No"}</p>
        </div>

        <label className="field">
          <span>M-Pesa Phone</span>
          <input
            placeholder="2547XXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </section>

      <div className="plan-grid">
        {plans.map((plan) => (
          <section key={plan.code} className={`pricing-card${summary?.plan_code === plan.code ? " pricing-card--active" : ""}`}>
            <div className="pricing-head">
              <strong>{plan.label}</strong>
              <span>{formatKes(plan.local_price_kes)} / month</span>
            </div>
            <p>{plan.summary}</p>
            <ul className="feature-list">
              {(plan.features || []).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              type="button"
              className="primary-button"
              disabled={summary?.plan_code === plan.code || submitting === plan.code}
              onClick={() => handlePay(plan)}
            >
              {summary?.plan_code === plan.code
                ? "Current Plan"
                : submitting === plan.code
                  ? "Starting..."
                  : "Pay with M-Pesa"}
            </button>
          </section>
        ))}
      </div>

      {checkout ? (
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Checkout Status</span>
              <h3>{checkout.status}</h3>
            </div>
          </div>

          <p className="lead">
            {checkout.external_reference || checkout.checkout_request_id || "Preview checkout created."}
          </p>

          <button type="button" className="ghost-button" onClick={refreshCheckout}>
            Refresh Checkout
          </button>
        </section>
      ) : null}
    </section>
  );
}
