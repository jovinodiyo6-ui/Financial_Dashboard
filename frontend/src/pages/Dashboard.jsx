import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Loader from "../components/Loader";
import TransactionForm from "../components/TransactionForm";
import { useApi } from "../hooks/useApi";

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function Dashboard() {
  const { finance, ai } = useApi();
  const [data, setData] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState("");
  const [error, setError] = useState("");

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
    } finally {
      setSubmitting("");
    }
  };

  if (loading) {
    return <Loader label="Loading dashboard..." />;
  }

  return (
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Backend-Driven Dashboard</span>
          <h2>One frontend. One source of truth. No finance math in React.</h2>
          <p className="lead">{aiData?.summary || "Your backend summary will appear here."}</p>
        </div>
        <button type="button" className="ghost-button ghost-button--light" onClick={load}>
          Refresh
        </button>
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
              <h3>Insights</h3>
            </div>
          </div>

          <p className="lead">{aiData?.summary || "No AI summary available yet."}</p>

          <div className="stack">
            {(aiData?.top_actions || []).map((action) => (
              <div key={action} className="alert-card alert-card--positive">
                <strong>Recommended action</strong>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="transaction-grid">
          <TransactionForm
            title="Create Invoice"
            partyLabel="Customer"
            submitLabel="Save Invoice"
            itemLabel="Services rendered"
            onSubmit={submitInvoice}
            loading={submitting === "invoice"}
          />

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
