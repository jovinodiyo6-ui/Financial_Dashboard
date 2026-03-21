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
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (!Number.isFinite(numericTaxRate) || numericTaxRate < 0 || numericTaxRate > 100) {
      setError("Tax rate must be between 0 and 100.");
      return;
    }
    setError("");
    await onSubmit({
      party: party.trim(),
      description: description.trim(),
      amount: numericAmount,
      taxRate: numericTaxRate,
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
        <input
          required
          placeholder={`Enter ${partyLabel.toLowerCase()}`}
          value={party}
          onChange={(event) => setParty(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <input
          required
          placeholder={itemLabel}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="form-grid">
        <label className="field">
          <span>Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
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
            max="100"
            inputMode="decimal"
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
