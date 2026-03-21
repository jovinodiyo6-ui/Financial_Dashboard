import { useEffect, useMemo, useState } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

const businessTypeLabels = {
  sole_proprietor: "Sole Proprietor",
  partnership: "Partnership",
  manufacturing: "Manufacturing",
  company: "Company",
};

const todayString = () => new Date().toISOString().slice(0, 10);

const createBaseState = () => ({
  entry_date: todayString(),
  cash_sales: "",
  credit_sales: "",
  expenses_paid: "",
  purchases_cash: "",
  purchases_credit: "",
  supplier_payments: "",
  customer_collections: "",
});

const createPartnerState = (name = "") => ({
  name,
  capital_contribution: "",
  drawings: "",
  interest_on_capital: "",
  interest_on_drawings: "",
  salary: "",
  ratio: "",
});

const createGuidedState = (company) => {
  const businessType = company?.business_type || "sole_proprietor";
  const base = createBaseState();

  if (businessType === "partnership") {
    return {
      ...base,
      profit_allocation_total: "",
      partners: (company?.partner_names || []).map((name) => createPartnerState(name)),
    };
  }

  if (businessType === "manufacturing") {
    return {
      entry_date: todayString(),
      raw_materials_purchases: "",
      materials_to_production: "",
      direct_labor: "",
      factory_overheads: "",
      transfer_to_finished_goods: "",
      cash_sales: "",
      credit_sales: "",
      cost_of_goods_sold: "",
      closing_inventory_adjustment: "",
    };
  }

  if (businessType === "company") {
    return {
      ...base,
      share_capital: "",
      retained_earnings: "",
      dividends: "",
      corporation_tax: "",
      long_term_loans: "",
    };
  }

  return {
    ...base,
    owner_capital: "",
    additional_capital: "",
    drawings: "",
  };
};

const moneyField = (label, value, onChange, key) => (
  <label className="field" key={key || label}>
    <span>{label}</span>
    <input
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      value={value}
      onChange={onChange}
    />
  </label>
);

export default function GuidedEntryWizard({
  onSubmitted,
  companyOverride = null,
  onSubmitData = null,
  submitLabel = "Create Guided Entries",
  title = "Guided Inputs",
  subtitle = "wizard",
  intro = "Enter business facts and the system will convert them into journal entries behind the scenes, then feed the ledger and statements.",
}) {
  const { companies, finance } = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const [loadedCompany, setLoadedCompany] = useState(companyOverride);
  const [form, setForm] = useState(createGuidedState(null));
  const [loading, setLoading] = useState(!companyOverride);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const company = companyOverride || loadedCompany;

  const loadCompany = async () => {
    if (companyOverride) {
      setLoadedCompany(companyOverride);
      setForm(createGuidedState(companyOverride));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const items = await companies.getCompanies();
      const selected =
        (Array.isArray(items) ? items : []).find((item) => item.id === user?.default_company_id) ||
        (Array.isArray(items) ? items[0] : null);
      setLoadedCompany(selected || null);
      setForm(createGuidedState(selected));
    } catch (err) {
      setError(err.message || "Failed to load company setup.");
      toast.error("Guided entry unavailable", err.message || "We could not load the company setup.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, [user?.default_company_id, companyOverride?.id, companyOverride?.business_type, (companyOverride?.partner_names || []).join("|")]);

  const businessType = company?.business_type || "sole_proprietor";
  const heading = useMemo(() => businessTypeLabels[businessType] || "Business", [businessType]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updatePartner = (index, field, value) => {
    setForm((current) => ({
      ...current,
      partners: (current.partners || []).map((partner, partnerIndex) =>
        partnerIndex === index ? { ...partner, [field]: value } : partner,
      ),
    }));
  };

  const submit = async () => {
    if (!company) {
      setError("No company is available for guided entries.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const { entry_date, ...inputs } = form;
      const payload = onSubmitData
        ? await onSubmitData({
            company,
            entry_date,
            business_type: businessType,
            inputs,
          })
        : await finance.createGuidedEntries({
            entry_date,
            business_type: businessType,
            inputs,
          });
      toast.success(
        "Entries created",
        `${payload?.created_count || 0} guided journal entries were added to the ledger.`,
      );
      setForm(createGuidedState(company));
      await onSubmitted?.();
    } catch (err) {
      setError(err.message || "Failed to create guided entries.");
      toast.error("Guided entry failed", err.message || "We could not create the guided entries.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="panel stack">
        <span className="eyebrow">{title}</span>
        <p className="lead">Loading the company setup for guided entries...</p>
      </section>
    );
  }

  if (!company) {
    return (
      <section className="panel stack">
        <span className="eyebrow">{title}</span>
        <p className="lead">No company found for the current workspace.</p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <div className="panel-header">
        <div>
          <span className="eyebrow">{title}</span>
          <h3>{heading} {subtitle}</h3>
        </div>
      </div>

      <p className="lead">{intro}</p>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="wizard-grid">
        <label className="field">
          <span>Entry Date</span>
          <input
            type="date"
            value={form.entry_date}
            onChange={(event) => updateField("entry_date", event.target.value)}
          />
        </label>
      </div>

      {businessType === "sole_proprietor" || businessType === "partnership" || businessType === "company" ? (
        <div className="stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Operating Activity</span>
              <h3>Core trading inputs</h3>
            </div>
          </div>
          <div className="wizard-grid">
            {moneyField("Cash sales", form.cash_sales, (event) => updateField("cash_sales", event.target.value))}
            {moneyField("Credit sales", form.credit_sales, (event) => updateField("credit_sales", event.target.value))}
            {moneyField("Expenses paid", form.expenses_paid, (event) => updateField("expenses_paid", event.target.value))}
            {moneyField("Purchases paid in cash", form.purchases_cash, (event) => updateField("purchases_cash", event.target.value))}
            {moneyField("Purchases on credit", form.purchases_credit, (event) => updateField("purchases_credit", event.target.value))}
            {moneyField("Payments to suppliers", form.supplier_payments, (event) => updateField("supplier_payments", event.target.value))}
            {moneyField("Cash collected from customers", form.customer_collections, (event) => updateField("customer_collections", event.target.value))}
          </div>
        </div>
      ) : null}

      {businessType === "sole_proprietor" ? (
        <div className="stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Owner Inputs</span>
              <h3>Capital and drawings</h3>
            </div>
          </div>
          <div className="wizard-grid">
            {moneyField("Owner capital introduced", form.owner_capital, (event) => updateField("owner_capital", event.target.value))}
            {moneyField("Additional capital introduced", form.additional_capital, (event) => updateField("additional_capital", event.target.value))}
            {moneyField("Owner drawings", form.drawings, (event) => updateField("drawings", event.target.value))}
          </div>
        </div>
      ) : null}

      {businessType === "company" ? (
        <div className="stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Corporate Inputs</span>
              <h3>Equity, tax, and long-term funding</h3>
            </div>
          </div>
          <div className="wizard-grid">
            {moneyField("Share capital", form.share_capital, (event) => updateField("share_capital", event.target.value))}
            {moneyField("Retained earnings", form.retained_earnings, (event) => updateField("retained_earnings", event.target.value))}
            {moneyField("Dividends", form.dividends, (event) => updateField("dividends", event.target.value))}
            {moneyField("Corporation tax", form.corporation_tax, (event) => updateField("corporation_tax", event.target.value))}
            {moneyField("Debentures / long-term loans", form.long_term_loans, (event) => updateField("long_term_loans", event.target.value))}
          </div>
        </div>
      ) : null}

      {businessType === "partnership" ? (
        <div className="stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Partnership Inputs</span>
              <h3>Partners, terms, and sharing</h3>
            </div>
          </div>

          {moneyField("Profit allocation total", form.profit_allocation_total, (event) => updateField("profit_allocation_total", event.target.value), "profit-allocation")}

          <div className="partner-grid">
            {(form.partners || []).map((partner, index) => (
              <div key={`${partner.name}-${index}`} className="partner-card">
                <strong>{partner.name || `Partner ${index + 1}`}</strong>
                <div className="wizard-grid">
                  {moneyField("Capital contribution", partner.capital_contribution, (event) => updatePartner(index, "capital_contribution", event.target.value), `${partner.name}-capital`)}
                  {moneyField("Drawings", partner.drawings, (event) => updatePartner(index, "drawings", event.target.value), `${partner.name}-drawings`)}
                  {moneyField("Interest on capital", partner.interest_on_capital, (event) => updatePartner(index, "interest_on_capital", event.target.value), `${partner.name}-ioc`)}
                  {moneyField("Interest on drawings", partner.interest_on_drawings, (event) => updatePartner(index, "interest_on_drawings", event.target.value), `${partner.name}-iod`)}
                  {moneyField("Salary / commission", partner.salary, (event) => updatePartner(index, "salary", event.target.value), `${partner.name}-salary`)}
                  {moneyField("Profit-sharing ratio", partner.ratio, (event) => updatePartner(index, "ratio", event.target.value), `${partner.name}-ratio`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {businessType === "manufacturing" ? (
        <div className="stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Manufacturing Inputs</span>
              <h3>Production flow</h3>
            </div>
          </div>
          <div className="wizard-grid">
            {moneyField("Purchase of raw materials", form.raw_materials_purchases, (event) => updateField("raw_materials_purchases", event.target.value))}
            {moneyField("Raw materials issued to production", form.materials_to_production, (event) => updateField("materials_to_production", event.target.value))}
            {moneyField("Direct labor", form.direct_labor, (event) => updateField("direct_labor", event.target.value))}
            {moneyField("Factory overheads", form.factory_overheads, (event) => updateField("factory_overheads", event.target.value))}
            {moneyField("Transfer to finished goods", form.transfer_to_finished_goods, (event) => updateField("transfer_to_finished_goods", event.target.value))}
            {moneyField("Cash sales", form.cash_sales, (event) => updateField("cash_sales", event.target.value))}
            {moneyField("Credit sales", form.credit_sales, (event) => updateField("credit_sales", event.target.value))}
            {moneyField("Cost of goods sold", form.cost_of_goods_sold, (event) => updateField("cost_of_goods_sold", event.target.value))}
            {moneyField("Closing inventory adjustment", form.closing_inventory_adjustment, (event) => updateField("closing_inventory_adjustment", event.target.value))}
          </div>
        </div>
      ) : null}

      <p className="helper-note">
        This wizard uses your business type to convert these inputs into double-entry journals,
        then pushes them into the same ledger used by the accounting workspace.
      </p>

      <div className="button-row">
        <button type="button" className="ghost-button" onClick={() => setForm(createGuidedState(company))}>
          Reset Wizard
        </button>
        <button type="button" className="primary-button" onClick={submit} disabled={submitting}>
          {submitting ? "Creating entries..." : submitLabel}
        </button>
      </div>
    </section>
  );
}
