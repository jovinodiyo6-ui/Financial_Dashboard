import { useEffect, useState } from "react";
import Loader from "../components/Loader";
import { useApi } from "../hooks/useApi";

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const normalisePhone = (value) => value.replace(/[^\d]/g, "");

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
    const cleanedPhone = normalisePhone(phone);
    if (!/^2547\d{8}$/.test(cleanedPhone)) {
      setError("Enter a valid M-Pesa number in the format 2547XXXXXXXX.");
      return;
    }

    setSubmitting(plan.code);
    setError("");
    try {
      const payload = await billing.startMpesaPayment(cleanedPhone, plan.local_price_kes, plan.code);
      setCheckout(payload);
      setPhone(cleanedPhone);
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
          <h2>Upgrade plans with a clean M-Pesa flow and backend-owned billing rules</h2>
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
            onChange={(event) => setPhone(normalisePhone(event.target.value))}
          />
        </label>

        <div className="insight-card">
          <strong>What happens next</strong>
          <p>
            Choose a plan, confirm the phone number, and the backend starts the M-Pesa checkout.
            Then refresh the request status here until the upgrade lands.
          </p>
        </div>
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

          <div className="signal-grid">
            <div className="insight-card">
              <strong>Reference</strong>
              <p>{checkout.external_reference || checkout.checkout_request_id || "Preview checkout created."}</p>
            </div>
            <div className="insight-card">
              <strong>Mode</strong>
              <p>{checkout.is_preview ? "Preview mode" : "Live checkout"}</p>
            </div>
          </div>

          <button type="button" className="ghost-button" onClick={refreshCheckout}>
            Refresh Checkout
          </button>
        </section>
      ) : null}
    </section>
  );
}
