import { useState } from "react";

export default function TransactionForm({
  title,
  partyLabel,
  submitLabel,
  itemLabel,
  onSubmit,
  loading = false,
}) {
  const [party, setParty] = useState("");
  const [description, setDescription] = useState(itemLabel);
  const [amount, setAmount] = useState("");
  const [taxRate, setTaxRate] = useState("16");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const numericAmount = Number(amount || 0);
    const numericTaxRate = Number(taxRate || 0);
    if (!party.trim()) {
      setError(`${partyLabel} is required.`);
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    setError("");
    await onSubmit({
      party: party.trim(),
      description: description.trim() || itemLabel,
      amount: numericAmount,
      taxRate: Number.isFinite(numericTaxRate) ? numericTaxRate : 0,
    });
    setParty("");
    setDescription(itemLabel);
    setAmount("");
    setTaxRate("16");
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="panel-header">
        <div>
          <span className="eyebrow">Quick Action</span>
          <h3>{title}</h3>
        </div>
      </div>

      <label className="field">
        <span>{partyLabel}</span>
        <input value={party} onChange={(event) => setParty(event.target.value)} />
      </label>

      <label className="field">
        <span>Description</span>
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>

      <div className="form-grid">
        <label className="field">
          <span>Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Tax Rate %</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={taxRate}
            onChange={(event) => setTaxRate(event.target.value)}
          />
        </label>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <button type="submit" className="primary-button" disabled={loading}>
        {loading ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
