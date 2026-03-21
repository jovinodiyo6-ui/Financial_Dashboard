import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Loader from "../components/Loader";
import TransactionForm from "../components/TransactionForm";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function Dashboard() {
  const { finance, ai } = useApi();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  const suggestedQuestions = [
    "What should I fix first to improve cash flow this month?",
    "Where is margin pressure showing up in the latest numbers?",
    "What action would improve profit fastest right now?",
  ];

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [financeData, aiOverview, invoiceData, billData] = await Promise.all([
        finance.getDashboard(),
        ai.getAICFO(),
        finance.getInvoices(),
        finance.getBills(),
      ]);

      setData(financeData);
      setAiData(aiOverview);
      setInvoices(Array.isArray(invoiceData?.items) ? invoiceData.items : []);
      setBills(Array.isArray(billData?.items) ? billData.items : []);
    } catch (err) {
      setError(err.message || "Failed to load dashboard.");
      toast.error("Dashboard unavailable", err.message || "We could not load the workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(
    () => [
      {
        title: "Revenue",
        value: formatKes(data?.revenue || 0),
        hint: `${data?.invoice_count || 0} invoices`,
      },
      {
        title: "Expenses",
        value: formatKes(data?.expenses || 0),
        hint: `${data?.bill_count || 0} bills`,
      },
      {
        title: "Profit",
        value: formatKes(data?.net_profit || 0),
        hint: `Tax due ${formatKes(data?.net_tax_due || 0)}`,
      },
      {
        title: "Receivables",
        value: formatKes(data?.open_receivables || 0),
        hint: `${data?.overdue_invoice_count || 0} overdue`,
      },
    ],
    [data],
  );

  const signals = useMemo(() => {
    const items = [];

    if ((data?.net_profit || 0) > 0) {
      items.push({
        title: "Profit is positive",
        detail: "Your current operating activity is generating a surplus, which gives you room to reinvest.",
      });
    } else {
      items.push({
        title: "Profit needs attention",
        detail: "Expenses are eating into revenue. Tighten spend and review pricing or collection speed.",
      });
    }

    if ((data?.overdue_invoice_count || 0) > 0) {
      items.push({
        title: "Cash is trapped in receivables",
        detail: `${data?.overdue_invoice_count || 0} invoices are overdue. Push collections before adding new costs.`,
      });
    } else {
      items.push({
        title: "Collections look disciplined",
        detail: "There are no overdue invoices in the current snapshot, which keeps cash flow cleaner.",
      });
    }

    if ((data?.bill_count || 0) > (data?.invoice_count || 0)) {
      items.push({
        title: "Cost volume is outpacing sales volume",
        detail: "Your payable activity is heavier than your receivable activity right now. Keep an eye on margin pressure.",
      });
    } else {
      items.push({
        title: "Sales momentum is visible",
        detail: "Invoice activity is keeping pace with or ahead of bills in the current cycle.",
      });
    }

    return items;
  }, [data]);

  const submitInvoice = async ({ party, description, amount, taxRate }) => {
    setSubmitting("invoice");
    try {
      await finance.createInvoice({
        customer_name: party,
        tax_rate: taxRate,
        status: "sent",
        items: [{ description, quantity: 1, unit_price: amount }],
      });
      await load();
      toast.success("Invoice saved", `Invoice for ${party} was added successfully.`);
    } catch (err) {
      setError(err.message || "We could not save the invoice.");
      toast.error("Invoice failed", err.message || "We could not save the invoice.");
      throw err;
    } finally {
      setSubmitting("");
    }
  };

  const submitBill = async ({ party, description, amount, taxRate }) => {
    setSubmitting("bill");
    try {
      await finance.createBill({
        vendor_name: party,
        tax_rate: taxRate,
        status: "approved",
        items: [{ description, quantity: 1, unit_price: amount }],
      });
      await load();
      toast.success("Bill saved", `Bill for ${party} was added successfully.`);
    } catch (err) {
      setError(err.message || "We could not save the bill.");
      toast.error("Bill failed", err.message || "We could not save the bill.");
      throw err;
    } finally {
      setSubmitting("");
    }
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!question.trim()) {
      setError("Ask a finance question first.");
      return;
    }

    setAsking(true);
    setError("");
    try {
      const payload = await ai.askAICFO(question.trim());
      setAnswer(payload?.answer || payload?.summary || "AI CFO responded, but no answer text was returned.");
      toast.success("AI CFO answered", "The latest response is now pinned in your workspace.");
    } catch (err) {
      setError(err.message || "AI CFO could not answer right now.");
      toast.error("AI CFO unavailable", err.message || "The assistant could not answer right now.");
    } finally {
      setAsking(false);
    }
  };

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  return (
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Live Finance Workspace</span>
          <h2>See what matters, act quickly, and let the backend carry the logic.</h2>
          <p className="lead">{aiData?.summary || "Your backend summary will appear here."}</p>
        </div>
        <div className="hero-actions">
          <Link className="ghost-button ghost-button--light" to="/entries">
            Make Entry
          </Link>
          <Link className="ghost-button ghost-button--light" to="/billing">
            Upgrade Plan
          </Link>
          <button type="button" className="ghost-button ghost-button--light" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="metric-grid">
        {metrics.map((metric) => (
          <Card key={metric.title} title={metric.title} value={metric.value} hint={metric.hint} />
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">AI CFO</span>
              <h3>Decision support</h3>
            </div>
          </div>

          <p className="lead">{aiData?.summary || "No AI summary available yet."}</p>

          <div className="signal-grid">
            {signals.map((signal) => (
              <div key={signal.title} className="insight-card">
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </div>
            ))}
          </div>

          {(aiData?.top_actions || []).length ? (
            <div className="stack">
              {(aiData?.top_actions || []).map((action) => (
                <div key={action} className="alert-card alert-card--positive">
                  <strong>Recommended action</strong>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Ask AI CFO</span>
              <h3>Get a plain-English answer</h3>
            </div>
          </div>

          <form className="stack" onSubmit={submitQuestion}>
            <label className="field">
              <span>Question</span>
              <textarea
                placeholder="Example: What should I fix first to improve cash flow this month?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>

            <button type="submit" className="primary-button" disabled={asking}>
              {asking ? "Thinking..." : "Ask AI CFO"}
            </button>
          </form>

          <div className="chip-row">
            {suggestedQuestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chip-button"
                onClick={() => setQuestion(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="insight-card insight-card--answer">
            <strong>Latest response</strong>
            <p>{answer || "Ask a question to turn your finance data into the next move."}</p>
          </div>
        </section>
      </div>

      <div className="transaction-grid">
        <div className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Capture Revenue</span>
              <h3>Create invoice</h3>
            </div>
          </div>
          <TransactionForm
            title="Create Invoice"
            partyLabel="Customer"
            submitLabel="Save Invoice"
            itemLabel="Services rendered"
            onSubmit={submitInvoice}
            loading={submitting === "invoice"}
          />
        </div>

        <div className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Capture Cost</span>
              <h3>Create bill</h3>
            </div>
          </div>
          <TransactionForm
            title="Create Bill"
            partyLabel="Vendor"
            submitLabel="Save Bill"
            itemLabel="Operating spend"
            onSubmit={submitBill}
            loading={submitting === "bill"}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Invoices</span>
              <h3>Recent receivables</h3>
            </div>
          </div>

          <div className="doc-list">
            {invoices.length ? (
              invoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="doc-row">
                  <div>
                    <strong>{invoice.invoice_number}</strong>
                    <p>{invoice.customer_name}</p>
                  </div>
                  <div>
                    <strong>{formatKes(invoice.total_amount)}</strong>
                    <p>{invoice.status}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="lead">No invoices yet.</p>
            )}
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Bills</span>
              <h3>Recent payables</h3>
            </div>
          </div>

          <div className="doc-list">
            {bills.length ? (
              bills.slice(0, 5).map((bill) => (
                <div key={bill.id} className="doc-row">
                  <div>
                    <strong>{bill.bill_number}</strong>
                    <p>{bill.vendor_name}</p>
                  </div>
                  <div>
                    <strong>{formatKes(bill.total_amount)}</strong>
                    <p>{bill.status}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="lead">No bills yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
