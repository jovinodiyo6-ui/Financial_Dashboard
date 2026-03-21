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
  const [statements, setStatements] = useState(null);
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
      const [financeData, statementsData, aiOverview, invoiceData, billData] = await Promise.all([
        finance.getDashboard(),
        finance.getFinancialStatements(),
        ai.getAICFO(),
        finance.getInvoices(),
        finance.getBills(),
      ]);

      setData(financeData);
      setStatements(statementsData);
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
        title: "Gross Margin",
        value:
          data?.gross_margin_pct === null || data?.gross_margin_pct === undefined
            ? "n/a"
            : `${(Number(data.gross_margin_pct) * 100).toFixed(1)}%`,
        hint: `COGS ${formatKes(data?.cost_of_sales || 0)}`,
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
      {
        title: "Liabilities",
        value: formatKes(data?.current_liabilities || 0),
        hint:
          data?.current_ratio === null || data?.current_ratio === undefined
            ? "Current ratio n/a"
            : `Current ratio ${Number(data.current_ratio).toFixed(2)}x`,
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

    if ((statements?.financial_position?.balanced ?? true) === false) {
      items.push({
        title: "Books need alignment",
        detail: `The statement of financial position is off by ${formatKes(
          statements?.financial_position?.difference || 0,
        )}. Review setup entries before relying on the statements.`,
      });
    }

    if ((data?.data_quality_flags || []).length) {
      items.push({
        title: "Data quality needs work",
        detail: data.data_quality_flags[0],
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
  }, [data, statements]);

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

  const profitOrLoss = statements?.profit_or_loss || {};
  const financialPosition = statements?.financial_position || {};
  const cashFlow = statements?.cash_flow || {};

  return (
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Live Finance Workspace</span>
          <h2>Move from structured business input to statements and forecast in one place.</h2>
          <p className="lead">{aiData?.summary || "Your backend summary will appear here."}</p>
        </div>
        <div className="hero-actions">
          <span
            className={`status-pill ${
              aiData?.health_status === "critical"
                ? "status-pill--overdue"
                : aiData?.health_status === "warning"
                ? "status-pill--warning"
                : "status-pill--ready"
            }`}
          >
            {aiData?.health_status || "healthy"}
          </span>
          <Link className="ghost-button ghost-button--light" to="/reports">
            View Reports
          </Link>
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
              <span className="eyebrow">Statement Of Profit Or Loss</span>
              <h3>Operating result</h3>
            </div>
          </div>

          <div className="summary-line">
            <strong>Revenue</strong>
            <span>{formatKes(profitOrLoss?.revenue?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Cost of sales</strong>
            <span>{formatKes(profitOrLoss?.cost_of_sales?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Gross profit</strong>
            <span>{formatKes(profitOrLoss?.gross_profit || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Operating expenses</strong>
            <span>{formatKes(profitOrLoss?.operating_expenses?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Other expenses</strong>
            <span>{formatKes(profitOrLoss?.other_expenses?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Tax expense</strong>
            <span>{formatKes(profitOrLoss?.tax_expense?.total || 0)}</span>
          </div>
          {(profitOrLoss?.appropriations?.total || 0) > 0 ? (
            <div className="summary-line">
              <strong>Appropriations</strong>
              <span>{formatKes(profitOrLoss?.appropriations?.total || 0)}</span>
            </div>
          ) : null}
          <div className="summary-line statement-total">
            <strong>Profit for the period</strong>
            <span>{formatKes(profitOrLoss?.current_period_result || 0)}</span>
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Statement Of Financial Position</span>
              <h3>Assets, liabilities, and equity</h3>
            </div>
            <span
              className={`status-pill ${
                financialPosition?.balanced ? "status-pill--ready" : "status-pill--warning"
              }`}
            >
              {financialPosition?.balanced ? "Balanced" : "Check balances"}
            </span>
          </div>

          <div className="summary-line">
            <strong>Current assets</strong>
            <span>{formatKes(financialPosition?.current_assets?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Non-current assets</strong>
            <span>{formatKes(financialPosition?.non_current_assets?.total || 0)}</span>
          </div>
          <div className="summary-line statement-total">
            <strong>Total assets</strong>
            <span>{formatKes(financialPosition?.total_assets || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Current liabilities</strong>
            <span>{formatKes(financialPosition?.current_liabilities?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Non-current liabilities</strong>
            <span>{formatKes(financialPosition?.non_current_liabilities?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Total liabilities</strong>
            <span>{formatKes(financialPosition?.total_liabilities || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Current year earnings</strong>
            <span>{formatKes(financialPosition?.equity?.current_year_earnings || 0)}</span>
          </div>
          <div className="summary-line statement-total">
            <strong>Total equity</strong>
            <span>{formatKes(financialPosition?.equity?.total || 0)}</span>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Statement Of Cash Flows</span>
              <h3>Cash movement</h3>
            </div>
          </div>

          <div className="summary-line">
            <strong>Opening cash</strong>
            <span>{formatKes(cashFlow?.opening_cash || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Operating cash flow</strong>
            <span>{formatKes(cashFlow?.operating?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Investing cash flow</strong>
            <span>{formatKes(cashFlow?.investing?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Financing cash flow</strong>
            <span>{formatKes(cashFlow?.financing?.total || 0)}</span>
          </div>
          <div className="summary-line">
            <strong>Net change in cash</strong>
            <span>{formatKes(cashFlow?.net_change_in_cash || 0)}</span>
          </div>
          <div className="summary-line statement-total">
            <strong>Ending cash</strong>
            <span>{formatKes(cashFlow?.ending_cash || 0)}</span>
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Forecast</span>
              <h3>Next 90 days</h3>
            </div>
          </div>

          {(aiData?.forecast || []).length ? (
            <div className="forecast-stack">
              {aiData.forecast.map((item) => (
                <div key={item.label} className="forecast-row">
                  <div>
                    <strong>{item.label}</strong>
                    <p className="subtle-text">Projected cash position</p>
                  </div>
                  <strong>{formatKes(item.projected_cash)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="lead">Forecast data will appear as soon as the finance snapshot is available.</p>
          )}

          <div className="insight-card insight-card--answer">
            <strong>Forecast narrative</strong>
            <p>
              {aiData?.narrative ||
                "Once the system has enough structure, it will explain the cash direction and what to do next."}
            </p>
          </div>
        </section>
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

          {(aiData?.alerts || []).length ? (
            <div className="stack">
              {aiData.alerts.slice(0, 3).map((alert) => (
                <div
                  key={`${alert.title}-${alert.message}`}
                  className={`alert-card ${
                    alert.severity === "high"
                      ? "alert-card--critical"
                      : alert.severity === "medium"
                      ? "alert-card--warning"
                      : "alert-card--positive"
                  }`}
                >
                  <strong>{alert.title}</strong>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          ) : null}

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
