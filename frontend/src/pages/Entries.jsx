import { useEffect, useMemo, useState } from "react";
import Loader from "../components/Loader";
import { useApi } from "../hooks/useApi";
import { useToast } from "../hooks/useToast";

const todayString = () => new Date().toISOString().slice(0, 10);

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const createLine = () => ({
  account_code: "",
  description: "",
  debit: "",
  credit: "",
});

const createEntryState = () => ({
  entry_date: todayString(),
  memo: "",
  reference: "",
  lines: [createLine(), createLine()],
});

export default function Entries() {
  const { finance } = useApi();
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(createEntryState());
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsPayload, overviewPayload] = await Promise.all([
        finance.getChartOfAccounts(),
        finance.getAccountingOverview(),
      ]);
      setAccounts(Array.isArray(accountsPayload?.items) ? accountsPayload.items : []);
      setOverview(overviewPayload);
    } catch (err) {
      setError(err.message || "Failed to load accounting workspace.");
      toast.error("Entries unavailable", err.message || "We could not load the accounting workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
        label: `${account.code} · ${account.name}`,
      })),
    [accounts],
  );

  const updateLine = (index, field, value) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
              ...(field === "debit" && value ? { credit: "" } : {}),
              ...(field === "credit" && value ? { debit: "" } : {}),
            }
          : line,
      ),
    }));
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, createLine()],
    }));
  };

  const removeLine = (index) => {
    setForm((current) => {
      if (current.lines.length <= 2) {
        return current;
      }
      return {
        ...current,
        lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
      };
    });
  };

  const buildPayload = () => ({
    entry_date: form.entry_date,
    memo: form.memo.trim() || "Manual journal entry",
    reference: form.reference.trim(),
    lines: form.lines.map((line) => ({
      account_code: line.account_code,
      description: line.description.trim(),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
  });

  const validateEntry = async (announce = true) => {
    setValidating(true);
    setError("");
    try {
      const payload = await finance.validateJournalEntry(buildPayload());
      setValidation(payload);
      if (!payload?.can_post) {
        setError(payload?.error || "Journal entry is out of balance.");
        toast.error("Entry not ready", payload?.error || "Journal entry is out of balance.");
        return false;
      }
      if (announce) {
        toast.success("Entry balanced", "Journal entry is ready to post.");
      }
      return true;
    } catch (err) {
      setError(err.message || "Failed to validate entry.");
      toast.error("Validation failed", err.message || "We could not validate the journal entry.");
      return false;
    } finally {
      setValidating(false);
    }
  };

  const postEntry = async () => {
    setPosting(true);
    try {
      const ok = await validateEntry(false);
      if (!ok) {
        return;
      }
      await finance.createJournalEntry(buildPayload());
      toast.success("Entry posted", "The journal entry has been recorded successfully.");
      setForm(createEntryState());
      setValidation(null);
      await load();
    } catch (err) {
      setError(err.message || "Failed to post entry.");
      toast.error("Posting failed", err.message || "We could not post the journal entry.");
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return <Loader label="Loading entries workspace..." />;
  }

  return (
    <section className="page-shell">
      <header className="hero-banner">
        <div>
          <span className="eyebrow">Manual Entries</span>
          <h2>Let users post journal entries directly into the accounting engine.</h2>
          <p className="lead">
            Validate debits and credits, post balanced entries, and watch the trial balance update.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="ghost-button ghost-button--light" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Accounts</span>
          <strong className="metric-value">{overview?.account_count || 0}</strong>
          <span className="metric-helper">Chart of accounts available</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Journal Entries</span>
          <strong className="metric-value">{overview?.journal_count || 0}</strong>
          <span className="metric-helper">Posted entries so far</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Trial Balance</span>
          <strong className="metric-value">
            {overview?.trial_balance?.balanced ? "Balanced" : "Attention"}
          </strong>
          <span className="metric-helper">
            Difference {formatKes(overview?.trial_balance?.difference || 0)}
          </span>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Compose Entry</span>
              <h3>Manual journal</h3>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Entry Date</span>
              <input
                type="date"
                value={form.entry_date}
                onChange={(event) => setForm((current) => ({ ...current, entry_date: event.target.value }))}
              />
            </label>

            <label className="field">
              <span>Reference</span>
              <input
                placeholder="Receipt, EFT, or internal ref"
                value={form.reference}
                onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              />
            </label>
          </div>

          <label className="field">
            <span>Memo</span>
            <input
              placeholder="What happened in the business?"
              value={form.memo}
              onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
            />
          </label>

          <div className="stack">
            {form.lines.map((line, index) => (
              <div key={`line-${index}`} className="journal-line-card">
                <div className="journal-line">
                  <label className="field">
                    <span>Account</span>
                    <select
                      value={line.account_code}
                      onChange={(event) => updateLine(index, "account_code", event.target.value)}
                    >
                      <option value="">Select account</option>
                      {accountOptions.map((account) => (
                        <option key={account.id} value={account.code}>
                          {account.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Debit</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(event) => updateLine(index, "debit", event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Credit</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(event) => updateLine(index, "credit", event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Line Description</span>
                    <input
                      placeholder="Optional note for this line"
                      value={line.description}
                      onChange={(event) => updateLine(index, "description", event.target.value)}
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    className="text-button"
                    disabled={form.lines.length <= 2}
                    onClick={() => removeLine(index)}
                  >
                    Remove line
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="button-row">
            <button type="button" className="ghost-button" onClick={addLine}>
              Add Line
            </button>
            <button type="button" className="ghost-button" onClick={() => validateEntry(true)} disabled={validating}>
              {validating ? "Validating..." : "Validate Entry"}
            </button>
            <button type="button" className="primary-button" onClick={postEntry} disabled={posting}>
              {posting ? "Posting..." : "Post Entry"}
            </button>
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Validation</span>
              <h3>Posting readiness</h3>
            </div>
          </div>

          {validation ? (
            <div className="stack">
              <div className={`insight-card ${validation.can_post ? "insight-card--answer" : ""}`}>
                <strong>{validation.can_post ? "Ready to post" : "Needs attention"}</strong>
                <p>
                  Debits {formatKes(validation.debit_total)} · Credits {formatKes(validation.credit_total)}
                </p>
              </div>

              {(validation.blocking_issues || []).length ? (
                <div className="stack">
                  {validation.blocking_issues.map((issue) => (
                    <div key={issue} className="alert-card alert-card--warning">
                      <strong>Blocking issue</strong>
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="lead">Validate the draft to see posting diagnostics.</p>
              )}
            </div>
          ) : (
            <p className="lead">Run validation to check whether the entry balances and can be posted.</p>
          )}

          <div className="panel-header">
            <div>
              <span className="eyebrow">Trial Balance</span>
              <h3>{overview?.trial_balance?.balanced ? "Balanced" : "Out of balance"}</h3>
            </div>
          </div>

          {(overview?.trial_balance?.imbalance?.suspect_accounts || []).length ? (
            <div className="doc-list">
              {overview.trial_balance.imbalance.suspect_accounts.map((account) => (
                <div key={`${account.id}-${account.code}`} className="doc-row">
                  <div>
                    <strong>{account.code}</strong>
                    <p>{account.name}</p>
                  </div>
                  <div>
                    <strong>{formatKes(account.net_balance)}</strong>
                    <p>Net balance</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="lead">No imbalance warnings. The books are currently balanced.</p>
          )}
        </section>
      </div>

      <section className="panel stack">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Recent Entries</span>
            <h3>Latest posted journals</h3>
          </div>
        </div>

        <div className="doc-list">
          {(overview?.recent_entries || []).length ? (
            overview.recent_entries.map((entry) => (
              <div key={entry.id} className="doc-row">
                <div>
                  <strong>{entry.entry_number}</strong>
                  <p>
                    {entry.entry_date} · {entry.memo}
                  </p>
                </div>
                <div>
                  <strong>{entry.lines?.length || 0} lines</strong>
                  <p>{entry.reference || entry.source_type}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="lead">No journal entries have been posted yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}
