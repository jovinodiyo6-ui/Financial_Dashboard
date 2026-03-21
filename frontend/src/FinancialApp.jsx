import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { usePlaidLink } from "react-plaid-link";
import {
  INITIAL_SCENARIO_INPUTS,
  SCENARIO_PRESETS,
  buildExecutiveMetrics,
  buildOperatingSignals,
  buildForecastModel,
  buildFinanceAlerts,
  buildBoardNarrative,
  statementToCsv,
  ledgerRowsToCsv,
} from "./financialWorkbench.js";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  // Use relative path in local dev, production fallback to Render API
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "/api"
    : "https://financial-dashboard-8jl0.onrender.com")
).trim().replace(/\/$/, "");
const TOKEN_KEY = "financepro_token";
const LAST_EMAIL_KEY = "financepro_last_email";
const THEME_KEY = "financepro_theme";
const BUSINESS_TYPE_KEY = "financepro_business_type";
const WORKSPACE_KEY_PREFIX = "financepro_workspace";

const readStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const persistToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage failures (private mode / disabled storage)
  }
};

const readStoredEmail = () => {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) || "";
  } catch {
    return "";
  }
};

const persistEmail = (email) => {
  try {
    if (email) {
      localStorage.setItem(LAST_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(LAST_EMAIL_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
};

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const persistTheme = (theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme === "dark" ? "dark" : "light");
  } catch {
    // Ignore storage failures.
  }
};

const readStoredBusinessType = () => {
  try {
    const stored = localStorage.getItem(BUSINESS_TYPE_KEY);
    if (stored === "partnership" || stored === "manufacturing" || stored === "sole_proprietor") {
      return stored;
    }
  } catch {
    // Ignore storage failures.
  }
  return "sole_proprietor";
};

const persistBusinessType = (businessType) => {
  try {
    localStorage.setItem(BUSINESS_TYPE_KEY, businessType);
  } catch {
    // Ignore storage failures.
  }
};

const getWorkspaceKey = (companyId) => `${WORKSPACE_KEY_PREFIX}_${companyId || "default"}`;

const readStoredWorkspace = (companyId) => {
  try {
    const raw = localStorage.getItem(getWorkspaceKey(companyId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistWorkspace = (companyId, workspace) => {
  try {
    localStorage.setItem(getWorkspaceKey(companyId), JSON.stringify(workspace));
  } catch {
    // Ignore storage failures.
  }
};

const readAuthSearchParams = () => {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search);
};

const readInitialAuthMode = () => {
  const params = readAuthSearchParams();
  return params.get("auth") === "reset" || params.get("token") ? "reset" : "login";
};

const readResetTokenFromLocation = () => readAuthSearchParams().get("token") || "";

const updatePasswordResetLocation = (token = "") => {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("auth", "reset");
    url.searchParams.set("token", token);
  } else {
    url.searchParams.delete("auth");
    url.searchParams.delete("token");
  }
  window.history.replaceState({}, "", url.toString());
};

const BUSINESS_TYPE_OPTIONS = [
  {
    value: "sole_proprietor",
    label: "Sole Trader",
    description: "Shows the sole-trader layout only: trading, profit and loss, capital, drawings, and financial position.",
  },
  {
    value: "partnership",
    label: "Partnership",
    description: "Shows the partnership layout only, including appropriation and partner capital schedules.",
  },
  {
    value: "manufacturing",
    label: "Manufacturing Company",
    description: "Shows the manufacturing layout only, including COGM before trading profit.",
  },
];

const ACCOUNT_CATALOG = [
  { account: "Opening Stock", type: "asset", subtype: "current" },
  { account: "Closing Stock", type: "asset", subtype: "current" },
  { account: "Cash", type: "asset", subtype: "current" },
  { account: "Cash and Cash Equivalents", type: "asset", subtype: "current" },
  { account: "Accounts Receivable", type: "asset", subtype: "current" },
  { account: "Inventory", type: "asset", subtype: "current" },
  { account: "Raw Materials Opening Stock", type: "asset", subtype: "current" },
  { account: "Closing Raw Materials", type: "asset", subtype: "current" },
  { account: "Opening Work in Progress", type: "asset", subtype: "current" },
  { account: "Closing Work in Progress", type: "asset", subtype: "current" },
  { account: "Prepaid Expenses", type: "asset", subtype: "current" },
  { account: "Accrued Expenses", type: "liability", subtype: "current" },
  { account: "Salary Arrears", type: "liability", subtype: "current" },
  { account: "Land and Buildings", type: "asset", subtype: "non-current" },
  { account: "Machinery and Equipment", type: "asset", subtype: "non-current" },
  { account: "Plant and Machinery", type: "asset", subtype: "non-current" },
  { account: "Plant & Machinery", type: "asset", subtype: "non-current" },
  { account: "Vehicles", type: "asset", subtype: "non-current" },
  { account: "Intellectual Property (Patents, Trademarks)", type: "asset", subtype: "non-current" },
  { account: "Long-term Investments", type: "asset", subtype: "non-current" },
  { account: "Goodwill", type: "asset", subtype: "non-current" },
  { account: "Equipment", type: "asset", subtype: "non-current" },
  { account: "Accounts Payable", type: "liability", subtype: "current" },
  { account: "Bank Loan", type: "liability", subtype: "non-current" },
  { account: "Owner Capital", type: "capital", subtype: "equity" },
  { account: "Drawings", type: "drawings", subtype: "equity" },
  { account: "Gross Sales", type: "revenue", subtype: "operating" },
  { account: "Sales", type: "revenue", subtype: "operating" },
  { account: "Sales Returns", type: "expense", subtype: "operating" },
  { account: "Goods Return", type: "expense", subtype: "operating" },
  { account: "Discounts", type: "expense", subtype: "operating" },
  { account: "Bad Debts", type: "expense", subtype: "operating" },
  { account: "Sales Revenue", type: "revenue", subtype: "operating" },
  { account: "Service Revenue", type: "revenue", subtype: "operating" },
  { account: "Purchases", type: "expense", subtype: "operating" },
  { account: "Returns Outwards", type: "expense", subtype: "operating" },
  { account: "Carriage Inwards", type: "expense", subtype: "operating" },
  { account: "Carriage Outwards", type: "expense", subtype: "operating" },
  { account: "Direct Labour", type: "expense", subtype: "operating" },
  { account: "Direct Manufacturing Labor", type: "expense", subtype: "operating" },
  { account: "Factory Indirect Labor", type: "expense", subtype: "operating" },
  { account: "Factory Utilities", type: "expense", subtype: "operating" },
  { account: "Depreciation of Factory Equipment", type: "expense", subtype: "operating" },
  { account: "Factory Expenses", type: "expense", subtype: "operating" },
  { account: "Factory Overheads", type: "expense", subtype: "operating" },
  { account: "Partner Salary", type: "expense", subtype: "operating" },
  { account: "Interest on Capital", type: "expense", subtype: "operating" },
  { account: "Cost of Goods Sold", type: "expense", subtype: "operating" },
  { account: "Interest Received", type: "revenue", subtype: "other" },
  { account: "Rental Income", type: "revenue", subtype: "other" },
  { account: "Miscellaneous Income", type: "revenue", subtype: "other" },
  { account: "Payroll Expenses", type: "expense", subtype: "operating" },
  { account: "Salaries", type: "expense", subtype: "operating" },
  { account: "Salaries and Wages", type: "expense", subtype: "operating" },
  { account: "Advertising Expenses", type: "expense", subtype: "operating" },
  { account: "Marketing Expenses", type: "expense", subtype: "operating" },
  { account: "Motor Expenses", type: "expense", subtype: "operating" },
  { account: "Office Expenses", type: "expense", subtype: "operating" },
  { account: "General Expenses", type: "expense", subtype: "operating" },
  { account: "Rent Expense", type: "expense", subtype: "operating" },
  { account: "Utilities Expense", type: "expense", subtype: "operating" },
  { account: "License Fees", type: "expense", subtype: "operating" },
  { account: "Interest Paid on Loans", type: "expense", subtype: "operating" },
  { account: "Insurance Premiums", type: "expense", subtype: "operating" },
  { account: "Other Miscellaneous Expenses", type: "expense", subtype: "other" },
  { account: "Income Tax Expense", type: "expense", subtype: "other" },
  { account: "Depreciation Expense", type: "expense", subtype: "other" },
  { account: "Interest on Borrowings", type: "expense", subtype: "other" },
  { account: "Loss on Sale of Asset", type: "expense", subtype: "other" },
  { account: "Dividend Income", type: "revenue", subtype: "other" },
  { account: "Profit on Sale of Asset", type: "revenue", subtype: "other" },
  { account: "Decrease in Current Assets", type: "asset", subtype: "current" },
  { account: "Increase in Current Assets", type: "asset", subtype: "current" },
  { account: "Increase in Current Liabilities", type: "liability", subtype: "current" },
  { account: "Decrease in Current Liabilities", type: "liability", subtype: "current" },
  { account: "Income Taxes Paid", type: "expense", subtype: "other" },
];

const INITIAL_LEDGER_ROWS = ACCOUNT_CATALOG.map((entry, index) => ({
  id: index + 1,
  ...entry,
  amount: "",
  depreciation: "",
}));

const createLedgerRows = (entries) =>
  entries.map((entry, index) => ({
    id: index + 1,
    account: entry.account,
    type: entry.type,
    subtype: entry.subtype,
    amount: entry.amount ?? "",
    depreciation: entry.depreciation ?? "",
  }));

const BUSINESS_TEMPLATE_ROWS = {
  sole_proprietor: createLedgerRows([
    { account: "Opening Stock", type: "asset", subtype: "current" },
    { account: "Purchases", type: "expense", subtype: "operating" },
    { account: "Sales Revenue", type: "revenue", subtype: "operating" },
    { account: "Returns Outwards", type: "expense", subtype: "operating" },
    { account: "Sales Returns", type: "expense", subtype: "operating" },
    { account: "Carriage Inwards", type: "expense", subtype: "operating" },
    { account: "Closing Stock", type: "asset", subtype: "current" },
    { account: "Payroll Expenses", type: "expense", subtype: "operating" },
    { account: "Rent Expense", type: "expense", subtype: "operating" },
    { account: "Utilities Expense", type: "expense", subtype: "operating" },
    { account: "Owner Capital", type: "capital", subtype: "equity" },
    { account: "Drawings", type: "drawings", subtype: "equity" },
    { account: "Cash", type: "asset", subtype: "current" },
    { account: "Accounts Payable", type: "liability", subtype: "current" },
  ]),
  partnership: createLedgerRows([
    { account: "Opening Stock", type: "asset", subtype: "current" },
    { account: "Purchases", type: "expense", subtype: "operating" },
    { account: "Sales Revenue", type: "revenue", subtype: "operating" },
    { account: "Returns Outwards", type: "expense", subtype: "operating" },
    { account: "Sales Returns", type: "expense", subtype: "operating" },
    { account: "Carriage Inwards", type: "expense", subtype: "operating" },
    { account: "Closing Stock", type: "asset", subtype: "current" },
    { account: "Partner Salary", type: "expense", subtype: "operating" },
    { account: "Interest on Capital", type: "expense", subtype: "operating" },
    { account: "Payroll Expenses", type: "expense", subtype: "operating" },
    { account: "Cash", type: "asset", subtype: "current" },
    { account: "Accounts Payable", type: "liability", subtype: "current" },
  ]),
  manufacturing: createLedgerRows([
    { account: "Raw Materials Opening Stock", type: "asset", subtype: "current" },
    { account: "Purchases", type: "expense", subtype: "operating" },
    { account: "Returns Outwards", type: "expense", subtype: "operating" },
    { account: "Carriage Inwards", type: "expense", subtype: "operating" },
    { account: "Closing Raw Materials", type: "asset", subtype: "current" },
    { account: "Direct Manufacturing Labor", type: "expense", subtype: "operating" },
    { account: "Factory Indirect Labor", type: "expense", subtype: "operating" },
    { account: "Factory Utilities", type: "expense", subtype: "operating" },
    { account: "Depreciation of Factory Equipment", type: "expense", subtype: "operating" },
    { account: "Factory Expenses", type: "expense", subtype: "operating" },
    { account: "Opening Work in Progress", type: "asset", subtype: "current" },
    { account: "Closing Work in Progress", type: "asset", subtype: "current" },
    { account: "Opening Stock", type: "asset", subtype: "current" },
    { account: "Sales Revenue", type: "revenue", subtype: "operating" },
    { account: "Sales Returns", type: "expense", subtype: "operating" },
    { account: "Closing Stock", type: "asset", subtype: "current" },
    { account: "Payroll Expenses", type: "expense", subtype: "operating" },
    { account: "Utilities Expense", type: "expense", subtype: "operating" },
    { account: "Owner Capital", type: "capital", subtype: "equity" },
    { account: "Cash", type: "asset", subtype: "current" },
  ]),
};

const QUICK_ENTRY_TEMPLATES = [
  {
    id: "invoice-on-credit",
    label: "Invoice Customer (A/R)",
    businessTypes: ["sole_proprietor", "partnership", "manufacturing"],
    entries: [
      { account: "Accounts Receivable", type: "asset", subtype: "current" },
      { account: "Sales Revenue", type: "revenue", subtype: "operating" },
    ],
  },
  {
    id: "receive-from-customer",
    label: "Receive Payment (A/R)",
    businessTypes: ["sole_proprietor", "partnership", "manufacturing"],
    entries: [
      { account: "Cash", type: "asset", subtype: "current" },
      { account: "Accounts Receivable", type: "asset", subtype: "current" },
    ],
  },
  {
    id: "purchase-on-credit",
    label: "Purchase On Credit (A/P)",
    businessTypes: ["sole_proprietor", "partnership", "manufacturing"],
    entries: [
      { account: "Purchases", type: "expense", subtype: "operating" },
      { account: "Accounts Payable", type: "liability", subtype: "current" },
    ],
  },
  {
    id: "pay-supplier",
    label: "Pay Supplier (A/P)",
    businessTypes: ["sole_proprietor", "partnership", "manufacturing"],
    entries: [
      { account: "Accounts Payable", type: "liability", subtype: "current" },
      { account: "Cash", type: "asset", subtype: "current" },
    ],
  },
  {
    id: "factory-wages",
    label: "Post Direct Labour",
    businessTypes: ["manufacturing"],
    entries: [
      { account: "Direct Labour", type: "expense", subtype: "operating" },
      { account: "Cash", type: "asset", subtype: "current" },
    ],
  },
  {
    id: "factory-overheads",
    label: "Post Factory Overheads",
    businessTypes: ["manufacturing"],
    entries: [
      { account: "Factory Overheads", type: "expense", subtype: "operating" },
      { account: "Cash", type: "asset", subtype: "current" },
    ],
  },
  {
    id: "partner-drawing",
    label: "Record Partner Drawing",
    businessTypes: ["partnership"],
    entries: [
      { account: "Drawings", type: "drawings", subtype: "equity" },
      { account: "Cash", type: "asset", subtype: "current" },
    ],
  },
];

const getSubtypeOptions = (type) => {
  if (type === "asset" || type === "liability") {
    return ["current", "non-current"];
  }
  if (type === "revenue" || type === "expense") {
    return ["operating", "other"];
  }
  return ["equity"];
};

const toAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAccountKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const formatKes = (value) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value) =>
  `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;

const MARKETING_PLANS = [
  {
    code: "free",
    label: "Free",
    usd: "$0",
    kes: "KES 0",
    summary: "For students, freelancers, and first-time founders getting their books under control.",
    features: ["1 company", "income & expense tracking", "simple dashboard", "manual entries"],
  },
  {
    code: "pro",
    label: "Pro",
    usd: "$20/mo",
    kes: "KES 900/mo",
    summary: "For serious small businesses that need a finance control tower, exports, and workflow automation.",
    features: ["scenario planner", "exports", "tax, AP/AR, and operations hub", "multi-company growth path"],
  },
  {
    code: "ai",
    label: "AI CFO",
    usd: "$50/mo",
    kes: "KES 1,500/mo",
    summary: "For owners who want proactive alerts, cash forecasting, and chat-with-your-business guidance.",
    features: ["AI alerts", "cash runway forecasting", "chat with your business", "recommended next actions"],
  },
];

const INITIAL_BUDGET_TARGETS = {
  revenue: 0,
  expense: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  equity: 0,
  netCashFlow: 0,
};

const INITIAL_MANUFACTURING_INPUTS = {
  openingRawMaterials: "",
  purchases: "",
  carriageInwards: "",
  returnsOutwards: "",
  closingRawMaterials: "",
  directLabour: "",
  factoryIndirectLabor: "",
  factoryUtilities: "",
  depreciationFactoryEquipment: "",
  factoryExpenses: "",
  openingWip: "",
  closingWip: "",
};

const INITIAL_PARTNERSHIP_ADJUSTMENTS = {
  interestRate: "",
  interestOnDrawingsRate: "",
  salaryArrears: "",
  prepaidExpenseAdjustment: "",
  depreciationRate: "",
  depreciationAsset: "Plant and Machinery",
};

const COMMON_DEPRECIABLE_ASSETS = [
  "Plant and Machinery",
  "Plant & Machinery",
  "Machinery and Equipment",
  "Property and Equipment",
  "Factory Equipment",
  "Motor Vehicles",
  "Fixtures and Fittings",
];

const MANUFACTURING_SIGNAL_ACCOUNTS = new Set([
  "raw materials opening stock",
  "opening raw materials",
  "closing raw materials",
  "opening work in progress",
  "closing work in progress",
  "direct labour",
  "direct manufacturing labor",
  "factory indirect labor",
  "factory utilities",
  "depreciation of factory equipment",
  "factory expenses",
  "factory overheads",
]);

const PARTNERSHIP_SIGNAL_ACCOUNTS = new Set([
  "partner salary",
  "interest on capital",
  "partner capital",
  "partner current account",
  "partners capital",
  "capital account",
  "current account",
]);

const BUSINESS_LAYOUT_CONFIG = {
  sole_proprietor: {
    layoutName: "Sole Trader Layout",
    description: "Shows only the core sole-trader flow: trading, profit and loss, capital and drawings, and statement of financial position.",
    sections: [
      "Trading and profit and loss account",
      "Owner capital and drawings",
      "Statement of financial position",
      "Cash flow support view",
    ],
    inputTitle: "Sole Trader Input Sheet",
    inputNote: "Focused on the accounts a sole trader normally needs without partnership or manufacturing schedules.",
    statementTitle: "Sole Trader Trading and Profit & Loss Account",
    balanceTitle: "Sole Trader Statement of Financial Position",
    cashFlowTitle: "Sole Trader Cash Flow View",
  },
  partnership: {
    layoutName: "Partnership Layout",
    description: "Shows the partnership workflow only: trading, profit and loss, appropriation, partner sharing, and partnership financial position.",
    sections: [
      "Trading and profit and loss account",
      "Profit and loss appropriation account",
      "Partner capital and sharing schedule",
      "Statement of financial position",
    ],
    inputTitle: "Partnership Input Sheet",
    inputNote: "Focused on partnership accounts, partner salaries, interest on capital, and drawings.",
    statementTitle: "Partnership Trading and Profit & Loss Account",
    balanceTitle: "Partnership Statement of Financial Position",
    cashFlowTitle: "Partnership Cash Flow View",
  },
  manufacturing: {
    layoutName: "Manufacturing Layout",
    description: "Shows the manufacturing flow only: cost of goods manufactured, trading and profit and loss, and manufacturing financial position.",
    sections: [
      "Manufacturing account",
      "Trading and profit and loss account",
      "Statement of financial position",
      "Cash flow support view",
    ],
    inputTitle: "Manufacturing Input Sheet",
    inputNote: "Focused on raw materials, factory overheads, work in progress, finished goods, and trading outputs.",
    statementTitle: "Manufacturing Trading and Profit & Loss Account",
    balanceTitle: "Manufacturing Statement of Financial Position",
    cashFlowTitle: "Manufacturing Cash Flow View",
  },
};

const MIN_PARTNER_COUNT = 2;
const MAX_PARTNER_COUNT = 10;

const getDefaultPartnerName = (index) => (index < 26 ? `Partner ${String.fromCharCode(65 + index)}` : `Partner ${index + 1}`);

const createPartnerState = (id, name, share = "50") => ({
  id,
  name,
  capital: "",
  currentAccount: "",
  share,
  drawings: "",
  interestOnCapital: "",
  salary: "",
  monthlySalary: "",
});

const INITIAL_PARTNERS = [
  createPartnerState(1, "Partner A", "50"),
  createPartnerState(2, "Partner B", "50"),
];

const clampPartnerCount = (value, fallback = MIN_PARTNER_COUNT) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(MAX_PARTNER_COUNT, Math.max(MIN_PARTNER_COUNT, parsed));
};

const formatSharePercent = (value) => {
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const createPartnerNameInputs = (count, existingNames = []) => {
  const nextCount = clampPartnerCount(count);
  return Array.from({ length: nextCount }, (_, index) => existingNames[index] || getDefaultPartnerName(index));
};

const cleanPartnerNames = (names) =>
  (Array.isArray(names) ? names : [])
    .map((name) => name.trim())
    .filter(Boolean);

const buildPartnersFromNames = (names = []) => {
  const cleanedNames = cleanPartnerNames(names);
  if (!cleanedNames.length) {
    return INITIAL_PARTNERS.map((partner) => ({ ...partner }));
  }

  const equalShare = formatSharePercent(100 / cleanedNames.length);
  return cleanedNames.map((name, index) => createPartnerState(index + 1, name, equalShare));
};

const createDocumentItem = () => ({
  description: "",
  quantity: "1",
  unit_price: "",
});

const createInvoiceFormState = () => ({
  customer_name: "",
  customer_email: "",
  due_date: "",
  tax_rate: "16",
  status: "sent",
  notes: "",
  items: [createDocumentItem()],
});

const createBillFormState = () => ({
  vendor_name: "",
  due_date: "",
  tax_rate: "16",
  status: "approved",
  notes: "",
  items: [createDocumentItem()],
});

const createTaxProfileState = () => ({
  jurisdiction_code: "generic",
  filing_frequency: "monthly",
  registration_number: "",
  currency_code: "USD",
  sales_tax_name: "Sales Tax",
  purchase_tax_name: "Purchase Tax Credit",
  indirect_tax_rate: "16",
  income_tax_rate: "30",
  period_start_month: "1",
});

const createAccountFormState = () => ({
  code: "",
  name: "",
  category: "expense",
  subtype: "operating",
  normal_balance: "debit",
  description: "",
});

const createJournalLine = () => ({
  account_code: "",
  debit: "",
  credit: "",
  description: "",
});

const createJournalFormState = () => ({
  memo: "",
  entry_date: "",
  reference: "",
  lines: [createJournalLine(), createJournalLine()],
});

const createVendorFormState = () => ({
  vendor_name: "",
  email: "",
  tax_id: "",
  default_payment_rail: "ach",
  is_1099_eligible: true,
  tax_form_type: "1099-NEC",
  tin_status: "pending",
  bank_last4: "",
  remittance_reference: "",
});

const createReconciliationRuleState = () => ({
  name: "",
  keyword: "",
  direction: "any",
  auto_action: "suggest_account",
  target_reference: "",
  exception_type: "review_required",
  priority: "100",
  min_amount: "",
  max_amount: "",
});

const createTaxFilingFormState = () => ({
  filing_type: "indirect_tax",
  period_start: "",
  period_end: "",
});

const createEmployeeFormState = () => ({
  full_name: "",
  email: "",
  pay_type: "hourly",
  hourly_rate: "",
  salary_amount: "",
  withholding_rate: "10",
  benefit_rate: "5",
});

const createContractorFormState = () => ({
  full_name: "",
  email: "",
  tax_id: "",
  default_rate: "",
  is_1099_eligible: true,
  tax_form_type: "1099-NEC",
});

const createTimeEntryFormState = () => ({
  employee_id: "",
  contractor_id: "",
  project_id: "",
  work_date: "",
  hours: "",
  hourly_cost: "",
  billable_rate: "",
  description: "",
});

const createMileageFormState = () => ({
  employee_id: "",
  contractor_id: "",
  project_id: "",
  trip_date: "",
  miles: "",
  rate_per_mile: "0.725",
  purpose: "",
});

const createInventoryItemFormState = () => ({
  sku: "",
  name: "",
  category: "",
  quantity_on_hand: "",
  reorder_point: "",
  reorder_quantity: "",
  unit_cost: "",
  unit_price: "",
  preferred_vendor_name: "",
});

const createPurchaseOrderItem = () => ({
  sku: "",
  description: "",
  quantity: "",
  unit_cost: "",
});

const createPurchaseOrderFormState = () => ({
  vendor_name: "",
  issue_date: "",
  expected_date: "",
  notes: "",
  items: [createPurchaseOrderItem()],
});

const createProjectFormState = () => ({
  project_code: "",
  name: "",
  customer_name: "",
  status: "active",
  budget_revenue: "",
  budget_cost: "",
  notes: "",
});

const createProjectCostFormState = () => ({
  project_id: "",
  entry_type: "cost",
  description: "",
  amount: "",
  reference: "",
  work_date: "",
});

const createIntegrationFormState = () => ({
  provider: "stripe",
});

const cloneTemplateRows = (rows) => rows.map((row, index) => ({ ...row, id: index + 1 }));

const normalizeLedgerRows = (rows, fallbackBusinessType = "sole_proprietor") => {
  if (!Array.isArray(rows) || !rows.length) {
    return cloneTemplateRows(BUSINESS_TEMPLATE_ROWS[fallbackBusinessType] || INITIAL_LEDGER_ROWS);
  }

  return rows.map((row, index) => ({
    id: index + 1,
    account: row.account || "",
    type: row.type || "expense",
    subtype: row.subtype || getSubtypeOptions(row.type || "expense")[0],
    amount: row.amount ?? "",
    depreciation: row.depreciation ?? "",
  }));
};

const normalizePartners = (partners, fallbackNames = []) => {
  if (!Array.isArray(partners) || !partners.length) {
    return buildPartnersFromNames(fallbackNames);
  }

  return partners.map((partner, index) => ({
    id: partner.id ?? index + 1,
    name: partner.name || getDefaultPartnerName(index),
    capital: partner.capital ?? "",
    currentAccount: partner.currentAccount ?? "",
    share: partner.share ?? "",
    drawings: partner.drawings ?? "",
    interestOnCapital: partner.interestOnCapital ?? "",
    salary: partner.salary ?? "",
    monthlySalary: partner.monthlySalary ?? "",
  }));
};

const getAccountGroupLabel = (row) => {
  if (row.type === "asset") {
    return row.subtype === "non-current" ? "Non-Current Assets" : "Current Assets";
  }
  if (row.type === "liability") {
    return row.subtype === "non-current" ? "Non-Current Liabilities" : "Current Liabilities";
  }
  if (row.type === "expense") {
    if (MANUFACTURING_SIGNAL_ACCOUNTS.has(normalizeAccountKey(row.account))) {
      return "Manufacturing Costs";
    }
    return row.subtype === "other" ? "Other Expenses" : "Operating Expenses";
  }
  if (row.type === "revenue") {
    return row.subtype === "other" ? "Other Income" : "Trading Revenue";
  }
  if (row.type === "capital" || row.type === "drawings") {
    return "Equity";
  }
  return "Other";
};

const deriveManufacturingInputsFromRows = (rows) => {
  const totals = rows.reduce((acc, row) => {
    const key = (row.account || "").trim().toLowerCase();
    if (!key) {
      return acc;
    }
    acc[key] = (acc[key] || 0) + toAmount(row.amount);
    return acc;
  }, {});

  const sumAccounts = (...names) => names.reduce((sum, name) => sum + (totals[name.toLowerCase()] || 0), 0);

  return {
    openingRawMaterials: sumAccounts("Raw Materials Opening Stock", "Opening Raw Materials") || "",
    purchases: sumAccounts("Purchases", "Purchases of Raw Materials") || "",
    carriageInwards: sumAccounts("Carriage Inwards") || "",
    returnsOutwards: sumAccounts("Returns Outwards") || "",
    closingRawMaterials: sumAccounts("Closing Raw Materials") || "",
    directLabour: sumAccounts("Direct Labour", "Direct Manufacturing Labor") || "",
    factoryIndirectLabor: sumAccounts("Factory Indirect Labor") || "",
    factoryUtilities: sumAccounts("Factory Utilities") || "",
    depreciationFactoryEquipment: sumAccounts("Depreciation of Factory Equipment") || "",
    factoryExpenses: sumAccounts("Factory Expenses", "Factory Overheads") || "",
    openingWip: sumAccounts("Opening Work in Progress") || "",
    closingWip: sumAccounts("Closing Work in Progress") || "",
  };
};

const detectBusinessTypeFromRows = (rows) => {
  const accountNames = rows.map((row) => normalizeAccountKey(row.account));
  if (accountNames.some((name) => MANUFACTURING_SIGNAL_ACCOUNTS.has(name))) {
    return "manufacturing";
  }
  if (accountNames.some((name) => PARTNERSHIP_SIGNAL_ACCOUNTS.has(name))) {
    return "partnership";
  }
  return "sole_proprietor";
};

export default function App() {
  const [token, setToken] = useState(() => readStoredToken());
  const [email, setEmail] = useState(() => readStoredEmail());
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetRequestEmail, setResetRequestEmail] = useState(() => readStoredEmail());
  const [resetToken, setResetToken] = useState(() => readResetTokenFromLocation());
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetPreviewLink, setResetPreviewLink] = useState("");
  const [authMode, setAuthMode] = useState(() => readInitialAuthMode());
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [themeMode, setThemeMode] = useState(() => readStoredTheme());
  const [businessType, setBusinessType] = useState(() => readStoredBusinessType());
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyType, setNewCompanyType] = useState("sole_proprietor");
  const [newCompanyPartnerCount, setNewCompanyPartnerCount] = useState(MIN_PARTNER_COUNT);
  const [newCompanyPartnerNames, setNewCompanyPartnerNames] = useState(() => createPartnerNameInputs(MIN_PARTNER_COUNT));
  const [setupBusinessType, setSetupBusinessType] = useState("sole_proprietor");
  const [setupPartnerCount, setSetupPartnerCount] = useState(MIN_PARTNER_COUNT);
  const [setupPartnerNames, setSetupPartnerNames] = useState(() => createPartnerNameInputs(MIN_PARTNER_COUNT));
  const [setupSaving, setSetupSaving] = useState(false);

  const [file, setFile] = useState(null);
  const [stats, setStats] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [taxSummary, setTaxSummary] = useState(null);
  const [taxProfile, setTaxProfile] = useState(() => createTaxProfileState());
  const [taxFilingPreview, setTaxFilingPreview] = useState(null);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [accountingOverviewData, setAccountingOverviewData] = useState(null);
  const [accountRegister, setAccountRegister] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [vendor1099Summary, setVendor1099Summary] = useState(null);
  const [billPaySummary, setBillPaySummary] = useState(null);
  const [reconciliationRules, setReconciliationRules] = useState([]);
  const [reconciliationWorkspaceData, setReconciliationWorkspaceData] = useState(null);
  const [taxJurisdictions, setTaxJurisdictions] = useState([]);
  const [taxFilings, setTaxFilings] = useState([]);
  const [workforceOverviewData, setWorkforceOverviewData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [mileageEntries, setMileageEntries] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [inventoryWorkspace, setInventoryWorkspace] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectSummaryData, setProjectSummaryData] = useState(null);
  const [accountantToolkitData, setAccountantToolkitData] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [receivablesData, setReceivablesData] = useState(null);
  const [payablesData, setPayablesData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [bankConnections, setBankConnections] = useState([]);
  const [bankingProviders, setBankingProviders] = useState({});
  const [reconciliationItems, setReconciliationItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [userCountUpdating, setUserCountUpdating] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [billingPlans, setBillingPlans] = useState([]);
  const [billingSummaryData, setBillingSummaryData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState("");
  const [mpesaCheckout, setMpesaCheckout] = useState(null);
  const [aiCfoOverviewData, setAiCfoOverviewData] = useState(null);
  const [aiCfoQuestion, setAiCfoQuestion] = useState("");
  const [aiCfoAnswer, setAiCfoAnswer] = useState(null);
  const [aiCfoLoading, setAiCfoLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState("cashier");
  const [maintenance, setMaintenance] = useState({
    maintenance: false,
    message: "[System Under Maintainance]",
    environment: "production",
    version: "unknown",
  });
  const [extracting, setExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [ledgerRows, setLedgerRows] = useState(INITIAL_LEDGER_ROWS);
  const [budgetTargets, setBudgetTargets] = useState(INITIAL_BUDGET_TARGETS);
  const [manufacturingInputs, setManufacturingInputs] = useState(INITIAL_MANUFACTURING_INPUTS);
  const [partners, setPartners] = useState(INITIAL_PARTNERS);
  const [partnershipAdjustments, setPartnershipAdjustments] = useState(INITIAL_PARTNERSHIP_ADJUSTMENTS);
  const [scenarioInputs, setScenarioInputs] = useState(INITIAL_SCENARIO_INPUTS);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(() => createInvoiceFormState());
  const [billForm, setBillForm] = useState(() => createBillFormState());
  const [bankFeedFile, setBankFeedFile] = useState(null);
  const [plaidLinkToken, setPlaidLinkToken] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickEntryId, setQuickEntryId] = useState("invoice-on-credit");
  const [accountForm, setAccountForm] = useState(() => createAccountFormState());
  const [journalForm, setJournalForm] = useState(() => createJournalFormState());
  const [vendorForm, setVendorForm] = useState(() => createVendorFormState());
  const [reconciliationRuleForm, setReconciliationRuleForm] = useState(() => createReconciliationRuleState());
  const [taxFilingForm, setTaxFilingForm] = useState(() => createTaxFilingFormState());
  const [employeeForm, setEmployeeForm] = useState(() => createEmployeeFormState());
  const [contractorForm, setContractorForm] = useState(() => createContractorFormState());
  const [timeEntryForm, setTimeEntryForm] = useState(() => createTimeEntryFormState());
  const [mileageForm, setMileageForm] = useState(() => createMileageFormState());
  const [inventoryItemForm, setInventoryItemForm] = useState(() => createInventoryItemFormState());
  const [purchaseOrderForm, setPurchaseOrderForm] = useState(() => createPurchaseOrderFormState());
  const [projectForm, setProjectForm] = useState(() => createProjectFormState());
  const [projectCostForm, setProjectCostForm] = useState(() => createProjectCostFormState());
  const [integrationForm, setIntegrationForm] = useState(() => createIntegrationFormState());
  const [selectedRegisterAccountId, setSelectedRegisterAccountId] = useState("");
  const isDarkMode = themeMode === "dark";

  const availableQuickEntries = useMemo(
    () => QUICK_ENTRY_TEMPLATES.filter((template) => template.businessTypes.includes(businessType)),
    [businessType],
  );
  const activeLayout = BUSINESS_LAYOUT_CONFIG[businessType] || BUSINESS_LAYOUT_CONFIG.sole_proprietor;
  const suggestedAccountOptions = useMemo(() => {
    const options = new Map();
    (BUSINESS_TEMPLATE_ROWS[businessType] || []).forEach((entry) => {
      options.set(entry.account.toLowerCase(), entry.account);
    });
    ledgerRows.forEach((row) => {
      const account = (row.account || "").trim();
      if (account) {
        options.set(account.toLowerCase(), account);
      }
    });
    return Array.from(options.values()).sort((left, right) => left.localeCompare(right));
  }, [businessType, ledgerRows]);
  const depreciableAssetOptions = useMemo(() => {
    const options = new Map();
    COMMON_DEPRECIABLE_ASSETS.forEach((name) => {
      options.set(normalizeAccountKey(name), name);
    });
    ledgerRows
      .filter((row) => row.type === "asset" && row.subtype === "non-current" && (row.account || "").trim())
      .forEach((row) => {
        options.set(normalizeAccountKey(row.account), row.account.trim());
      });
    return Array.from(options.values()).sort((left, right) => left.localeCompare(right));
  }, [ledgerRows]);

  const selectedCompany = useMemo(
    () => companies.find((company) => String(company.id) === String(selectedCompanyId)) || null,
    [companies, selectedCompanyId],
  );
  const needsCompanySetup = Boolean(selectedCompany && !selectedCompany.onboarding_complete);
  const currentPlanCode = currentUser?.subscription?.plan_code || billingSummaryData?.plan_code || "free";
  const hasProPlan = currentPlanCode === "pro" || currentPlanCode === "ai";
  const hasAiPlan = currentPlanCode === "ai";
  const canConfigureCompany = ["owner", "admin"].includes(currentUser?.role || "");
  const canManageFinanceOps = ["owner", "admin", "manager", "accountant", "cashier"].includes(currentUser?.role || "");
  const canManagePayables = ["owner", "admin", "manager", "accountant"].includes(currentUser?.role || "");

  const groupedLedgerRows = useMemo(() => {
    return ledgerRows.reduce((groups, row) => {
      const group = getAccountGroupLabel(row);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(row);
      return groups;
    }, {});
  }, [ledgerRows]);

  const chartData = useMemo(() => {
    if (!stats) {
      return [];
    }
    return [
      { name: "Reports", value: stats.reports || 0 },
      { name: "Users", value: stats.users || 0 },
      { name: "Usage", value: stats.usage || 0 },
    ];
  }, [stats]);

  const statement = useMemo(() => {
    const totals = {
      revenue: 0,
      assetsCurrent: 0,
      assetsNonCurrentGross: 0,
      nonCurrentAccumulatedDepreciation: 0,
      assetsNonCurrent: 0,
      liabilitiesCurrent: 0,
      liabilitiesNonCurrent: 0,
      capital: 0,
      drawings: 0,
    };

    for (const row of ledgerRows) {
      const amount = toAmount(row.amount);
      if (!amount) {
        continue;
      }

      if (row.type === "revenue") {
        totals.revenue += amount;
      } else if (row.type === "expense") {
        continue;
      } else if (row.type === "asset") {
        if (row.subtype === "non-current") {
          const depreciation = Math.max(0, toAmount(row.depreciation));
          const netAmount = Math.max(0, amount - depreciation);
          totals.assetsNonCurrentGross += amount;
          totals.nonCurrentAccumulatedDepreciation += depreciation;
          totals.assetsNonCurrent += netAmount;
        } else {
          totals.assetsCurrent += amount;
        }
      } else if (row.type === "liability") {
        if (row.subtype === "non-current") {
          totals.liabilitiesNonCurrent += amount;
        } else {
          totals.liabilitiesCurrent += amount;
        }
      } else if (row.type === "capital") {
        totals.capital += amount;
      } else if (row.type === "drawings") {
        totals.drawings += amount;
      }
    }

    const accountTotals = ledgerRows.reduce((acc, row) => {
      const key = normalizeAccountKey(row.account);
      if (!key) {
        return acc;
      }
      acc[key] = (acc[key] || 0) + toAmount(row.amount);
      return acc;
    }, {});

    const amountByAccount = (...names) =>
      names.reduce((sum, name) => sum + (accountTotals[normalizeAccountKey(name)] || 0), 0);

    const partnershipInterestRate = businessType === "partnership" ? toAmount(partnershipAdjustments.interestRate) : 0;
    const interestOnDrawingsRate = businessType === "partnership" ? toAmount(partnershipAdjustments.interestOnDrawingsRate) : 0;
    const salaryArrearsAdjustment = businessType === "partnership" ? toAmount(partnershipAdjustments.salaryArrears) : 0;
    const prepaidExpenseAdjustment = businessType === "partnership" ? toAmount(partnershipAdjustments.prepaidExpenseAdjustment) : 0;
    const depreciationAdjustmentRate = businessType === "partnership" ? toAmount(partnershipAdjustments.depreciationRate) : 0;
    const depreciationAdjustmentAsset = (partnershipAdjustments.depreciationAsset || "").trim();
    const depreciationAdjustmentAssetKey = normalizeAccountKey(depreciationAdjustmentAsset);
    const depreciationAdjustmentBase = depreciationAdjustmentAssetKey
      ? ledgerRows.reduce((sum, row) => (
        row.type === "asset" &&
        row.subtype === "non-current" &&
        normalizeAccountKey(row.account) === depreciationAdjustmentAssetKey
          ? sum + toAmount(row.amount)
          : sum
      ), 0)
      : 0;
    const depreciationAdjustmentAmount =
      depreciationAdjustmentRate > 0 && depreciationAdjustmentBase > 0
        ? (depreciationAdjustmentBase * depreciationAdjustmentRate) / 100
        : 0;
    const adjustedNonCurrentAccumulatedDepreciation =
      totals.nonCurrentAccumulatedDepreciation + depreciationAdjustmentAmount;
    const adjustedNonCurrentAssets = Math.max(0, totals.assetsNonCurrentGross - adjustedNonCurrentAccumulatedDepreciation);
    const adjustedCurrentLiabilities = totals.liabilitiesCurrent + salaryArrearsAdjustment;
    const adjustedCurrentAssets = totals.assetsCurrent + prepaidExpenseAdjustment;

    const grossSales = amountByAccount("Gross Sales", "Sales Revenue", "Sales");
    const openingStock = amountByAccount("Opening Stock");
    const closingStock = amountByAccount("Closing Stock");
    const purchases = amountByAccount("Purchases");
    const returnsOutwards = amountByAccount("Returns Outwards");
    const carriageInwardsLedger = amountByAccount("Carriage Inwards");
    const salesReturns = amountByAccount("Sales Returns");
    const goodsReturn = amountByAccount("Goods Return") + salesReturns;
    const discounts = amountByAccount("Discounts");
    const badDebts = amountByAccount("Bad Debts");
    const netSales = grossSales - goodsReturn - discounts;

    const rawMaterialsOpening =
      toAmount(manufacturingInputs.openingRawMaterials) ||
      amountByAccount("Raw Materials Opening Stock", "Opening Raw Materials");
    const rawMaterialsPurchases = toAmount(manufacturingInputs.purchases) || purchases;
    const rawMaterialsCarriage = toAmount(manufacturingInputs.carriageInwards) || carriageInwardsLedger;
    const rawMaterialsReturns = toAmount(manufacturingInputs.returnsOutwards) || returnsOutwards;
    const rawMaterialsClosing =
      toAmount(manufacturingInputs.closingRawMaterials) || amountByAccount("Closing Raw Materials");
    const directLabour =
      toAmount(manufacturingInputs.directLabour) || amountByAccount("Direct Labour", "Direct Manufacturing Labor");
    const factoryIndirectLabor =
      toAmount(manufacturingInputs.factoryIndirectLabor) || amountByAccount("Factory Indirect Labor");
    const factoryUtilities =
      toAmount(manufacturingInputs.factoryUtilities) || amountByAccount("Factory Utilities");
    const depreciationFactoryEquipment =
      toAmount(manufacturingInputs.depreciationFactoryEquipment) || amountByAccount("Depreciation of Factory Equipment");
    const factoryExpenses =
      toAmount(manufacturingInputs.factoryExpenses) || amountByAccount("Factory Expenses", "Factory Overheads");
    const rawMaterialsAvailable = rawMaterialsOpening + rawMaterialsPurchases + rawMaterialsCarriage - rawMaterialsReturns;
    const rawMaterialsUsed = rawMaterialsAvailable - rawMaterialsClosing;
    const primeCost = rawMaterialsUsed + directLabour;
    const totalFactoryOverheads =
      factoryIndirectLabor + factoryUtilities + depreciationFactoryEquipment + factoryExpenses;
    const totalFactoryCost = primeCost + totalFactoryOverheads;
    const openingWip =
      toAmount(manufacturingInputs.openingWip) || amountByAccount("Opening Work in Progress");
    const closingWip =
      toAmount(manufacturingInputs.closingWip) || amountByAccount("Closing Work in Progress");
    const costOfGoodsManufactured = totalFactoryCost + openingWip - closingWip;
    const costOfProduction = costOfGoodsManufactured;

    const costOfGoodsAvailable = businessType === "manufacturing"
      ? openingStock + costOfGoodsManufactured
      : openingStock + (purchases - returnsOutwards + carriageInwardsLedger);
    const cogs = costOfGoodsAvailable - closingStock;
    const grossProfit = netSales - cogs;
    const incomeFromRevenue = netSales - cogs;

    const interestReceived = amountByAccount("Interest Received");
    const rentalIncome = amountByAccount("Rental Income");
    const miscIncome = amountByAccount("Miscellaneous Income");
    const incomeFromOtherSources = interestReceived + rentalIncome + miscIncome;
    const grossIncome = incomeFromRevenue + incomeFromOtherSources;

    const payrollExpenses =
      amountByAccount("Payroll Expenses", "Salaries", "Salaries Expense", "Salaries and Wages", "Wages", "Wages and Salaries") +
      salaryArrearsAdjustment;
    const advertisingExpenses = amountByAccount("Advertising Expenses");
    const marketingExpenses = amountByAccount("Marketing Expenses");
    const motorExpenses = amountByAccount("Motor Expenses");
    const officeExpenses = amountByAccount("Office Expenses");
    const generalExpenses = amountByAccount("General Expenses");
    const carriageOutwards = amountByAccount("Carriage Outwards");
    const rentExpense = amountByAccount("Rent Expense");
    const utilitiesExpense = amountByAccount("Utilities Expense");
    const licenseFees = amountByAccount("License Fees");
    const interestPaidOnLoans = amountByAccount("Interest Paid on Loans");
    const insurancePremiums = amountByAccount("Insurance Premiums");
    const otherMiscExpenses = amountByAccount("Other Miscellaneous Expenses");
    const depreciation =
      amountByAccount(
        "Depreciation Expense",
        "Depreciation on Plant and Machinery",
        "Depreciation of Plant and Machinery",
        "Depreciation on Plant and Equipment",
        "Depreciation on Machinery and Equipment",
      ) + depreciationAdjustmentAmount;
    const lossOnSale = amountByAccount("Loss on Sale of Asset");
    const totalExpensesDetailed =
      payrollExpenses +
      advertisingExpenses +
      marketingExpenses +
      motorExpenses +
      officeExpenses +
      generalExpenses +
      carriageOutwards +
      rentExpense +
      utilitiesExpense +
      licenseFees +
      interestPaidOnLoans +
      insurancePremiums +
      otherMiscExpenses +
      depreciation +
      lossOnSale +
      badDebts -
      prepaidExpenseAdjustment;

    const profitBeforeTax = grossProfit + incomeFromOtherSources - totalExpensesDetailed;
    const incomeTaxExpense = amountByAccount("Income Tax Expense");
    const netProfitAfterTax = profitBeforeTax - incomeTaxExpense;

    const interestOnBorrowings = amountByAccount("Interest on Borrowings");
    const interestIncome = amountByAccount("Interest Received");
    const dividendIncome = amountByAccount("Dividend Income");
    const profitOnSale = amountByAccount("Profit on Sale of Asset");
    const operatingProfitBeforeWorkingCapital =
      profitBeforeTax +
      depreciation +
      interestOnBorrowings +
      lossOnSale -
      interestIncome -
      dividendIncome -
      profitOnSale;

    const decreaseCurrentAssets = amountByAccount("Decrease in Current Assets");
    const increaseCurrentAssets = amountByAccount("Increase in Current Assets");
    const increaseCurrentLiabilities = amountByAccount("Increase in Current Liabilities");
    const decreaseCurrentLiabilities = amountByAccount("Decrease in Current Liabilities");
    const adjustedIncreaseCurrentAssets = increaseCurrentAssets + prepaidExpenseAdjustment;
    const adjustedIncreaseCurrentLiabilities = increaseCurrentLiabilities + salaryArrearsAdjustment;
    const workingCapitalAdjustments =
      decreaseCurrentAssets +
      adjustedIncreaseCurrentLiabilities -
      adjustedIncreaseCurrentAssets -
      decreaseCurrentLiabilities;

    const cashBalance = amountByAccount("Cash", "Cash and Cash Equivalents");
    const receivablesBalance = amountByAccount("Accounts Receivable");
    const inventoryBalance =
      amountByAccount("Inventory") +
      closingStock +
      rawMaterialsClosing +
      closingWip;
    const payablesBalance = amountByAccount("Accounts Payable", "Accrued Expenses") + salaryArrearsAdjustment;

    const cashGeneratedFromOperations = operatingProfitBeforeWorkingCapital + workingCapitalAdjustments;
    const incomeTaxesPaid = amountByAccount("Income Taxes Paid");
    const netCashFromOperations = cashGeneratedFromOperations - incomeTaxesPaid;

    const totalPartnerRatio = partners.reduce((sum, partner) => sum + Math.max(0, toAmount(partner.share)), 0) || 1;
    const partnerAppropriation = partners.map((partner) => {
      const ratio = Math.max(0, toAmount(partner.share));
      const manualInterestAmount = toAmount(partner.interestOnCapital);
      const interestAmount =
        manualInterestAmount || (partnershipInterestRate > 0
          ? (toAmount(partner.capital) * partnershipInterestRate) / 100
          : 0);
      const salaryAmount = toAmount(partner.salary) || (toAmount(partner.monthlySalary) * 12);
      const interestOnDrawingsAmount = interestOnDrawingsRate > 0
        ? (toAmount(partner.drawings) * interestOnDrawingsRate) / 100
        : 0;
      return {
        ...partner,
        ratio,
        interestAmount,
        salaryAmount,
        interestOnDrawingsAmount,
      };
    });
    const appropriationInterest = partnerAppropriation.reduce((sum, partner) => sum + partner.interestAmount, 0);
    const appropriationSalary = partnerAppropriation.reduce((sum, partner) => sum + partner.salaryAmount, 0);
    const appropriationInterestOnDrawings =
      partnerAppropriation.reduce((sum, partner) => sum + partner.interestOnDrawingsAmount, 0);
    const appropriationBase = netProfitAfterTax + appropriationInterestOnDrawings - appropriationInterest - appropriationSalary;
    const settledPartnerAppropriation = partnerAppropriation.map((partner) => {
      const shareOfProfit = appropriationBase * (partner.ratio / totalPartnerRatio);
      const closingCurrentAccount =
        toAmount(partner.currentAccount) +
        partner.interestAmount +
        partner.salaryAmount +
        shareOfProfit -
        toAmount(partner.drawings) -
        partner.interestOnDrawingsAmount;
      const totalEquity = toAmount(partner.capital) + closingCurrentAccount;
      return {
        ...partner,
        shareOfProfit,
        closingCurrentAccount,
        totalEquity,
      };
    });

    const partnershipCapital = settledPartnerAppropriation.reduce((sum, partner) => sum + partner.totalEquity, 0);
    const equity =
      businessType === "partnership" ? partnershipCapital : totals.capital + netProfitAfterTax - totals.drawings;
    const totalAssets = adjustedCurrentAssets + adjustedNonCurrentAssets;
    const totalLiabilities = adjustedCurrentLiabilities + totals.liabilitiesNonCurrent;
    const liabilitiesAndEquity = totalLiabilities + equity;
    const operatingCashInflows = netSales + incomeFromOtherSources;
    const operatingCashOutflows = totalExpensesDetailed + incomeTaxExpense;
    const netOperatingCashFlow = operatingCashInflows - operatingCashOutflows;
    const investingCashOutflows = adjustedNonCurrentAssets;
    const financingInflows = businessType === "partnership" ? partnershipCapital : totals.capital;
    const financingOutflows =
      businessType === "partnership"
        ? partners.reduce((sum, partner) => sum + toAmount(partner.drawings), 0)
        : totals.drawings;
    const netCashFlow = netOperatingCashFlow - investingCashOutflows + financingInflows - financingOutflows;

    return {
      ...totals,
      businessType,
      assetsCurrent: adjustedCurrentAssets,
      liabilitiesCurrent: adjustedCurrentLiabilities,
      nonCurrentAccumulatedDepreciation: adjustedNonCurrentAccumulatedDepreciation,
      assetsNonCurrent: adjustedNonCurrentAssets,
      openingStock,
      closingStock,
      purchases,
      returnsOutwards,
      carriageInwards: carriageInwardsLedger,
      netSales,
      incomeFromRevenue,
      rawMaterialsOpening,
      rawMaterialsPurchases,
      rawMaterialsCarriage,
      rawMaterialsReturns,
      rawMaterialsClosing,
      rawMaterialsAvailable,
      rawMaterialsUsed,
      directLabour,
      primeCost,
      factoryIndirectLabor,
      factoryUtilities,
      depreciationFactoryEquipment,
      factoryExpenses,
      totalFactoryOverheads,
      totalFactoryCost,
      openingWip,
      closingWip,
      costOfGoodsManufactured,
      costOfProduction,
      costOfGoodsAvailable,
      grossProfit,
      equity,
      totalAssets,
      totalLiabilities,
      liabilitiesAndEquity,
      balanceDelta: totalAssets - liabilitiesAndEquity,
      operatingCashInflows,
      operatingCashOutflows,
      netOperatingCashFlow,
      investingCashOutflows,
      financingInflows,
      financingOutflows,
      netCashFlow,
      grossSales,
      goodsReturn,
      discounts,
      badDebts,
      cogs,
      interestReceived,
      rentalIncome,
      miscIncome,
      incomeFromOtherSources,
      grossIncome,
      payrollExpenses,
      advertisingExpenses,
      marketingExpenses,
      motorExpenses,
      officeExpenses,
      generalExpenses,
      carriageOutwards,
      rentExpense,
      utilitiesExpense,
      licenseFees,
      interestPaidOnLoans,
      insurancePremiums,
      otherMiscExpenses,
      totalExpensesDetailed,
      profitBeforeTax,
      incomeTaxExpense,
      netProfitAfterTax,
      depreciation,
      interestOnBorrowings,
      lossOnSale,
      interestIncome,
      dividendIncome,
      profitOnSale,
      operatingProfitBeforeWorkingCapital,
      decreaseCurrentAssets,
      increaseCurrentAssets: adjustedIncreaseCurrentAssets,
      increaseCurrentLiabilities,
      decreaseCurrentLiabilities,
      workingCapitalAdjustments,
      adjustedIncreaseCurrentLiabilities,
      cashGeneratedFromOperations,
      incomeTaxesPaid,
      netCashFromOperations,
      cashBalance,
      receivablesBalance,
      inventoryBalance,
      payablesBalance,
      partnershipInterestRate,
      interestOnDrawingsRate,
      salaryArrearsAdjustment,
      prepaidExpenseAdjustment,
      depreciationAdjustmentRate,
      depreciationAdjustmentAsset,
      depreciationAdjustmentBase,
      depreciationAdjustmentAmount,
      appropriationInterest,
      appropriationSalary,
      appropriationInterestOnDrawings,
      appropriationBase,
      partnerAppropriation: settledPartnerAppropriation,
    };
  }, [ledgerRows, businessType, manufacturingInputs, partners, partnershipAdjustments]);

  const statementGraphData = useMemo(
    () => [
      {
        name: businessType === "manufacturing" ? "Cost of Production" : "Gross Profit",
        actual: businessType === "manufacturing" ? statement.costOfProduction : statement.grossProfit,
        budget: toAmount(budgetTargets.revenue),
      },
      {
        name: "Net Profit",
        actual: statement.netProfitAfterTax,
        budget: toAmount(budgetTargets.expense),
      },
      { name: "Assets", actual: statement.totalAssets, budget: toAmount(budgetTargets.totalAssets) },
      { name: "Liabilities", actual: statement.totalLiabilities, budget: toAmount(budgetTargets.totalLiabilities) },
      { name: "Equity", actual: statement.equity, budget: toAmount(budgetTargets.equity) },
      { name: "Net Cash Flow", actual: statement.netCashFromOperations || statement.netCashFlow, budget: toAmount(budgetTargets.netCashFlow) },
    ],
    [statement, budgetTargets],
  );

  const executiveMetrics = useMemo(
    () => buildExecutiveMetrics(statement, dashboardStats, stats),
    [statement, dashboardStats, stats],
  );

  const operatingSignals = useMemo(
    () => buildOperatingSignals(statement),
    [statement],
  );

  const forecastModel = useMemo(
    () => buildForecastModel(statement, scenarioInputs),
    [statement, scenarioInputs],
  );

  const financeAlerts = useMemo(
    () => buildFinanceAlerts(statement, executiveMetrics, forecastModel),
    [statement, executiveMetrics, forecastModel],
  );

  const boardNarrative = useMemo(
    () => buildBoardNarrative(selectedCompany?.name, statement, executiveMetrics, forecastModel),
    [selectedCompany, statement, executiveMetrics, forecastModel],
  );

  const parseApiResponse = async (response) => {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }
    try {
      const text = await response.text();
      return { error: text || "Unexpected response format" };
    } catch {
      return { error: "Unexpected response format" };
    }
  };

  const authorizedFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    const payload = await parseApiResponse(response);

    if (!response.ok) {
      const message = payload.error || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return payload;
  };

  const buildCompanyQuery = (companyId = selectedCompanyId) =>
    companyId ? `?company_id=${encodeURIComponent(companyId)}` : "";

  const switchAuthMode = (nextMode) => {
    if (nextMode !== "reset") {
      updatePasswordResetLocation("");
    }
    setAuthMode(nextMode);
    setErrorMessage("");
    setInfoMessage("");
  };

  const openForgotPassword = () => {
    setResetRequestEmail((email || registerEmail || readStoredEmail()).trim());
    setResetPreviewLink("");
    setResetToken("");
    setResetPassword("");
    setResetConfirmPassword("");
    switchAuthMode("forgot");
  };

  const login = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!email || !password) {
      setErrorMessage("Email and password are required.");
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse(response);
      if (!response.ok || !data.token) {
        throw new Error(data.error || "Login failed");
      }

      updatePasswordResetLocation("");
      setResetPreviewLink("");
      setResetToken("");
      setResetPassword("");
      setResetConfirmPassword("");
      setToken(data.token);
      if (rememberMe) {
        persistToken(data.token);
        persistEmail(email);
      }
      setInfoMessage("Signed in successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const validatePartnershipNames = (names, expectedCount) => {
    const trimmedNames = cleanPartnerNames(names);
    if (trimmedNames.length !== clampPartnerCount(expectedCount)) {
      throw new Error("Enter every partner name before continuing.");
    }

    const uniqueNames = new Set(trimmedNames.map((name) => name.toLowerCase()));
    if (uniqueNames.size !== trimmedNames.length) {
      throw new Error("Partner names must be unique.");
    }

    return trimmedNames;
  };

  const requestPasswordReset = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!resetRequestEmail.trim()) {
      setErrorMessage("Email is required.");
      return;
    }

    setAuthLoading(true);
    try {
      const normalizedEmail = resetRequestEmail.trim().toLowerCase();
      const response = await fetch(`${API_URL}/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to request password reset");
      }

      persistEmail(normalizedEmail);
      setResetRequestEmail(normalizedEmail);
      setEmail(normalizedEmail);

      if (data.reset_token) {
        setResetToken(data.reset_token);
        setResetPreviewLink(data.reset_link || "");
        updatePasswordResetLocation(data.reset_token);
        setAuthMode("reset");
        setInfoMessage("Reset link prepared in preview mode. Enter your new password below.");
      } else {
        setResetPreviewLink("");
        setInfoMessage(data.msg || "If your account exists, check your email for reset instructions.");
      }
    } catch (error) {
      setErrorMessage(error.message || "Failed to request password reset");
    } finally {
      setAuthLoading(false);
    }
  };

  const submitPasswordReset = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!resetToken.trim() || !resetPassword) {
      setErrorMessage("Reset token and new password are required.");
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken.trim(),
          password: resetPassword,
        }),
      });

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setPassword("");
      setResetPassword("");
      setResetConfirmPassword("");
      setResetPreviewLink("");
      setResetToken("");
      updatePasswordResetLocation("");
      setAuthMode("login");
      setInfoMessage(data.msg || "Password reset complete. Sign in with your new password.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to reset password");
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!registerEmail || !registerPassword) {
      setErrorMessage("Email and password are required.");
      return;
    }

    if (registerPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    const derivedOrg =
      org.trim() ||
      (registerEmail.includes("@") ? registerEmail.split("@")[0] : registerEmail).trim() ||
      "My Business";

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org: derivedOrg,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      persistEmail(registerEmail);
      setEmail(registerEmail);
      setPassword(registerPassword);
      setOrg("");
      setRegisterEmail("");
      setRegisterPassword("");
      setConfirmPassword("");
      switchAuthMode("login");
      setInfoMessage("Registration complete. Sign in with the same credentials.");
    } catch (error) {
      setErrorMessage(error.message || "Registration failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await authorizedFetch("/logout", { method: "POST" });
      }
    } catch {
      // Ignore logout API failures and clear client session anyway.
    }
    setToken(null);
    persistToken(null);
    setCompanies([]);
    setSelectedCompanyId("");
    setStats(null);
    setDashboardStats(null);
    setFinanceSummary(null);
    setTaxSummary(null);
    setTaxProfile(createTaxProfileState());
    setTaxFilingPreview(null);
    setChartOfAccounts([]);
    setAccountingOverviewData(null);
    setAccountRegister(null);
    setVendors([]);
    setVendor1099Summary(null);
    setBillPaySummary(null);
    setReconciliationRules([]);
    setReconciliationWorkspaceData(null);
    setTaxJurisdictions([]);
    setTaxFilings([]);
    setWorkforceOverviewData(null);
    setEmployees([]);
    setContractors([]);
    setTimeEntries([]);
    setMileageEntries([]);
    setPayrollRuns([]);
    setInventoryWorkspace(null);
    setProjects([]);
    setProjectSummaryData(null);
    setAccountantToolkitData(null);
    setIntegrations([]);
    setReceivablesData(null);
    setPayablesData(null);
    setInvoices([]);
    setBills([]);
    setBankTransactions([]);
    setBankConnections([]);
    setBankingProviders({});
    setReconciliationItems([]);
    setUserCount(0);
    setCurrentUser(null);
    setAdminUsers([]);
    setBillingPlans([]);
    setBillingSummaryData(null);
    setMpesaPhoneNumber("");
    setMpesaCheckout(null);
    setAiCfoOverviewData(null);
    setAiCfoQuestion("");
    setAiCfoAnswer(null);
    setFile(null);
    setBankFeedFile(null);
    setPlaidLinkToken("");
    setInvoiceForm(createInvoiceFormState());
    setBillForm(createBillFormState());
    setAccountForm(createAccountFormState());
    setJournalForm(createJournalFormState());
    setVendorForm(createVendorFormState());
    setReconciliationRuleForm(createReconciliationRuleState());
    setTaxFilingForm(createTaxFilingFormState());
    setEmployeeForm(createEmployeeFormState());
    setContractorForm(createContractorFormState());
    setTimeEntryForm(createTimeEntryFormState());
    setMileageForm(createMileageFormState());
    setInventoryItemForm(createInventoryItemFormState());
    setPurchaseOrderForm(createPurchaseOrderFormState());
    setProjectForm(createProjectFormState());
    setProjectCostForm(createProjectCostFormState());
    setIntegrationForm(createIntegrationFormState());
    setSelectedRegisterAccountId("");
    setResetPreviewLink("");
    setResetToken("");
    setResetPassword("");
    setResetConfirmPassword("");
    updatePasswordResetLocation("");
    setLedgerRows(INITIAL_LEDGER_ROWS);
    setBudgetTargets(INITIAL_BUDGET_TARGETS);
    setManufacturingInputs(INITIAL_MANUFACTURING_INPUTS);
    setPartners(INITIAL_PARTNERS);
    setPartnershipAdjustments(INITIAL_PARTNERSHIP_ADJUSTMENTS);
    setScenarioInputs(INITIAL_SCENARIO_INPUTS);
    setWorkspaceReady(false);
    setInfoMessage("Signed out.");
  };

  const loadStats = async () => {
    const data = await authorizedFetch("/analytics");
    setStats(data);
  };

  const loadDashboardStats = async (companyId = selectedCompanyId) => {
    const path = `/dashboard${buildCompanyQuery(companyId)}`;
    const data = await authorizedFetch(path);
    setDashboardStats(data);
  };

  const loadCurrentUser = async () => {
    const data = await authorizedFetch("/me");
    setCurrentUser(data);
    return data;
  };

  const loadBillingCenter = async () => {
    try {
      const [plansPayload, summaryPayload] = await Promise.all([
        authorizedFetch("/billing/plans"),
        authorizedFetch("/billing/summary"),
      ]);
      setBillingPlans(Array.isArray(plansPayload.items) ? plansPayload.items : []);
      setBillingSummaryData(summaryPayload || null);
    } catch {
      setBillingPlans([]);
      setBillingSummaryData(null);
    }
  };

  const loadAiCfoOverview = async (companyId = selectedCompanyId) => {
    if (!companyId) {
      setAiCfoOverviewData(null);
      return null;
    }
    try {
      const payload = await authorizedFetch(`/ai-cfo/overview${buildCompanyQuery(companyId)}`);
      setAiCfoOverviewData(payload);
      return payload;
    } catch {
      setAiCfoOverviewData(null);
      return null;
    }
  };

  const loadCompanies = async (defaultCompanyId) => {
    const items = await authorizedFetch("/companies");
    const normalizedCompanies = Array.isArray(items) ? items : [];
    setCompanies(normalizedCompanies);

    const fallbackCompany =
      normalizedCompanies.find((company) => String(company.id) === String(defaultCompanyId)) ||
      normalizedCompanies[0];

    if (fallbackCompany) {
      setSelectedCompanyId(String(fallbackCompany.id));
      setBusinessType(fallbackCompany.business_type || "sole_proprietor");
    }
  };

  const loadSystemStatus = async () => {
    const response = await fetch(`${API_URL}/system-status`);
    const payload = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || "Failed to read system status");
    }

    setMaintenance({
      maintenance: Boolean(payload.maintenance),
      message: payload.message || "[System Under Maintainance]",
      environment: payload.environment || "production",
      version: payload.version || "unknown",
    });
  };

  const loadLiveUserCount = async () => {
    try {
      setUserCountUpdating(true);
      const data = await authorizedFetch("/user-count");
      if (data.user_count !== undefined) {
        setUserCount(data.user_count);
      }
    } finally {
      setUserCountUpdating(false);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const data = await authorizedFetch("/activity/recent?limit=8");
      if (Array.isArray(data.items)) {
        setRecentActivity(data.items);
      }
    } catch {
      setRecentActivity([]);
    }
  };

  const loadAdminUsers = async () => {
    try {
      const users = await authorizedFetch("/admin/users");
      setAdminUsers(Array.isArray(users) ? users : []);
    } catch {
      setAdminUsers([]);
    }
  };

  const startStripeCheckout = async (planCode) => {
    setErrorMessage("");
    setInfoMessage("");
    setBillingLoading(true);
    try {
      const response = await authorizedFetch("/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_code: planCode,
          success_url: `${window.location.origin}${window.location.pathname}?billing=success`,
          cancel_url: `${window.location.origin}${window.location.pathname}?billing=cancelled`,
        }),
      });
      if (response.checkout_url) {
        window.location.assign(response.checkout_url);
        return;
      }
      throw new Error("Stripe checkout link was not returned.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to start Stripe checkout.");
    } finally {
      setBillingLoading(false);
    }
  };

  const startMpesaCheckout = async (planCode) => {
    setErrorMessage("");
    setInfoMessage("");
    if (!mpesaPhoneNumber.trim()) {
      setErrorMessage("Enter a Kenya mobile number for M-Pesa checkout.");
      return;
    }

    setBillingLoading(true);
    try {
      const response = await authorizedFetch("/billing/mpesa/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_code: planCode,
          phone_number: mpesaPhoneNumber.trim(),
          company_id: selectedCompanyId || undefined,
        }),
      });
      setMpesaCheckout(response);
      setInfoMessage(response.customer_message || "M-Pesa request prepared.");
      await Promise.all([loadCurrentUser(), loadBillingCenter()]);
    } catch (error) {
      setErrorMessage(error.message || "Failed to start M-Pesa checkout.");
    } finally {
      setBillingLoading(false);
    }
  };

  const refreshMpesaCheckout = async () => {
    if (!mpesaCheckout?.id) {
      return;
    }
    try {
      const response = await authorizedFetch(`/billing/mpesa/requests/${mpesaCheckout.id}`);
      setMpesaCheckout(response);
      await Promise.all([loadCurrentUser(), loadBillingCenter()]);
    } catch (error) {
      setErrorMessage(error.message || "Failed to refresh M-Pesa payment status.");
    }
  };

  const askAiCfo = async () => {
    setErrorMessage("");
    setInfoMessage("");
    if (!aiCfoQuestion.trim()) {
      setErrorMessage("Ask a question first.");
      return;
    }

    setAiCfoLoading(true);
    try {
      const response = await authorizedFetch("/ai-cfo/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          question: aiCfoQuestion.trim(),
        }),
      });
      setAiCfoAnswer(response);
    } catch (error) {
      setErrorMessage(error.message || "Failed to get an AI CFO response.");
    } finally {
      setAiCfoLoading(false);
    }
  };

  const loadAccountRegister = async (companyId = selectedCompanyId, accountId = selectedRegisterAccountId) => {
    const params = new URLSearchParams();
    if (companyId) {
      params.set("company_id", companyId);
    }
    if (accountId) {
      params.set("account_id", accountId);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const payload = await authorizedFetch(`/finance/register${suffix}`);
    setAccountRegister(payload);
    if (payload?.account?.id) {
      setSelectedRegisterAccountId(String(payload.account.id));
    }
  };

  const loadFinanceWorkspace = async (companyId = selectedCompanyId) => {
    const query = buildCompanyQuery(companyId);
    setFinanceLoading(true);
    try {
      const [
        summary,
        tax,
        taxProfilePayload,
        filingPreview,
        receivables,
        payables,
        invoicePayload,
        billPayload,
        bankPayload,
        bankingProviderPayload,
        bankingConnectionPayload,
        reconciliationPayload,
        chartPayload,
        accountingPayload,
        vendorPayload,
        vendor1099Payload,
        billPayPayload,
        reconciliationRulePayload,
        reconciliationWorkspacePayload,
        taxJurisdictionPayload,
        taxFilingsPayload,
        workforcePayload,
        employeePayload,
        contractorPayload,
        timePayload,
        mileagePayload,
        payrollPayload,
        inventoryPayload,
        projectSummaryPayload,
        accountantPayload,
        integrationPayload,
      ] = await Promise.all([
        authorizedFetch(`/finance/summary${query}`),
        authorizedFetch(`/finance/tax/summary${query}`),
        authorizedFetch(`/finance/tax/profile${query}`),
        authorizedFetch(`/finance/tax/filing-preview${query}`),
        authorizedFetch(`/finance/receivables${query}`),
        authorizedFetch(`/finance/payables${query}`),
        authorizedFetch(`/finance/invoices${query}`),
        authorizedFetch(`/finance/bills${query}`),
        authorizedFetch(`/finance/bank-transactions${query}`),
        authorizedFetch(`/finance/banking/providers`),
        authorizedFetch(`/finance/banking/connections${query}`),
        authorizedFetch(`/finance/reconciliation/suggestions${query}`),
        authorizedFetch(`/finance/chart-of-accounts${query}`),
        authorizedFetch(`/finance/accounting/overview${query}`),
        authorizedFetch(`/finance/vendors${query}`),
        authorizedFetch(`/finance/vendors/1099-summary${query}`),
        authorizedFetch(`/finance/bill-pay/summary${query}`),
        authorizedFetch(`/finance/reconciliation/rules${query}`),
        authorizedFetch(`/finance/reconciliation/workspace${query}`),
        authorizedFetch(`/finance/tax/jurisdictions`),
        authorizedFetch(`/finance/tax/filings${query}`),
        authorizedFetch(`/finance/workforce/overview${query}`),
        authorizedFetch(`/finance/workforce/employees${query}`),
        authorizedFetch(`/finance/workforce/contractors${query}`),
        authorizedFetch(`/finance/workforce/time${query}`),
        authorizedFetch(`/finance/workforce/mileage${query}`),
        authorizedFetch(`/finance/workforce/payroll-runs${query}`),
        authorizedFetch(`/finance/inventory/summary${query}`),
        authorizedFetch(`/finance/projects/summary${query}`),
        authorizedFetch(`/finance/accountant/toolkit${query}`),
        authorizedFetch(`/finance/integrations${query}`),
      ]);

      setFinanceSummary(summary);
      setTaxSummary(tax);
      setTaxProfile({
        ...createTaxProfileState(),
        ...taxProfilePayload,
        indirect_tax_rate: String(taxProfilePayload?.indirect_tax_rate ?? 16),
        income_tax_rate: String(taxProfilePayload?.income_tax_rate ?? 30),
        period_start_month: String(taxProfilePayload?.period_start_month ?? 1),
      });
      setTaxFilingPreview(filingPreview);
      setReceivablesData(receivables);
      setPayablesData(payables);
      setInvoices(Array.isArray(invoicePayload.items) ? invoicePayload.items : []);
      setBills(Array.isArray(billPayload.items) ? billPayload.items : []);
      setBankTransactions(Array.isArray(bankPayload.items) ? bankPayload.items : []);
      setBankingProviders(bankingProviderPayload || {});
      setBankConnections(Array.isArray(bankingConnectionPayload.items) ? bankingConnectionPayload.items : []);
      setReconciliationItems(Array.isArray(reconciliationPayload.items) ? reconciliationPayload.items : []);
      setChartOfAccounts(Array.isArray(chartPayload.items) ? chartPayload.items : []);
      setAccountingOverviewData(accountingPayload || null);
      setVendors(Array.isArray(vendorPayload.items) ? vendorPayload.items : []);
      setVendor1099Summary(vendor1099Payload || null);
      setBillPaySummary(billPayPayload || null);
      setReconciliationRules(Array.isArray(reconciliationRulePayload.items) ? reconciliationRulePayload.items : []);
      setReconciliationWorkspaceData(reconciliationWorkspacePayload || null);
      setTaxJurisdictions(Array.isArray(taxJurisdictionPayload.items) ? taxJurisdictionPayload.items : []);
      setTaxFilings(Array.isArray(taxFilingsPayload.items) ? taxFilingsPayload.items : []);
      setWorkforceOverviewData(workforcePayload || null);
      setEmployees(Array.isArray(employeePayload.items) ? employeePayload.items : []);
      setContractors(Array.isArray(contractorPayload.items) ? contractorPayload.items : []);
      setTimeEntries(Array.isArray(timePayload.items) ? timePayload.items : []);
      setMileageEntries(Array.isArray(mileagePayload.items) ? mileagePayload.items : []);
      setPayrollRuns(Array.isArray(payrollPayload.items) ? payrollPayload.items : []);
      setInventoryWorkspace(inventoryPayload || null);
      setProjectSummaryData(projectSummaryPayload || null);
      setProjects(Array.isArray(projectSummaryPayload?.items) ? projectSummaryPayload.items : []);
      setAccountantToolkitData(accountantPayload || null);
      setIntegrations(Array.isArray(integrationPayload.items) ? integrationPayload.items : []);
      const preferredRegisterId = selectedRegisterAccountId || chartPayload?.items?.[0]?.id;
      if (preferredRegisterId) {
        await loadAccountRegister(companyId, preferredRegisterId);
      } else {
        setAccountRegister(null);
      }
    } finally {
      setFinanceLoading(false);
    }
  };

  const pingSession = async () => {
    try {
      await authorizedFetch("/session/ping", { method: "POST" });
    } catch {
      // Keep backward compatibility if backend route is not available yet.
    }
  };

  const analyze = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (maintenance.maintenance) {
      setErrorMessage(maintenance.message || "[System Under Maintainance]");
      return;
    }

    if (!file) {
      setErrorMessage("Upload a file first.");
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      if (selectedCompanyId) {
        form.append("company_id", selectedCompanyId);
      }

      await authorizedFetch("/analyze", {
        method: "POST",
        body: form,
      });

      await loadStats();
      setInfoMessage("Report generated.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to analyze file");
    } finally {
      setLoading(false);
    }
  };

  const extractForCalculation = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (maintenance.maintenance) {
      setErrorMessage(maintenance.message || "[System Under Maintainance]");
      return;
    }

    if (!file) {
      setErrorMessage("Upload a file first (CSV, XLS/XLSX, TXT, JSON, PDF, or Word).");
      return;
    }

    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const data = await authorizedFetch("/extract-ledger", {
        method: "POST",
        body: form,
      });

      if (!Array.isArray(data.ledger_rows) || data.ledger_rows.length === 0) {
        throw new Error("No usable ledger rows were extracted.");
      }

      const extractedRows = data.ledger_rows.map((row, index) => ({
        id: index + 1,
        account: row.account || "",
        type: row.type || "expense",
        subtype: row.subtype || "operating",
        amount: row.amount ?? "",
        depreciation: row.depreciation ?? "",
      }));

      setLedgerRows(extractedRows);

      const detectedBusinessType = detectBusinessTypeFromRows(extractedRows);
      setBusinessType(detectedBusinessType);

      if (detectedBusinessType === "manufacturing") {
        setManufacturingInputs(deriveManufacturingInputsFromRows(extractedRows));
      } else {
        setManufacturingInputs(INITIAL_MANUFACTURING_INPUTS);
      }
      if (detectedBusinessType !== "partnership") {
        setPartnershipAdjustments(INITIAL_PARTNERSHIP_ADJUSTMENTS);
      }

      const extractionContextMessage =
        detectedBusinessType === "manufacturing" && data.summary?.costOfGoodsManufactured != null
          ? ` COGM: ${formatMoney(data.summary.costOfGoodsManufactured)}.`
          : detectedBusinessType === "partnership"
            ? " Partnership layout detected."
          : "";
      setInfoMessage(`Extracted ${data.ledger_rows.length} row(s) for calculations.${extractionContextMessage}`);
    } catch (error) {
      setErrorMessage(error.message || "Failed to extract file for calculations");
    } finally {
      setExtracting(false);
    }
  };

  const printReceipt = () => {
    const popup = window.open("", "_blank", "width=780,height=900");
    if (!popup) {
      setErrorMessage("Popup blocked. Allow popups to print the receipt.");
      return;
    }

    const now = new Date();
    const receiptHtml = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>FinancePro Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #0b1f3a; }
          h1 { margin: 0 0 10px; font-size: 24px; }
          p { margin: 4px 0; }
          .meta { margin-bottom: 16px; color: #425466; }
          .line { display: flex; justify-content: space-between; border-bottom: 1px solid #e5edf8; padding: 8px 0; }
          .total { font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>Financial Receipt</h1>
        <p class="meta">Date: ${now.toLocaleString()}</p>
        <p class="meta">User: ${email || "N/A"}</p>
        <div class="line"><span>Total Revenue</span><span>${formatMoney(statement.revenue)}</span></div>
        <div class="line"><span>Total Expenses</span><span>${formatMoney(statement.totalExpensesDetailed || statement.expense)}</span></div>
        <div class="line"><span>Total Assets</span><span>${formatMoney(statement.totalAssets)}</span></div>
        <div class="line"><span>Total Liabilities</span><span>${formatMoney(statement.totalLiabilities)}</span></div>
        <div class="line"><span>Equity</span><span>${formatMoney(statement.equity)}</span></div>
        <div class="line total"><span>Net Cash Flow</span><span>${formatMoney(statement.netCashFromOperations || statement.netCashFlow)}</span></div>
      </body>
      </html>
    `;

    popup.document.open();
    popup.document.write(receiptHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const toggleTheme = () => {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  };

  const applyBusinessTemplate = () => {
    setLedgerRows(cloneTemplateRows(BUSINESS_TEMPLATE_ROWS[businessType]));
    if (businessType !== "manufacturing") {
      setManufacturingInputs(INITIAL_MANUFACTURING_INPUTS);
    }
    if (businessType === "partnership") {
      setPartnershipAdjustments(INITIAL_PARTNERSHIP_ADJUSTMENTS);
    } else {
      setPartners(INITIAL_PARTNERS);
      setPartnershipAdjustments(INITIAL_PARTNERSHIP_ADJUSTMENTS);
    }
    setInfoMessage(`${activeLayout.layoutName} loaded.`);
    setErrorMessage("");
  };

  const updateManufacturingInput = (key, value) => {
    setManufacturingInputs((current) => ({ ...current, [key]: value }));
  };

  const updatePartnershipAdjustment = (key, value) => {
    setPartnershipAdjustments((current) => ({ ...current, [key]: value }));
  };

  const updatePartner = (partnerId, key, value) => {
    setPartners((items) =>
      items.map((partner) => (partner.id === partnerId ? { ...partner, [key]: value } : partner)),
    );
  };

  const addPartner = () => {
    setPartners((items) => {
      const nextId = items.length ? Math.max(...items.map((partner) => partner.id)) + 1 : 1;
      return [
        ...items,
        createPartnerState(nextId, getDefaultPartnerName(nextId - 1), ""),
      ];
    });
  };

  const removePartner = (partnerId) => {
    setPartners((items) => items.filter((partner) => partner.id !== partnerId));
  };

  const updateLedgerRow = (rowId, key, value) => {
    setLedgerRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        if (key === "type") {
          const nextType = value;
          const nextSubtype = getSubtypeOptions(nextType)[0];
          const depreciation =
            nextType === "asset" && nextSubtype === "non-current" ? row.depreciation : "";
          return { ...row, type: nextType, subtype: nextSubtype, depreciation };
        }

        if (key === "subtype") {
          const nextSubtype = value;
          const depreciation =
            row.type === "asset" && nextSubtype === "non-current" ? row.depreciation : "";
          return { ...row, subtype: nextSubtype, depreciation };
        }

        return { ...row, [key]: value };
      }),
    );
  };

  const addLedgerRow = () => {
    setLedgerRows((rows) => {
      const nextId = rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
      return [
        ...rows,
        {
          id: nextId,
          account: "",
          type: "expense",
          subtype: "operating",
          amount: "",
          depreciation: "",
        },
      ];
    });
  };

  const deleteLedgerRow = (rowId) => {
    setLedgerRows((rows) => rows.filter((row) => row.id !== rowId));
  };

  const applyQuickEntry = () => {
    const amount = toAmount(quickAmount);
    if (!amount) {
      setErrorMessage("Enter an amount for the quick entry.");
      return;
    }

    const template = QUICK_ENTRY_TEMPLATES.find((item) => item.id === quickEntryId);
    if (!template) {
      setErrorMessage("Quick entry template not found.");
      return;
    }

    setErrorMessage("");
    setInfoMessage(`${template.label} posted.`);
    setLedgerRows((rows) => {
      let nextId = rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
      const quickRows = template.entries.map((entry) => ({
        id: nextId++,
        ...entry,
        amount: String(amount),
        depreciation: "",
      }));
      return [...rows, ...quickRows];
    });
    setQuickAmount("");
  };

  const updateBudgetTarget = (key, value) => {
    setBudgetTargets((current) => ({ ...current, [key]: value }));
  };

  const updateScenarioInput = (key, value) => {
    setScenarioInputs((current) => ({ ...current, [key]: value }));
  };

  const applyScenarioPreset = (presetId) => {
    const preset = SCENARIO_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setScenarioInputs({ ...preset.values });
    setInfoMessage(`${preset.label} scenario loaded.`);
    setErrorMessage("");
  };

  const downloadFile = (filename, content, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const exportExecutiveSummary = () => {
    downloadFile("financepro-executive-summary.csv", statementToCsv(statement), "text/csv;charset=utf-8");
    setInfoMessage("Executive summary exported.");
    setErrorMessage("");
  };

  const exportLedger = () => {
    downloadFile("financepro-ledger.csv", ledgerRowsToCsv(ledgerRows), "text/csv;charset=utf-8");
    setInfoMessage("Ledger exported.");
    setErrorMessage("");
  };

  const exportWorkspace = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      company: selectedCompany?.name || "Main Company",
      businessType,
      statement,
      executiveMetrics,
      scenarioInputs,
      forecast: forecastModel,
      boardNarrative,
      budgetTargets,
      ledgerRows,
    };
    downloadFile("financepro-workspace.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setInfoMessage("Workspace snapshot exported.");
    setErrorMessage("");
  };

  const updateInvoiceFormField = (key, value) => {
    setInvoiceForm((current) => ({ ...current, [key]: value }));
  };

  const updateBillFormField = (key, value) => {
    setBillForm((current) => ({ ...current, [key]: value }));
  };

  const updateTaxProfileField = (key, value) => {
    setTaxProfile((current) => ({ ...current, [key]: value }));
  };

  const updateAccountFormField = (key, value) => {
    setAccountForm((current) => ({ ...current, [key]: value }));
  };

  const updateVendorFormField = (key, value) => {
    setVendorForm((current) => ({ ...current, [key]: value }));
  };

  const updateReconciliationRuleField = (key, value) => {
    setReconciliationRuleForm((current) => ({ ...current, [key]: value }));
  };

  const updateTaxFilingFormField = (key, value) => {
    setTaxFilingForm((current) => ({ ...current, [key]: value }));
  };

  const updateEmployeeFormField = (key, value) => {
    setEmployeeForm((current) => ({ ...current, [key]: value }));
  };

  const updateContractorFormField = (key, value) => {
    setContractorForm((current) => ({ ...current, [key]: value }));
  };

  const updateTimeEntryFormField = (key, value) => {
    setTimeEntryForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "employee_id" && value) {
        next.contractor_id = "";
      }
      if (key === "contractor_id" && value) {
        next.employee_id = "";
      }
      return next;
    });
  };

  const updateMileageFormField = (key, value) => {
    setMileageForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "employee_id" && value) {
        next.contractor_id = "";
      }
      if (key === "contractor_id" && value) {
        next.employee_id = "";
      }
      return next;
    });
  };

  const updateInventoryItemFormField = (key, value) => {
    setInventoryItemForm((current) => ({ ...current, [key]: value }));
  };

  const updateProjectFormField = (key, value) => {
    setProjectForm((current) => ({ ...current, [key]: value }));
  };

  const updateProjectCostFormField = (key, value) => {
    setProjectCostForm((current) => ({ ...current, [key]: value }));
  };

  const updateIntegrationFormField = (key, value) => {
    setIntegrationForm((current) => ({ ...current, [key]: value }));
  };

  const updateDocumentItem = (setter, index, key, value) => {
    setter((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const updateJournalLine = (index, key, value) => {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [key]: value } : line)),
    }));
  };

  const addJournalLine = () => {
    setJournalForm((current) => ({ ...current, lines: [...current.lines, createJournalLine()] }));
  };

  const removeJournalLine = (index) => {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.length > 2 ? current.lines.filter((_, lineIndex) => lineIndex !== index) : current.lines,
    }));
  };

  const updatePurchaseOrderFormField = (key, value) => {
    setPurchaseOrderForm((current) => ({ ...current, [key]: value }));
  };

  const updatePurchaseOrderItem = (index, key, value) => {
    setPurchaseOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const addPurchaseOrderItem = () => {
    setPurchaseOrderForm((current) => ({ ...current, items: [...current.items, createPurchaseOrderItem()] }));
  };

  const removePurchaseOrderItem = (index) => {
    setPurchaseOrderForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, itemIndex) => itemIndex !== index) : current.items,
    }));
  };

  const addDocumentItem = (setter) => {
    setter((current) => ({ ...current, items: [...current.items, createDocumentItem()] }));
  };

  const removeDocumentItem = (setter, index) => {
    setter((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, itemIndex) => itemIndex !== index) : current.items,
    }));
  };

  const createInvoiceRecord = async () => {
    setErrorMessage("");
    setInfoMessage("");

    try {
      await authorizedFetch("/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...invoiceForm,
          company_id: selectedCompanyId || undefined,
          tax_rate: Number(invoiceForm.tax_rate || 0),
          items: invoiceForm.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
          })),
        }),
      });
      setInvoiceForm(createInvoiceFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Invoice workflow created.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create invoice.");
    }
  };

  const createBillRecord = async () => {
    setErrorMessage("");
    setInfoMessage("");

    try {
      await authorizedFetch("/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...billForm,
          company_id: selectedCompanyId || undefined,
          tax_rate: Number(billForm.tax_rate || 0),
          items: billForm.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
          })),
        }),
      });
      setBillForm(createBillFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Vendor bill captured.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create bill.");
    }
  };

  const updateInvoiceWorkflowStatus = async (invoiceId, status) => {
    try {
      await authorizedFetch(`/finance/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Invoice moved to ${status}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update invoice status.");
    }
  };

  const updateBillWorkflowStatus = async (billId, status) => {
    try {
      await authorizedFetch(`/finance/bills/${billId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Bill moved to ${status}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update bill status.");
    }
  };

  const promptAndRecordInvoicePayment = async (invoice) => {
    const amount = window.prompt(`Record payment for ${invoice.invoice_number}`, String(invoice.balance_due || 0));
    if (amount === null) {
      return;
    }
    const reference = window.prompt("Reference / memo", "Manual receipt");
    try {
      await authorizedFetch(`/finance/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), reference: reference || "" }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Payment recorded for ${invoice.invoice_number}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to record invoice payment.");
    }
  };

  const promptAndRecordBillPayment = async (bill) => {
    const amount = window.prompt(`Record payment for ${bill.bill_number}`, String(bill.balance_due || 0));
    if (amount === null) {
      return;
    }
    const reference = window.prompt("Reference / memo", "Manual disbursement");
    try {
      await authorizedFetch(`/finance/bills/${bill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), reference: reference || "" }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Payment recorded for ${bill.bill_number}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to record bill payment.");
    }
  };

  const importBankFeed = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!bankFeedFile) {
      setErrorMessage("Choose a bank feed file first.");
      return;
    }

    try {
      const form = new FormData();
      form.append("file", bankFeedFile);
      if (selectedCompanyId) {
        form.append("company_id", selectedCompanyId);
      }
      const response = await authorizedFetch("/finance/bank-feed/import", {
        method: "POST",
        body: form,
      });
      setBankFeedFile(null);
      await loadFinanceWorkspace();
      setInfoMessage(`Imported ${response.imported || 0} bank transaction(s).`);
    } catch (error) {
      setErrorMessage(error.message || "Failed to import bank feed.");
    }
  };

  const createPlaidLinkToken = async () => {
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await authorizedFetch("/finance/banking/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId || undefined }),
      });
      if (!response.link_token) {
        throw new Error("Plaid did not return a link token.");
      }
      setPlaidLinkToken(response.link_token);
    } catch (error) {
      setErrorMessage(error.message || "Failed to initialize bank connection.");
    }
  };

  const syncPlaidTransactions = async (connectionId) => {
    try {
      const response = await authorizedFetch("/finance/banking/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          connection_id: connectionId,
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Plaid sync complete. Added ${response.added || 0} transaction(s).`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to sync Plaid transactions.");
      throw error;
    }
  };

  const saveTaxProfile = async () => {
    setErrorMessage("");
    setInfoMessage("");
    try {
      await authorizedFetch("/finance/tax/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...taxProfile,
          company_id: selectedCompanyId || undefined,
          indirect_tax_rate: Number(taxProfile.indirect_tax_rate || 0),
          income_tax_rate: Number(taxProfile.income_tax_rate || 0),
          period_start_month: Number(taxProfile.period_start_month || 1),
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Tax profile updated.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update tax profile.");
    }
  };

  const seedDefaultChartOfAccounts = async () => {
    try {
      await authorizedFetch("/finance/chart-of-accounts/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId || undefined }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Default chart of accounts seeded.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to seed chart of accounts.");
    }
  };

  const createChartAccount = async () => {
    try {
      await authorizedFetch("/finance/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountForm,
          company_id: selectedCompanyId || undefined,
        }),
      });
      setAccountForm(createAccountFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Account created.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create account.");
    }
  };

  const postManualJournal = async () => {
    try {
      await authorizedFetch("/finance/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...journalForm,
          company_id: selectedCompanyId || undefined,
          lines: journalForm.lines.map((line) => ({
            ...line,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
          })),
        }),
      });
      setJournalForm(createJournalFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Journal entry posted.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to post journal entry.");
    }
  };

  const saveVendorProfile = async () => {
    try {
      await authorizedFetch("/finance/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vendorForm,
          company_id: selectedCompanyId || undefined,
        }),
      });
      setVendorForm(createVendorFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Vendor profile saved.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to save vendor.");
    }
  };

  const scheduleBillDisbursement = async (bill) => {
    const amount = window.prompt(`Schedule payment for ${bill.bill_number}`, String(bill.balance_due || 0));
    if (amount === null) {
      return;
    }
    const rail = window.prompt("Payment rail (ach, wire, card, check, mobile_money)", "ach");
    try {
      await authorizedFetch("/finance/bill-pay/disbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          bill_id: bill.id,
          amount: Number(amount),
          payment_rail: rail || "ach",
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Scheduled payment for ${bill.bill_number}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to schedule bill payment.");
    }
  };

  const executeBillDisbursement = async (disbursementId) => {
    try {
      await authorizedFetch(`/finance/bill-pay/disbursements/${disbursementId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_date: new Date().toISOString().slice(0, 10) }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Bill payment executed.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to execute bill payment.");
    }
  };

  const createReconciliationRuleRecord = async () => {
    try {
      await authorizedFetch("/finance/reconciliation/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reconciliationRuleForm,
          company_id: selectedCompanyId || undefined,
          priority: Number(reconciliationRuleForm.priority || 100),
          min_amount: reconciliationRuleForm.min_amount === "" ? undefined : Number(reconciliationRuleForm.min_amount),
          max_amount: reconciliationRuleForm.max_amount === "" ? undefined : Number(reconciliationRuleForm.max_amount),
        }),
      });
      setReconciliationRuleForm(createReconciliationRuleState());
      await loadFinanceWorkspace();
      setInfoMessage("Reconciliation rule saved.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to save reconciliation rule.");
    }
  };

  const autoApplyReconciliationRules = async () => {
    try {
      const response = await authorizedFetch("/finance/reconciliation/rules/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId || undefined }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Rules applied: ${response.matched || 0} matched, ${response.exceptions || 0} exception(s).`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to auto-apply reconciliation rules.");
    }
  };

  const flagReconciliationException = async (transactionId) => {
    const exceptionType = window.prompt("Exception type", "review_required");
    if (exceptionType === null) {
      return;
    }
    const notes = window.prompt("Exception notes", "Investigate classification");
    try {
      await authorizedFetch("/finance/reconciliation/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          transaction_id: transactionId,
          exception_type: exceptionType,
          notes: notes || "",
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Reconciliation exception logged.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create reconciliation exception.");
    }
  };

  const resolveReconciliationException = async (exceptionId) => {
    try {
      await authorizedFetch(`/finance/reconciliation/exceptions/${exceptionId}/resolve`, {
        method: "POST",
      });
      await loadFinanceWorkspace();
      setInfoMessage("Reconciliation exception resolved.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to resolve reconciliation exception.");
    }
  };

  const prepareTaxFilingRecord = async () => {
    try {
      await authorizedFetch("/finance/tax/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...taxFilingForm,
          company_id: selectedCompanyId || undefined,
        }),
      });
      setTaxFilingForm(createTaxFilingFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Tax filing package prepared.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to prepare tax filing.");
    }
  };

  const submitTaxFilingRecord = async (filingId) => {
    try {
      await authorizedFetch(`/finance/tax/filings/${filingId}/submit`, {
        method: "POST",
      });
      await loadFinanceWorkspace();
      setInfoMessage("Tax filing marked as submitted.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to submit tax filing.");
    }
  };

  const createEmployeeRecord = async () => {
    try {
      await authorizedFetch("/finance/workforce/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...employeeForm,
          company_id: selectedCompanyId || undefined,
          hourly_rate: Number(employeeForm.hourly_rate || 0),
          salary_amount: Number(employeeForm.salary_amount || 0),
          withholding_rate: Number(employeeForm.withholding_rate || 0),
          benefit_rate: Number(employeeForm.benefit_rate || 0),
        }),
      });
      setEmployeeForm(createEmployeeFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Employee added.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create employee.");
    }
  };

  const createContractorRecord = async () => {
    try {
      await authorizedFetch("/finance/workforce/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contractorForm,
          company_id: selectedCompanyId || undefined,
          default_rate: Number(contractorForm.default_rate || 0),
        }),
      });
      setContractorForm(createContractorFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Contractor added.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create contractor.");
    }
  };

  const createTimeEntryRecord = async () => {
    try {
      await authorizedFetch("/finance/workforce/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...timeEntryForm,
          company_id: selectedCompanyId || undefined,
          employee_id: timeEntryForm.employee_id || undefined,
          contractor_id: timeEntryForm.contractor_id || undefined,
          project_id: timeEntryForm.project_id || undefined,
          hours: Number(timeEntryForm.hours || 0),
          hourly_cost: Number(timeEntryForm.hourly_cost || 0),
          billable_rate: Number(timeEntryForm.billable_rate || 0),
        }),
      });
      setTimeEntryForm(createTimeEntryFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Time entry logged.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create time entry.");
    }
  };

  const createMileageRecord = async () => {
    try {
      await authorizedFetch("/finance/workforce/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mileageForm,
          company_id: selectedCompanyId || undefined,
          employee_id: mileageForm.employee_id || undefined,
          contractor_id: mileageForm.contractor_id || undefined,
          project_id: mileageForm.project_id || undefined,
          miles: Number(mileageForm.miles || 0),
          rate_per_mile: Number(mileageForm.rate_per_mile || 0),
        }),
      });
      setMileageForm(createMileageFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Mileage entry logged.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create mileage entry.");
    }
  };

  const processPayrollRun = async () => {
    const periodStart = window.prompt("Payroll period start (YYYY-MM-DD)", new Date().toISOString().slice(0, 8) + "01");
    if (periodStart === null) {
      return;
    }
    const periodEnd = window.prompt("Payroll period end (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (periodEnd === null) {
      return;
    }
    try {
      await authorizedFetch("/finance/workforce/payroll-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          period_start: periodStart,
          period_end: periodEnd,
          pay_date: periodEnd,
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Payroll processed.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to process payroll.");
    }
  };

  const createInventoryItemRecord = async () => {
    try {
      await authorizedFetch("/finance/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inventoryItemForm,
          company_id: selectedCompanyId || undefined,
          quantity_on_hand: Number(inventoryItemForm.quantity_on_hand || 0),
          reorder_point: Number(inventoryItemForm.reorder_point || 0),
          reorder_quantity: Number(inventoryItemForm.reorder_quantity || 0),
          unit_cost: Number(inventoryItemForm.unit_cost || 0),
          unit_price: Number(inventoryItemForm.unit_price || 0),
        }),
      });
      setInventoryItemForm(createInventoryItemFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Inventory item created.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create inventory item.");
    }
  };

  const createPurchaseOrderRecord = async () => {
    try {
      await authorizedFetch("/finance/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...purchaseOrderForm,
          company_id: selectedCompanyId || undefined,
          items: purchaseOrderForm.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.unit_cost || 0),
          })),
        }),
      });
      setPurchaseOrderForm(createPurchaseOrderFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Purchase order created.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create purchase order.");
    }
  };

  const submitPurchaseOrderRecord = async (purchaseOrderId) => {
    try {
      await authorizedFetch(`/finance/purchase-orders/${purchaseOrderId}/submit`, {
        method: "POST",
      });
      await loadFinanceWorkspace();
      setInfoMessage("Purchase order submitted.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to submit purchase order.");
    }
  };

  const receivePurchaseOrderRecord = async (purchaseOrder) => {
    try {
      const items = (purchaseOrder.items || [])
        .map((item) => ({
          line_id: item.id,
          quantity: Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0)),
        }))
        .filter((item) => item.quantity > 0);
      if (!items.length) {
        setErrorMessage("No outstanding quantities remain on this purchase order.");
        return;
      }
      await authorizedFetch(`/finance/purchase-orders/${purchaseOrder.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Received items for ${purchaseOrder.po_number}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to receive purchase order.");
    }
  };

  const createProjectRecord = async () => {
    try {
      await authorizedFetch("/finance/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...projectForm,
          company_id: selectedCompanyId || undefined,
          budget_revenue: Number(projectForm.budget_revenue || 0),
          budget_cost: Number(projectForm.budget_cost || 0),
        }),
      });
      setProjectForm(createProjectFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Project created.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create project.");
    }
  };

  const createProjectCostRecord = async () => {
    try {
      await authorizedFetch("/finance/projects/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...projectCostForm,
          company_id: selectedCompanyId || undefined,
          amount: Number(projectCostForm.amount || 0),
        }),
      });
      setProjectCostForm(createProjectCostFormState());
      await loadFinanceWorkspace();
      setInfoMessage("Project cost entry posted.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create project cost entry.");
    }
  };

  const connectIntegrationRecord = async () => {
    try {
      await authorizedFetch("/finance/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompanyId || undefined,
          provider: integrationForm.provider,
          config: { source: "workspace" },
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage("Integration connected.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to connect integration.");
    }
  };

  const syncIntegrationRecord = async (integrationId) => {
    try {
      await authorizedFetch(`/finance/integrations/${integrationId}/sync`, {
        method: "POST",
      });
      await loadFinanceWorkspace();
      setInfoMessage("Integration sync recorded.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to sync integration.");
    }
  };

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken || null,
    onSuccess: async (publicToken, metadata) => {
      try {
        await authorizedFetch("/finance/banking/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            company_id: selectedCompanyId || undefined,
            institution_name: metadata?.institution?.name || "",
          }),
        });
        await syncPlaidTransactions();
        setPlaidLinkToken("");
        setInfoMessage("Bank connected and synced.");
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error.message || "Failed to exchange Plaid token.");
      }
    },
    onExit: (error) => {
      if (error?.display_message || error?.error_message) {
        setErrorMessage(error.display_message || error.error_message);
      }
      setPlaidLinkToken("");
    },
  });

  const reconcileSuggestion = async (suggestion) => {
    try {
      await authorizedFetch("/finance/reconciliation/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: suggestion.transaction.id,
          entity_type: suggestion.entity_type,
          entity_id: suggestion.entity_id,
        }),
      });
      await loadFinanceWorkspace();
      setInfoMessage(`Matched bank transaction to ${suggestion.document_number}.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Failed to reconcile bank transaction.");
    }
  };

  const updateSetupPartnerName = (index, value) => {
    setSetupPartnerNames((names) => names.map((name, currentIndex) => (currentIndex === index ? value : name)));
  };

  const updateNewCompanyPartnerName = (index, value) => {
    setNewCompanyPartnerNames((names) => names.map((name, currentIndex) => (currentIndex === index ? value : name)));
  };

  const saveCompanySetup = async () => {
    if (!selectedCompany) {
      return;
    }

    setErrorMessage("");
    setInfoMessage("");
    let partnerNames = [];

    try {
      if (setupBusinessType === "partnership") {
        partnerNames = validatePartnershipNames(setupPartnerNames, setupPartnerCount);
      }

      setSetupSaving(true);
      const updatedCompany = await authorizedFetch(`/companies/${selectedCompany.id}/setup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_type: setupBusinessType,
          partner_names: partnerNames,
        }),
      });

      const nextBusinessType = updatedCompany.business_type || "sole_proprietor";
      const nextLedgerRows = cloneTemplateRows(BUSINESS_TEMPLATE_ROWS[nextBusinessType] || INITIAL_LEDGER_ROWS);
      const nextManufacturingInputs = INITIAL_MANUFACTURING_INPUTS;
      const nextPartners = normalizePartners([], updatedCompany.partner_names);

      persistWorkspace(updatedCompany.id, {
        businessType: nextBusinessType,
        ledgerRows: nextLedgerRows,
        budgetTargets: INITIAL_BUDGET_TARGETS,
        manufacturingInputs: nextManufacturingInputs,
        partners: nextPartners,
        partnershipAdjustments: INITIAL_PARTNERSHIP_ADJUSTMENTS,
        scenarioInputs: INITIAL_SCENARIO_INPUTS,
      });
      setBusinessType(nextBusinessType);
      setLedgerRows(nextLedgerRows);
      setBudgetTargets(INITIAL_BUDGET_TARGETS);
      setManufacturingInputs(nextManufacturingInputs);
      setPartners(nextPartners);
      setPartnershipAdjustments(INITIAL_PARTNERSHIP_ADJUSTMENTS);
      setScenarioInputs(INITIAL_SCENARIO_INPUTS);
      await loadCompanies(updatedCompany.id);
      setInfoMessage("Business setup saved. Your workspace is ready.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to save company setup.");
    } finally {
      setSetupSaving(false);
    }
  };

  const createCompany = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!newCompanyName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }

    let partnerNames = [];
    try {
      if (newCompanyType === "partnership") {
        partnerNames = validatePartnershipNames(newCompanyPartnerNames, newCompanyPartnerCount);
      }
    } catch (error) {
      setErrorMessage(error.message || "Enter valid partner names.");
      return;
    }

    try {
      const company = await authorizedFetch("/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompanyName.trim(),
          business_type: newCompanyType,
          partner_names: partnerNames,
        }),
      });
      setNewCompanyName("");
      setNewCompanyType("sole_proprietor");
      setNewCompanyPartnerCount(MIN_PARTNER_COUNT);
      setNewCompanyPartnerNames(createPartnerNameInputs(MIN_PARTNER_COUNT));
      setSelectedCompanyId(String(company.id));
      setBusinessType(company.business_type);
      await loadCompanies(company.id);
      setInfoMessage("Company created.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create company.");
    }
  };

  const createAdminUser = async () => {
    setErrorMessage("");
    setInfoMessage("");
    if (!adminEmail || !adminPassword) {
      setErrorMessage("Admin panel: email and password are required.");
      return;
    }
    try {
      await authorizedFetch("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
          role: adminRole,
          company_ids: selectedCompanyId ? [selectedCompanyId] : undefined,
        }),
      });
      setAdminEmail("");
      setAdminPassword("");
      setAdminRole("cashier");
      await loadAdminUsers();
      setInfoMessage("User created.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to create user.");
    }
  };

  const changeAdminRole = async (userId, role) => {
    try {
      await authorizedFetch(`/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await loadAdminUsers();
      setInfoMessage("Role updated.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update role.");
    }
  };

  const removeAdminUser = async (userId) => {
    try {
      await authorizedFetch(`/admin/users/${userId}`, { method: "DELETE" });
      await loadAdminUsers();
      setInfoMessage("User deleted.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete user.");
    }
  };

  const deleteOwnAccount = async () => {
    setErrorMessage("");
    setInfoMessage("");

    const confirmed = window.confirm(
      "Delete your account? This will sign you out immediately and cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    const confirmationText = window.prompt("Type DELETE to confirm account deletion.");
    if (confirmationText !== "DELETE") {
      setErrorMessage("Account deletion cancelled.");
      return;
    }

    const passwordConfirmation = window.prompt("Enter your password to delete your account.");
    if (!passwordConfirmation) {
      setErrorMessage("Password confirmation is required to delete your account.");
      return;
    }

    try {
      const response = await authorizedFetch("/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordConfirmation }),
      });
      await logout();
      setInfoMessage(response.msg || "Your account has been deleted.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete your account.");
    }
  };

  useEffect(() => {
    let active = true;

    const checkSystemStatus = async () => {
      try {
        await loadSystemStatus();
      } catch {
        if (active) {
          setMaintenance({
            maintenance: false,
            message: "[System Under Maintainance]",
            environment: "production",
            version: "unknown",
          });
        }
      }
    };

    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    persistTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    persistBusinessType(businessType);
  }, [businessType]);

  useEffect(() => {
    if (!availableQuickEntries.some((template) => template.id === quickEntryId)) {
      setQuickEntryId(availableQuickEntries[0]?.id || "");
    }
  }, [availableQuickEntries, quickEntryId]);

  useEffect(() => {
    if (plaidLinkToken && plaidReady) {
      openPlaid();
    }
  }, [plaidLinkToken, plaidReady, openPlaid]);

  const themedStyles = useMemo(() => {
    if (!isDarkMode) {
      return styles;
    }

    return {
      ...styles,
      center: { ...styles.center, background: "#08111f" },
      authSingleCard: {
        ...styles.authSingleCard,
        background: "#121d2d",
        border: "1px solid #22314a",
        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.4)",
      },
      authTitle: { ...styles.authTitle, color: "#e2e8f0" },
      authInput: {
        ...styles.authInput,
        background: "#0f172a",
        border: "1px solid #334155",
        color: "#e2e8f0",
      },
      eyeToggle: { ...styles.eyeToggle, color: "#cbd5e1" },
      authPrimaryButton: { ...styles.authPrimaryButton, background: "#2563eb" },
      authSwitchText: { ...styles.authSwitchText, color: "#cbd5e1" },
      authDivider: { ...styles.authDivider, color: "#94a3b8" },
      inlineLink: { ...styles.inlineLink, color: "#93c5fd" },
      linkButton: { ...styles.linkButton, color: "#93c5fd" },
      themeToggle: { ...styles.themeToggle, border: "1px solid #60a5fa", color: "#bfdbfe" },
      layout: { ...styles.layout, background: "#0b1220" },
      sidebar: { ...styles.sidebar, background: "#0f172a", color: "#e2e8f0" },
      sidebarMeta: { ...styles.sidebarMeta, color: "#93c5fd" },
      main: { ...styles.main, background: "#111827", color: "#e5e7eb" },
      card: { ...styles.card, background: "#1f2937", color: "#e5e7eb", boxShadow: "0 8px 20px rgba(0,0,0,0.3)" },
      landingStoryPanel: { ...styles.landingStoryPanel, background: "linear-gradient(160deg, rgba(2, 6, 23, 0.88) 0%, rgba(15, 118, 110, 0.88) 100%)", border: "1px solid rgba(148, 163, 184, 0.2)" },
      landingAudienceCard: { ...styles.landingAudienceCard, background: "rgba(15, 23, 42, 0.42)", border: "1px solid rgba(148, 163, 184, 0.18)", color: "#e2e8f0" },
      pricingCard: { ...styles.pricingCard, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" },
      heroCard: { ...styles.heroCard, background: "linear-gradient(145deg, #020617 0%, #0f766e 45%, #164e63 120%)" },
      heroMetricCard: {
        ...styles.heroMetricCard,
        background: "rgba(15, 23, 42, 0.42)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
      },
      secondaryActionButton: {
        ...styles.secondaryActionButton,
        background: "rgba(15, 23, 42, 0.68)",
        color: "#e2e8f0",
        border: "1px solid #334155",
      },
      input: { ...styles.input, background: "#0f172a", color: "#e5e7eb", border: "1px solid #334155" },
      button: { ...styles.button, background: "#2563eb", color: "#ffffff" },
      secondaryButton: { ...styles.secondaryButton, border: "1px solid #60a5fa", color: "#e2e8f0" },
      graphNote: { ...styles.graphNote, color: "#bfdbfe" },
      infoText: { ...styles.infoText, color: "#93c5fd" },
      warningText: { ...styles.warningText, color: "#fed7aa", background: "#3b2a15", border: "1px solid #b45309" },
      th: { ...styles.th, borderBottom: "1px solid #334155", color: "#e2e8f0" },
      td: { ...styles.td, borderBottom: "1px solid #334155" },
      tableInput: { ...styles.tableInput, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" },
      updateIndicator: { ...styles.updateIndicator, color: "#cbd5e1" },
      totalLine: { ...styles.totalLine, color: "#e2e8f0" },
      sectionLine: { ...styles.sectionLine, color: "#93c5fd" },
      budgetField: { ...styles.budgetField, color: "#bfdbfe" },
      kpiItem: { ...styles.kpiItem, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" },
      activityItem: { ...styles.activityItem, borderBottom: "1px solid #334155" },
      activityTime: { ...styles.activityTime, color: "#93c5fd" },
      modulePanel: { ...styles.modulePanel, background: "#0f172a", border: "1px solid #334155" },
      moduleTitle: { ...styles.moduleTitle, color: "#e2e8f0" },
      integrationBanner: { ...styles.integrationBanner, background: "#0f2f2f", border: "1px solid #115e59", color: "#d1fae5" },
      connectionCard: { ...styles.connectionCard, background: "#0f172a", border: "1px solid #334155" },
      statusPill: { ...styles.statusPill, background: "#164e63", color: "#ccfbf1" },
      reconciliationItem: { ...styles.reconciliationItem, background: "#0f172a", border: "1px solid #334155" },
      scoreBadge: { ...styles.scoreBadge, background: "#0f766e", color: "#ecfeff" },
      alertCritical: { ...styles.alertCritical, background: "#3f1d2e", borderColor: "#7f1d1d", color: "#fecdd3" },
      alertWarning: { ...styles.alertWarning, background: "#3b2a15", borderColor: "#92400e", color: "#fed7aa" },
      alertPositive: { ...styles.alertPositive, background: "#0f2f2f", borderColor: "#115e59", color: "#99f6e4" },
      alertPill: { ...styles.alertPill, background: "rgba(15, 23, 42, 0.55)" },
      signalPositive: { ...styles.signalPositive, background: "#052e2b", borderColor: "#115e59", color: "#99f6e4" },
      signalWarning: { ...styles.signalWarning, background: "#422006", borderColor: "#92400e", color: "#fde68a" },
      signalCritical: { ...styles.signalCritical, background: "#3f1d2e", borderColor: "#7f1d1d", color: "#fecdd3" },
      presetButton: { ...styles.presetButton, background: "#0f172a", color: "#ccfbf1", border: "1px solid #115e59" },
      narrativeCard: {
        ...styles.narrativeCard,
        background: "linear-gradient(135deg, #0f172a 0%, #13343a 100%)",
        border: "1px solid #115e59",
        color: "#d1fae5",
      },
    };
  }, [isDarkMode]);

  useEffect(() => {
    const incomingResetToken = readResetTokenFromLocation();
    if (!incomingResetToken) {
      return;
    }
    setAuthMode("reset");
    setResetToken(incomingResetToken);
    setInfoMessage("Enter your new password to complete the reset.");
  }, []);

  useEffect(() => {
    const params = readAuthSearchParams();
    const billingState = params.get("billing");
    if (!billingState) {
      return;
    }
    if (billingState === "success") {
      setInfoMessage("Billing checkout completed. Refreshing your plan details.");
    } else if (billingState === "cancelled") {
      setInfoMessage("Billing checkout was cancelled.");
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("billing");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    const bootstrap = async () => {
      try {
        const me = await loadCurrentUser();
        await loadCompanies(me?.default_company_id);
        await Promise.all([
          loadStats(),
          loadLiveUserCount(),
          loadRecentActivity(),
          loadBillingCenter(),
          pingSession(),
        ]);
        if (me?.role === "owner" || me?.role === "admin") {
          await loadAdminUsers();
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message || "Session error. Please sign in again.");
          logout();
        }
      }
    };

    bootstrap();

    const interval = setInterval(async () => {
      try {
        await Promise.all([loadLiveUserCount(), loadRecentActivity(), loadDashboardStats(), pingSession()]);
      } catch {
        // Silent polling failure to avoid noisy UI.
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!selectedCompany) {
      setWorkspaceReady(false);
      return;
    }

    const companyPartnerNames = cleanPartnerNames(selectedCompany.partner_names);
    const defaultPartnerCount = clampPartnerCount(companyPartnerNames.length || MIN_PARTNER_COUNT);
    setSetupBusinessType(selectedCompany.business_type || "sole_proprietor");
    setSetupPartnerCount(defaultPartnerCount);
    setSetupPartnerNames(createPartnerNameInputs(defaultPartnerCount, companyPartnerNames));

    setWorkspaceReady(false);
    const savedWorkspace = readStoredWorkspace(selectedCompany.id);
    const nextBusinessType = selectedCompany.business_type || savedWorkspace?.businessType || "sole_proprietor";
    setBusinessType(nextBusinessType);
    setAiCfoAnswer(null);
    setAiCfoQuestion("");
    setLedgerRows(normalizeLedgerRows(savedWorkspace?.ledgerRows, nextBusinessType));
    setBudgetTargets(savedWorkspace?.budgetTargets || INITIAL_BUDGET_TARGETS);
    setManufacturingInputs(savedWorkspace?.manufacturingInputs || INITIAL_MANUFACTURING_INPUTS);
    setPartners(normalizePartners(savedWorkspace?.partners, companyPartnerNames));
    setPartnershipAdjustments(savedWorkspace?.partnershipAdjustments || INITIAL_PARTNERSHIP_ADJUSTMENTS);
    setScenarioInputs(savedWorkspace?.scenarioInputs || INITIAL_SCENARIO_INPUTS);
    setWorkspaceReady(true);
    loadDashboardStats(selectedCompany.id).catch(() => {});
    loadFinanceWorkspace(selectedCompany.id).catch(() => {});
    loadAiCfoOverview(selectedCompany.id).catch(() => {});
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedCompanyId || !token || !selectedRegisterAccountId) {
      return;
    }
    loadAccountRegister(selectedCompanyId, selectedRegisterAccountId).catch(() => {});
  }, [selectedRegisterAccountId]);

  useEffect(() => {
    if (!selectedCompanyId || !token || !workspaceReady) {
      return;
    }

    persistWorkspace(selectedCompanyId, {
      businessType,
      ledgerRows,
      budgetTargets,
      manufacturingInputs,
      partners,
      partnershipAdjustments,
      scenarioInputs,
    });
  }, [selectedCompanyId, token, workspaceReady, businessType, ledgerRows, budgetTargets, manufacturingInputs, partners, partnershipAdjustments, scenarioInputs]);

  if (!token) {
    return (
      <div style={themedStyles.center}>
        <div style={themedStyles.landingShell}>
          <div style={themedStyles.landingStoryPanel}>
            <span style={themedStyles.landingBadge}>Built for small businesses and students</span>
            <h1 style={themedStyles.landingHeadline}>Accounting that grows from survival tool to AI finance copilot.</h1>
            <p style={themedStyles.landingLead}>
              Win revenue with dukas, freelancers, Instagram sellers, and WhatsApp merchants. Win growth with CPA and business students who practice daily and become tomorrow&apos;s paying customers.
            </p>
            <div style={themedStyles.landingAudienceGrid}>
              <div style={themedStyles.landingAudienceCard}>
                <strong>Revenue Engine</strong>
                <div style={themedStyles.updateIndicator}>Simple accounting, stress-free reporting, and mobile-ready workflows for real small businesses.</div>
              </div>
              <div style={themedStyles.landingAudienceCard}>
                <strong>Growth Engine</strong>
                <div style={themedStyles.updateIndicator}>Students get a practical workspace to learn sole trader, partnership, and manufacturing logic in one app.</div>
              </div>
            </div>
            <div style={themedStyles.pricingGrid}>
              {MARKETING_PLANS.map((plan) => (
                <div key={`landing-${plan.code}`} style={themedStyles.pricingCard}>
                  <strong>{plan.label}</strong>
                  <div style={themedStyles.pricingAmount}>{plan.usd}</div>
                  <div style={themedStyles.pricingAmountSubtle}>{plan.kes}</div>
                  <div style={themedStyles.updateIndicator}>{plan.summary}</div>
                  <ul style={themedStyles.landingFeatureList}>
                    {plan.features.map((feature) => <li key={`${plan.code}-${feature}`}>{feature}</li>)}
                  </ul>
                  <button
                    type="button"
                    onClick={() => switchAuthMode(plan.code === "free" ? "signup" : "signup")}
                    style={plan.code === "free" ? themedStyles.button : themedStyles.secondaryActionButton}
                  >
                    {plan.code === "free" ? "Start Free" : `Choose ${plan.label}`}
                  </button>
                </div>
              ))}
            </div>
            <div style={themedStyles.landingActionRow}>
              <button type="button" onClick={() => switchAuthMode("signup")} style={themedStyles.button}>Create Free Account</button>
              <button type="button" onClick={() => switchAuthMode("login")} style={themedStyles.secondaryActionButton}>I already have an account</button>
            </div>
          </div>
        <div style={themedStyles.authSingleCard}>
          <h2 style={themedStyles.authTitle}>
            {authMode === "login"
              ? "Login"
              : authMode === "signup"
                ? "Signup"
                : authMode === "forgot"
                  ? "Reset Password"
                  : "Set New Password"}
          </h2>
          <button type="button" onClick={toggleTheme} style={themedStyles.themeToggle}>
            Switch to {isDarkMode ? "Light" : "Dark"} Mode
          </button>

          {authMode === "login" ? (
            <>
              <input
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={themedStyles.authInput}
              />
              <div style={themedStyles.passwordWrap}>
                <input
                  placeholder="Password"
                  type={showLoginPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={themedStyles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  style={themedStyles.eyeToggle}
                >
                  {showLoginPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div style={themedStyles.authOptions}>
                <label style={themedStyles.rememberWrap}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  style={themedStyles.linkButton}
                  onClick={openForgotPassword}
                >
                  Forgot Password?
                </button>
              </div>
              <button onClick={login} style={themedStyles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Signing in..." : "Login"}
              </button>
              <p style={themedStyles.authSwitchText}>
                Don't have an account?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={() => switchAuthMode("signup")}
                >
                  Signup
                </button>
              </p>
            </>
          ) : authMode === "signup" ? (
            <>
              <input
                placeholder="Email"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                style={themedStyles.authInput}
              />
              <div style={themedStyles.passwordWrap}>
                <input
                  placeholder="Create password"
                  type={showSignupPassword ? "text" : "password"}
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  style={themedStyles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((value) => !value)}
                  style={themedStyles.eyeToggle}
                >
                  {showSignupPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div style={themedStyles.passwordWrap}>
                <input
                  placeholder="Confirm password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={themedStyles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  style={themedStyles.eyeToggle}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                placeholder="Organization (optional)"
                value={org}
                onChange={(event) => setOrg(event.target.value)}
                style={themedStyles.authInput}
              />
              <button onClick={register} style={themedStyles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Creating..." : "Signup"}
              </button>
              <p style={themedStyles.authSwitchText}>
                Already have an account?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={() => switchAuthMode("login")}
                >
                  Login
                </button>
              </p>
            </>
          ) : authMode === "forgot" ? (
            <>
              <p style={themedStyles.graphNote}>
                Enter your email and we&apos;ll prepare a secure password reset link. If email delivery is not configured, development preview mode will show the reset token here.
              </p>
              <input
                placeholder="Email"
                value={resetRequestEmail}
                onChange={(event) => setResetRequestEmail(event.target.value)}
                style={themedStyles.authInput}
              />
              <button onClick={requestPasswordReset} style={themedStyles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Preparing..." : "Send Reset Link"}
              </button>
              <p style={themedStyles.authSwitchText}>
                Already have a reset token?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={() => switchAuthMode("reset")}
                >
                  Enter New Password
                </button>
              </p>
              <p style={themedStyles.authSwitchText}>
                Remembered your password?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={() => switchAuthMode("login")}
                >
                  Back to Login
                </button>
              </p>
            </>
          ) : (
            <>
              <p style={themedStyles.graphNote}>
                Paste your reset token or open the reset link you received, then choose a new password.
              </p>
              <input
                placeholder="Reset token"
                value={resetToken}
                onChange={(event) => {
                  const nextToken = event.target.value;
                  setResetToken(nextToken);
                  updatePasswordResetLocation(nextToken.trim());
                }}
                style={themedStyles.authInput}
              />
              <div style={themedStyles.passwordWrap}>
                <input
                  placeholder="New password"
                  type={showSignupPassword ? "text" : "password"}
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  style={themedStyles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((value) => !value)}
                  style={themedStyles.eyeToggle}
                >
                  {showSignupPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div style={themedStyles.passwordWrap}>
                <input
                  placeholder="Confirm new password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={resetConfirmPassword}
                  onChange={(event) => setResetConfirmPassword(event.target.value)}
                  style={themedStyles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  style={themedStyles.eyeToggle}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              <button onClick={submitPasswordReset} style={themedStyles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Resetting..." : "Update Password"}
              </button>
              <p style={themedStyles.authSwitchText}>
                Need a new reset link?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={openForgotPassword}
                >
                  Request Again
                </button>
              </p>
              <p style={themedStyles.authSwitchText}>
                Back to login?{" "}
                <button
                  type="button"
                  style={themedStyles.inlineLink}
                  onClick={() => switchAuthMode("login")}
                >
                  Login
                </button>
              </p>
            </>
          )}
        </div>
        </div>

        {maintenance.maintenance ? <p style={themedStyles.warningText}>{maintenance.message}</p> : null}
        {errorMessage ? <p style={themedStyles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={themedStyles.infoText}>{infoMessage}</p> : null}
        <p style={themedStyles.graphNote}>
          System: {maintenance.environment} · Build {maintenance.version}
        </p>
        {resetPreviewLink ? (
          <div style={{ ...themedStyles.card, maxWidth: 540 }}>
            <p style={themedStyles.graphNote}>Development preview reset link</p>
            <input value={resetPreviewLink} readOnly style={themedStyles.authInput} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={themedStyles.layout} className="app-layout">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @media (max-width: 1024px) {
          .app-layout { flex-direction: column; min-height: 100vh; }
          .sidebar { width: 100% !important; }
          .main { padding: 20px !important; }
        }
      `}</style>

      <div style={themedStyles.sidebar} className="sidebar">
        <h2>Financial Analytics Platform</h2>
        <p style={themedStyles.sidebarMeta}>{currentUser?.email || "User"}</p>
        <p style={themedStyles.sidebarMeta}>Role: {currentUser?.role || "member"}</p>
        <p style={themedStyles.sidebarMeta}>Plan: {currentUser?.subscription?.plan_label || "Starter"}</p>
        <p style={themedStyles.sidebarMeta}>Companies: {currentUser?.accessible_company_count || companies.length || 0}</p>
        <p style={themedStyles.sidebarMeta}>System: {maintenance.environment} / {maintenance.version}</p>
        <p>Dashboard</p>
        <p>Reports</p>
        <p>Statements</p>
        {(currentUser?.role === "owner" || currentUser?.role === "admin") ? <p>Admin Panel</p> : null}
        <button onClick={toggleTheme} style={themedStyles.secondaryButton}>
          {isDarkMode ? "Light Mode" : "Dark Mode"}
        </button>
        <div style={themedStyles.actionRow}>
          <button onClick={logout} style={{ ...themedStyles.secondaryButton, marginTop: 0 }}>Logout</button>
          <button onClick={deleteOwnAccount} style={{ ...themedStyles.deleteButton, padding: "10px 16px", borderRadius: 8 }}>
            Delete Account
          </button>
        </div>
      </div>

      <div style={themedStyles.main} className="main">
        <h1>Executive Dashboard</h1>

        {maintenance.maintenance ? <p style={themedStyles.warningText}>{maintenance.message}</p> : null}
        {errorMessage ? <p style={themedStyles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={themedStyles.infoText}>{infoMessage}</p> : null}

        {needsCompanySetup ? (
          <div style={themedStyles.card}>
            <h3>Choose Your Business Layout</h3>
            <p style={themedStyles.graphNote}>
              After signing in, tell the system what kind of business you are setting up so the workspace opens with the right statements and schedules from the start.
            </p>
            <div style={themedStyles.quickEntryGrid}>
              <label style={themedStyles.budgetField}>
                Business Type
                <select
                  value={setupBusinessType}
                  onChange={(event) => setSetupBusinessType(event.target.value)}
                  style={themedStyles.tableInput}
                >
                  {BUSINESS_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {setupBusinessType === "partnership" ? (
                <label style={themedStyles.budgetField}>
                  Number of Partners
                  <input
                    type="number"
                    min={MIN_PARTNER_COUNT}
                    max={MAX_PARTNER_COUNT}
                    value={setupPartnerCount}
                    onChange={(event) => {
                      const nextCount = clampPartnerCount(event.target.value, setupPartnerCount);
                      setSetupPartnerCount(nextCount);
                      setSetupPartnerNames((names) => createPartnerNameInputs(nextCount, names));
                    }}
                    style={themedStyles.tableInput}
                  />
                </label>
              ) : null}
            </div>
            {setupBusinessType === "partnership" ? (
              <div style={themedStyles.quickEntryGrid}>
                {setupPartnerNames.map((partnerName, index) => (
                  <label key={`setup-partner-${index + 1}`} style={themedStyles.budgetField}>
                    Partner {index + 1} Name
                    <input
                      value={partnerName}
                      onChange={(event) => updateSetupPartnerName(index, event.target.value)}
                      style={themedStyles.tableInput}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {!canConfigureCompany ? (
              <p style={themedStyles.warningText}>An owner or admin needs to finish this company setup before the workspace can be tailored.</p>
            ) : null}
            <div style={themedStyles.actionRow}>
              <button onClick={saveCompanySetup} style={themedStyles.button} disabled={setupSaving || !canConfigureCompany}>
                {setupSaving ? "Saving..." : "Continue to Workspace"}
              </button>
            </div>
          </div>
        ) : null}

        <div style={themedStyles.heroCard}>
          <div style={themedStyles.heroHeader}>
            <div>
              <p style={themedStyles.eyebrow}>Finance Control Tower</p>
              <h2 style={themedStyles.heroTitle}>
                {selectedCompany?.name || "Main Company"} is running at a{" "}
                <span style={themedStyles.heroAccent}>{executiveMetrics.healthScore}/100</span> financial health score.
              </h2>
              <p style={themedStyles.heroSubtitle}>
                This workspace now keeps company-specific inputs, gives you a board-style narrative, and stress-tests the next six months of cash, collections, and operating pressure.
              </p>
            </div>
            <div style={themedStyles.heroActions}>
              <button
                onClick={exportExecutiveSummary}
                style={themedStyles.button}
                disabled={!hasProPlan}
                title={!hasProPlan ? "Upgrade to Pro to export reports." : "Export executive summary"}
              >
                Export Summary CSV
              </button>
              <button
                onClick={exportWorkspace}
                style={themedStyles.secondaryActionButton}
                disabled={!hasProPlan}
                title={!hasProPlan ? "Upgrade to Pro to export workspace data." : "Export workspace"}
              >
                Export Workspace JSON
              </button>
            </div>
          </div>
          <div style={themedStyles.heroMetricsGrid}>
            <div style={themedStyles.heroMetricCard}>
              <span style={themedStyles.metricLabel}>Net Margin</span>
              <strong style={themedStyles.metricValue}>{formatPercent(executiveMetrics.netMargin)}</strong>
              <span style={themedStyles.metricHelper}>After-tax profitability</span>
            </div>
            <div style={themedStyles.heroMetricCard}>
              <span style={themedStyles.metricLabel}>Current Ratio</span>
              <strong style={themedStyles.metricValue}>{executiveMetrics.currentRatio.toFixed(2)}x</strong>
              <span style={themedStyles.metricHelper}>Liquidity coverage</span>
            </div>
            <div style={themedStyles.heroMetricCard}>
              <span style={themedStyles.metricLabel}>Cash Runway</span>
              <strong style={themedStyles.metricValue}>
                {executiveMetrics.cashRunwayMonths ? `${executiveMetrics.cashRunwayMonths.toFixed(1)} mo` : "N/A"}
              </strong>
              <span style={themedStyles.metricHelper}>Based on current expense run rate</span>
            </div>
            <div style={themedStyles.heroMetricCard}>
              <span style={themedStyles.metricLabel}>Active Users</span>
              <strong style={themedStyles.metricValue}>{executiveMetrics.activeUsers}</strong>
              <span style={themedStyles.metricHelper}>Live across the organization</span>
            </div>
          </div>
        </div>

        <div style={themedStyles.liveUserCard}>
          <h3>Live Online Users</h3>
          <div style={themedStyles.userCountDisplay}>
            <span style={themedStyles.userCountNumber}>{userCount}</span>
            {userCountUpdating && <span style={themedStyles.pulse}>●</span>}
          </div>
          <p style={themedStyles.updateIndicator}>Active in the last 5 minutes, refreshes every 3 seconds</p>
        </div>

        <div style={themedStyles.card}>
          <h3>Recent Activity</h3>
          {recentActivity.length ? (
            <ul style={themedStyles.activityList}>
              {recentActivity.map((item, idx) => (
                <li key={`${item.time || "time"}-${idx}`} style={themedStyles.activityItem}>
                  <strong>{item.email || "User"}</strong> {item.action}
                  <span style={themedStyles.activityTime}>
                    {item.time ? new Date(item.time).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={themedStyles.updateIndicator}>No activity yet.</p>
          )}
        </div>

        <div style={themedStyles.card}>
          <h3>Secure Dashboard Metrics</h3>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>Sales: {formatMoney(dashboardStats?.sales || 0)}</div>
            <div style={themedStyles.kpiItem}>Expenses: {formatMoney(dashboardStats?.expenses || 0)}</div>
            <div style={themedStyles.kpiItem}>Profit: {formatMoney(dashboardStats?.profit || 0)}</div>
            <div style={themedStyles.kpiItem}>Inventory: {formatMoney(dashboardStats?.inventory_value || 0)}</div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Growth and Billing Engine</h3>
              <p style={themedStyles.graphNote}>Free attracts students and early-stage users. Pro unlocks the operating system. AI CFO adds proactive finance guidance.</p>
            </div>
            <div style={themedStyles.scoreBadge}>{(billingSummaryData?.plan_label || currentUser?.subscription?.plan_label || "Starter").slice(0, 8)}</div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Current Plan</strong>
              <div>{billingSummaryData?.plan_label || currentUser?.subscription?.plan_label || "Starter"}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Company Limit</strong>
              <div>{billingSummaryData?.max_companies || currentUser?.subscription?.max_companies || 1}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Billing Status</strong>
              <div>{billingSummaryData?.subscription_status || currentUser?.subscription?.subscription_status || "free"}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>AI Enabled</strong>
              <div>{(billingSummaryData?.ai_enabled || currentUser?.subscription?.ai_enabled) ? "Yes" : "No"}</div>
            </div>
          </div>
          <div style={themedStyles.pricingGrid}>
            {(billingPlans.length ? billingPlans : MARKETING_PLANS).map((plan) => {
              const isCurrentPlan = plan.code === currentPlanCode;
              const isDowngrade = (plan.code === "free") || (plan.code === "pro" && currentPlanCode === "ai");
              return (
                <div key={plan.code} style={themedStyles.pricingCard}>
                  <div style={themedStyles.pricingHeader}>
                    <div>
                      <strong>{plan.label}</strong>
                      <div style={themedStyles.updateIndicator}>{plan.summary}</div>
                    </div>
                    <span style={themedStyles.statusPill}>{isCurrentPlan ? "Current" : "Upgrade"}</span>
                  </div>
                  <div style={themedStyles.pricingAmount}>{plan.price_monthly ? `$${plan.price_monthly}/mo` : "$0"}</div>
                  <div style={themedStyles.pricingAmountSubtle}>{formatKes(plan.local_price_kes || 0)} / month</div>
                  <div style={themedStyles.reconciliationList}>
                    {(plan.features || []).map((feature) => (
                      <div key={`${plan.code}-${feature}`} style={themedStyles.reconciliationItem}>
                        <strong>{feature}</strong>
                      </div>
                    ))}
                  </div>
                  {plan.code !== "free" ? (
                    <div style={themedStyles.actionRow}>
                      <button
                        type="button"
                        onClick={() => startStripeCheckout(plan.code)}
                        style={themedStyles.button}
                        disabled={billingLoading || isCurrentPlan || isDowngrade || !["owner", "admin"].includes(currentUser?.role || "")}
                      >
                        Pay with Stripe
                      </button>
                      <button
                        type="button"
                        onClick={() => startMpesaCheckout(plan.code)}
                        style={themedStyles.secondaryActionButton}
                        disabled={billingLoading || isCurrentPlan || isDowngrade || !["owner", "admin"].includes(currentUser?.role || "")}
                      >
                        Pay with M-Pesa
                      </button>
                    </div>
                  ) : (
                    <p style={themedStyles.updateIndicator}>Starter stays free for onboarding and classroom growth.</p>
                  )}
                </div>
              );
            })}
          </div>
          <div style={themedStyles.quickEntryGrid}>
            <label style={themedStyles.budgetField}>
              M-Pesa Phone Number
              <input
                value={mpesaPhoneNumber}
                onChange={(event) => setMpesaPhoneNumber(event.target.value)}
                placeholder="2547XXXXXXXX"
                style={themedStyles.tableInput}
              />
            </label>
            <div style={themedStyles.kpiItem}>
              <strong>Kenya Pricing</strong>
              <div>Pro {formatKes(900)} / AI {formatKes(1500)}</div>
              <div style={themedStyles.updateIndicator}>Perfect for dukas, freelancers, Instagram sellers, and CPA students.</div>
            </div>
            {mpesaCheckout ? (
              <div style={themedStyles.kpiItem}>
                <strong>M-Pesa Status</strong>
                <div>{mpesaCheckout.status}</div>
                <div style={themedStyles.updateIndicator}>{mpesaCheckout.external_reference || mpesaCheckout.checkout_request_id}</div>
                <button type="button" onClick={refreshMpesaCheckout} style={themedStyles.secondaryActionButton}>Refresh Status</button>
              </div>
            ) : null}
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Financial Health Scorecard</h3>
              <p style={themedStyles.graphNote}>A quick-read operating view modeled after CFO dashboards and investor update packs.</p>
            </div>
            <div style={themedStyles.scoreBadge}>{executiveMetrics.healthScore}/100</div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Gross Margin</strong>
              <div>{formatPercent(executiveMetrics.grossMargin)}</div>
              <div>Revenue retained after direct cost.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Quick Ratio</strong>
              <div>{executiveMetrics.quickRatio.toFixed(2)}x</div>
              <div>Cash + receivables vs current liabilities.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Debt to Equity</strong>
              <div>{executiveMetrics.debtToEquity.toFixed(2)}x</div>
              <div>Capital structure pressure.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Working Capital</strong>
              <div>{formatMoney(executiveMetrics.workingCapital)}</div>
              <div>Short-term operating buffer.</div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Operating Alerts</h3>
              <p style={themedStyles.graphNote}>Focused next actions so the product behaves more like a finance copilot than a passive report viewer.</p>
            </div>
          </div>
          <div style={themedStyles.alertGrid}>
            {financeAlerts.map((alert, index) => (
              <div
                key={`${alert.title}-${index}`}
                style={{
                  ...themedStyles.alertCard,
                  ...(alert.severity === "critical"
                    ? themedStyles.alertCritical
                    : alert.severity === "warning"
                      ? themedStyles.alertWarning
                      : themedStyles.alertPositive),
                }}
              >
                <span style={themedStyles.alertPill}>{alert.severity.toUpperCase()}</span>
                <strong>{alert.title}</strong>
                <p style={themedStyles.alertText}>{alert.detail}</p>
                <p style={themedStyles.alertAction}>{alert.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Working Capital Cockpit</h3>
              <p style={themedStyles.graphNote}>Receivables, payables, stock, and operating cash pressure in one place.</p>
            </div>
            <button onClick={exportLedger} style={themedStyles.secondaryActionButton}>Export Ledger CSV</button>
          </div>
          <div style={themedStyles.signalGrid}>
            {operatingSignals.map((signal) => (
              <div
                key={signal.label}
                style={{
                  ...themedStyles.signalCard,
                  ...(signal.tone === "positive"
                    ? themedStyles.signalPositive
                    : signal.tone === "warning"
                      ? themedStyles.signalWarning
                      : themedStyles.signalCritical),
                }}
              >
                <span style={themedStyles.metricLabel}>{signal.label}</span>
                <strong style={themedStyles.metricValue}>
                  {signal.format === "percent"
                    ? formatPercent(signal.value)
                    : signal.format === "ratio"
                      ? `${signal.value.toFixed(2)}x`
                      : formatMoney(signal.value)}
                </strong>
                <span style={themedStyles.metricHelper}>{signal.description}</span>
              </div>
            ))}
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Cash</strong>
              <div>{formatMoney(statement.cashBalance)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Accounts Receivable</strong>
              <div>{formatMoney(statement.receivablesBalance)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Accounts Payable</strong>
              <div>{formatMoney(statement.payablesBalance)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Inventory</strong>
              <div>{formatMoney(statement.inventoryBalance)}</div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Scenario Planner</h3>
              <p style={themedStyles.graphNote}>Pressure-test the next six months using growth, collections, stock, and capex assumptions.</p>
            </div>
          </div>
          {hasProPlan ? (
            <>
              <div style={themedStyles.presetRow}>
                {SCENARIO_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyScenarioPreset(preset.id)}
                    style={themedStyles.presetButton}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div style={themedStyles.budgetGrid}>
                <label style={themedStyles.budgetField}>
                  Revenue Growth %
                  <input
                    type="number"
                    step="0.1"
                    value={scenarioInputs.revenueGrowth}
                    onChange={(event) => updateScenarioInput("revenueGrowth", event.target.value)}
                    style={themedStyles.tableInput}
                  />
                </label>
                <label style={themedStyles.budgetField}>
                  Expense Growth %
                  <input
                    type="number"
                    step="0.1"
                    value={scenarioInputs.expenseGrowth}
                    onChange={(event) => updateScenarioInput("expenseGrowth", event.target.value)}
                    style={themedStyles.tableInput}
                  />
                </label>
                <label style={themedStyles.budgetField}>
                  Collections Drag %
                  <input
                    type="number"
                    step="0.1"
                    value={scenarioInputs.collectionsDrag}
                    onChange={(event) => updateScenarioInput("collectionsDrag", event.target.value)}
                    style={themedStyles.tableInput}
                  />
                </label>
                <label style={themedStyles.budgetField}>
                  Inventory Shock %
                  <input
                    type="number"
                    step="0.1"
                    value={scenarioInputs.inventoryShock}
                    onChange={(event) => updateScenarioInput("inventoryShock", event.target.value)}
                    style={themedStyles.tableInput}
                  />
                </label>
                <label style={themedStyles.budgetField}>
                  Month 1 Capex
                  <input
                    type="number"
                    step="0.01"
                    value={scenarioInputs.capexPlan}
                    onChange={(event) => updateScenarioInput("capexPlan", event.target.value)}
                    style={themedStyles.tableInput}
                  />
                </label>
              </div>
              <div style={themedStyles.chartWrap}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={forecastModel.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#dbeafe"} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatMoney(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="expense" stroke="#dc2626" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="cash" stroke="#1d4ed8" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={themedStyles.kpiGrid}>
                <div style={themedStyles.kpiItem}>
                  <strong>Ending Cash</strong>
                  <div>{formatMoney(forecastModel.summary.endingCash)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Lowest Cash Point</strong>
                  <div>{formatMoney(forecastModel.summary.lowestCash)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Financing Need</strong>
                  <div>{formatMoney(forecastModel.summary.financingNeed)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Peak Monthly Revenue</strong>
                  <div>{formatMoney(forecastModel.summary.peakRevenueMonth)}</div>
                </div>
              </div>
            </>
          ) : (
            <div style={themedStyles.integrationBanner}>
              <strong>Upgrade to Pro to unlock the Scenario Planner</strong>
              <div style={themedStyles.updateIndicator}>Stress test cash flow, collections drag, stock shocks, and capex before they hit the business.</div>
            </div>
          )}
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Board Narrative</h3>
              <p style={themedStyles.graphNote}>A ready-to-share summary that turns the numbers into an executive storyline.</p>
            </div>
          </div>
          <div style={themedStyles.narrativeCard}>{boardNarrative}</div>
          <p style={themedStyles.updateIndicator}>
            Company workspaces now auto-save locally, so each company can keep its own inputs, budget targets, partners, and scenario assumptions.
          </p>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>AI CFO System</h3>
              <p style={themedStyles.graphNote}>This is the proactive layer: it reads the business, spots risk, forecasts cash, and tells the owner what to do next.</p>
            </div>
            <div style={themedStyles.scoreBadge}>{hasAiPlan ? "AI" : "LOCK"}</div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Cash Balance</strong>
              <div>{formatMoney(aiCfoOverviewData?.metrics?.cash_balance || 0)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Current Ratio</strong>
              <div>{aiCfoOverviewData?.metrics?.current_ratio ? `${aiCfoOverviewData.metrics.current_ratio}x` : "N/A"}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Monthly Outflow</strong>
              <div>{formatMoney(aiCfoOverviewData?.metrics?.monthly_outflow || 0)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Cash Runway</strong>
              <div>{aiCfoOverviewData?.metrics?.cash_runway_months ? `${aiCfoOverviewData.metrics.cash_runway_months} months` : "N/A"}</div>
            </div>
          </div>
          <div style={themedStyles.alertGrid}>
            {(aiCfoOverviewData?.alerts || []).slice(0, 4).map((alert) => (
              <div
                key={`${alert.title}-${alert.severity}`}
                style={{
                  ...themedStyles.alertCard,
                  ...(alert.severity === "high"
                    ? themedStyles.alertCritical
                    : alert.severity === "medium"
                      ? themedStyles.alertWarning
                      : themedStyles.alertPositive),
                }}
              >
                <span style={themedStyles.alertPill}>{alert.severity}</span>
                <strong>{alert.title}</strong>
                <div>{alert.message}</div>
                <div style={themedStyles.updateIndicator}>{alert.recommendation}</div>
              </div>
            ))}
          </div>
          <div style={themedStyles.narrativeCard}>
            {aiCfoOverviewData?.narrative || "AI CFO will summarize the company once there is enough live finance data for the selected company."}
          </div>
          {hasAiPlan ? (
            <div style={themedStyles.quickEntryGrid}>
              <input
                placeholder="Ask: Why is my profit low? Will I run out of cash? Which customers should I chase?"
                value={aiCfoQuestion}
                onChange={(event) => setAiCfoQuestion(event.target.value)}
                style={themedStyles.tableInput}
              />
              <button type="button" onClick={askAiCfo} style={themedStyles.button} disabled={aiCfoLoading}>
                {aiCfoLoading ? "Thinking..." : "Ask AI CFO"}
              </button>
            </div>
          ) : (
            <div style={themedStyles.integrationBanner}>
              <strong>Upgrade to AI CFO</strong>
              <div style={themedStyles.updateIndicator}>Unlock chat with your business, proactive recommendations, and the full owner copilot workflow.</div>
            </div>
          )}
          {aiCfoAnswer ? <div style={themedStyles.narrativeCard}>{aiCfoAnswer.answer}</div> : null}
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Finance Operations Hub</h3>
              <p style={themedStyles.graphNote}>
                Deeper workflows for receivables, payables, banking, reconciliation, and tax live here for {selectedCompany?.name || "the active company"}.
              </p>
            </div>
            {financeLoading ? <span style={themedStyles.updateIndicator}>Refreshing finance workspace...</span> : null}
          </div>
          {!hasProPlan ? (
            <div style={themedStyles.integrationBanner}>
              <strong>Pro plan lock</strong>
              <div style={themedStyles.updateIndicator}>Free users can view the workspace, but creation, automation, exports, bank sync, reconciliation rules, tax filing, and operations actions unlock on Pro.</div>
            </div>
          ) : null}
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Open Receivables</strong>
              <div>{formatMoney(financeSummary?.open_receivables || 0)}</div>
              <div>Overdue: {formatMoney(financeSummary?.overdue_receivables || 0)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Open Payables</strong>
              <div>{formatMoney(financeSummary?.open_payables || 0)}</div>
              <div>Overdue: {formatMoney(financeSummary?.overdue_payables || 0)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Collections This Month</strong>
              <div>{formatMoney(financeSummary?.collected_this_month || 0)}</div>
              <div>Receipts posted against invoices.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Disbursements This Month</strong>
              <div>{formatMoney(financeSummary?.paid_this_month || 0)}</div>
              <div>Payments posted against vendor bills.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Unmatched Bank Items</strong>
              <div>{financeSummary?.bank_unmatched_count || 0}</div>
              <div>Ready for reconciliation.</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Net Tax Due</strong>
              <div>{formatMoney(financeSummary?.net_tax_due || 0)}</div>
              <div>Sales tax less purchase tax credit.</div>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Receivables Aging</h4>
              <div style={themedStyles.kpiGrid}>
                {Object.entries(receivablesData?.buckets || {}).map(([bucket, value]) => (
                  <div key={bucket} style={themedStyles.kpiItem}>
                    <strong>{bucket.replaceAll("_", " ")}</strong>
                    <div>{formatMoney(value)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Payables Aging</h4>
              <div style={themedStyles.kpiGrid}>
                {Object.entries(payablesData?.buckets || {}).map(([bucket, value]) => (
                  <div key={bucket} style={themedStyles.kpiItem}>
                    <strong>{bucket.replaceAll("_", " ")}</strong>
                    <div>{formatMoney(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Invoicing Workflow</h3>
              <p style={themedStyles.graphNote}>Create customer invoices, send them into the workflow, and record cash collection against open balances.</p>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Create Invoice</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input
                  placeholder="Customer name"
                  value={invoiceForm.customer_name}
                  onChange={(event) => updateInvoiceFormField("customer_name", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  placeholder="Customer email"
                  value={invoiceForm.customer_email}
                  onChange={(event) => updateInvoiceFormField("customer_email", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="date"
                  value={invoiceForm.due_date}
                  onChange={(event) => updateInvoiceFormField("due_date", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="number"
                  step="0.01"
                  value={invoiceForm.tax_rate}
                  onChange={(event) => updateInvoiceFormField("tax_rate", event.target.value)}
                  style={themedStyles.tableInput}
                  placeholder="Tax rate %"
                />
                <select
                  value={invoiceForm.status}
                  onChange={(event) => updateInvoiceFormField("status", event.target.value)}
                  style={themedStyles.tableInput}
                >
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                </select>
                <input
                  placeholder="Notes"
                  value={invoiceForm.notes}
                  onChange={(event) => updateInvoiceFormField("notes", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </div>
              <div style={themedStyles.documentLineList}>
                {invoiceForm.items.map((item, index) => (
                  <div key={`invoice-item-${index}`} style={themedStyles.documentLineRow}>
                    <input
                      placeholder="Description"
                      value={item.description}
                      onChange={(event) => updateDocumentItem(setInvoiceForm, index, "description", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(event) => updateDocumentItem(setInvoiceForm, index, "quantity", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit price"
                      value={item.unit_price}
                      onChange={(event) => updateDocumentItem(setInvoiceForm, index, "unit_price", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <button type="button" onClick={() => removeDocumentItem(setInvoiceForm, index)} style={themedStyles.deleteButton}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={() => addDocumentItem(setInvoiceForm)} style={themedStyles.secondaryActionButton}>Add Line</button>
                <button type="button" onClick={createInvoiceRecord} style={themedStyles.button} disabled={!canManageFinanceOps || !hasProPlan}>
                  Create Invoice
                </button>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Invoice Pipeline</h4>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Invoice</th>
                      <th style={themedStyles.th}>Customer</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Total</th>
                      <th style={themedStyles.th}>Balance</th>
                      <th style={themedStyles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 8).map((invoice) => (
                      <tr key={invoice.id}>
                        <td style={themedStyles.td}>
                          <strong>{invoice.invoice_number}</strong>
                          <div style={themedStyles.updateIndicator}>{invoice.due_date || "No due date"}</div>
                        </td>
                        <td style={themedStyles.td}>{invoice.customer_name}</td>
                        <td style={themedStyles.td}>
                          <span style={themedStyles.statusPill}>{invoice.status}</span>
                        </td>
                        <td style={themedStyles.td}>{formatMoney(invoice.total_amount)}</td>
                        <td style={themedStyles.td}>{formatMoney(invoice.balance_due)}</td>
                        <td style={themedStyles.td}>
                          <div style={themedStyles.actionRow}>
                            {invoice.status === "draft" ? (
                              <button type="button" onClick={() => updateInvoiceWorkflowStatus(invoice.id, "sent")} style={themedStyles.button} disabled={!canManageFinanceOps || !hasProPlan}>
                                Send
                              </button>
                            ) : null}
                            {invoice.balance_due > 0 ? (
                              <button type="button" onClick={() => promptAndRecordInvoicePayment(invoice)} style={themedStyles.secondaryActionButton} disabled={!canManageFinanceOps || !hasProPlan}>
                                Record Payment
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>AP Lifecycle Automation</h3>
              <p style={themedStyles.graphNote}>Capture vendor bills, approve them, and post disbursements against open balances.</p>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Create Vendor Bill</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input
                  placeholder="Vendor name"
                  value={billForm.vendor_name}
                  onChange={(event) => updateBillFormField("vendor_name", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="date"
                  value={billForm.due_date}
                  onChange={(event) => updateBillFormField("due_date", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="number"
                  step="0.01"
                  value={billForm.tax_rate}
                  onChange={(event) => updateBillFormField("tax_rate", event.target.value)}
                  style={themedStyles.tableInput}
                  placeholder="Tax rate %"
                />
                <select
                  value={billForm.status}
                  onChange={(event) => updateBillFormField("status", event.target.value)}
                  style={themedStyles.tableInput}
                >
                  <option value="draft">draft</option>
                  <option value="approved">approved</option>
                </select>
                <input
                  placeholder="Notes"
                  value={billForm.notes}
                  onChange={(event) => updateBillFormField("notes", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </div>
              <div style={themedStyles.documentLineList}>
                {billForm.items.map((item, index) => (
                  <div key={`bill-item-${index}`} style={themedStyles.documentLineRow}>
                    <input
                      placeholder="Description"
                      value={item.description}
                      onChange={(event) => updateDocumentItem(setBillForm, index, "description", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(event) => updateDocumentItem(setBillForm, index, "quantity", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Unit price"
                      value={item.unit_price}
                      onChange={(event) => updateDocumentItem(setBillForm, index, "unit_price", event.target.value)}
                      style={themedStyles.tableInput}
                    />
                    <button type="button" onClick={() => removeDocumentItem(setBillForm, index)} style={themedStyles.deleteButton}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={() => addDocumentItem(setBillForm)} style={themedStyles.secondaryActionButton}>Add Line</button>
                <button type="button" onClick={createBillRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                  Create Bill
                </button>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Vendor Bill Queue</h4>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Bill</th>
                      <th style={themedStyles.th}>Vendor</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Total</th>
                      <th style={themedStyles.th}>Balance</th>
                      <th style={themedStyles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.slice(0, 8).map((bill) => (
                      <tr key={bill.id}>
                        <td style={themedStyles.td}>
                          <strong>{bill.bill_number}</strong>
                          <div style={themedStyles.updateIndicator}>{bill.due_date || "No due date"}</div>
                        </td>
                        <td style={themedStyles.td}>{bill.vendor_name}</td>
                        <td style={themedStyles.td}>
                          <span style={themedStyles.statusPill}>{bill.status}</span>
                        </td>
                        <td style={themedStyles.td}>{formatMoney(bill.total_amount)}</td>
                        <td style={themedStyles.td}>{formatMoney(bill.balance_due)}</td>
                        <td style={themedStyles.td}>
                          <div style={themedStyles.actionRow}>
                            {bill.status === "draft" ? (
                              <button type="button" onClick={() => updateBillWorkflowStatus(bill.id, "approved")} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                                Approve
                              </button>
                            ) : null}
                            {bill.balance_due > 0 ? (
                              <button type="button" onClick={() => promptAndRecordBillPayment(bill)} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                                Record Payment
                              </button>
                            ) : null}
                            {bill.balance_due > 0 ? (
                              <button type="button" onClick={() => scheduleBillDisbursement(bill)} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                                Schedule Rail
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Bank Feeds and Reconciliation</h3>
              <p style={themedStyles.graphNote}>Import bank activity, then clear it against invoices and bills with reconciliation suggestions.</p>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Import Bank Feed</h4>
              <div style={themedStyles.integrationBanner}>
                <strong>Plaid Direct Connection</strong>
                <div style={themedStyles.updateIndicator}>
                  {bankingProviders?.plaid?.enabled
                    ? `Enabled (${bankingProviders?.plaid?.environment || "sandbox"})`
                    : "Not configured. File import remains available until PLAID_CLIENT_ID and PLAID_SECRET are set."}
                </div>
                <div style={themedStyles.actionRow}>
                  <button
                    type="button"
                    onClick={createPlaidLinkToken}
                    style={themedStyles.button}
                    disabled={!canManagePayables || !hasProPlan || !bankingProviders?.plaid?.enabled}
                  >
                    Connect Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => syncPlaidTransactions()}
                    style={themedStyles.secondaryActionButton}
                    disabled={!canManagePayables || !hasProPlan || !bankConnections.length}
                  >
                    Sync Connected Bank
                  </button>
                </div>
              </div>
              {bankConnections.length ? (
                <div style={themedStyles.connectionList}>
                  {bankConnections.map((connection) => (
                    <div key={connection.id} style={themedStyles.connectionCard}>
                      <strong>{connection.institution_name}</strong>
                      <div style={themedStyles.updateIndicator}>{connection.status}</div>
                      <button
                        type="button"
                        onClick={() => syncPlaidTransactions(connection.id)}
                        style={themedStyles.secondaryActionButton}
                        disabled={!canManagePayables || !hasProPlan}
                      >
                        Sync
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <input
                type="file"
                accept=".csv,.txt,.json,.xls,.xlsx"
                onChange={(event) => setBankFeedFile(event.target.files?.[0] || null)}
              />
              <p style={themedStyles.graphNote}>Accepted columns: date, description, amount, reference or debit/credit pairs.</p>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={importBankFeed} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                  Import Feed
                </button>
              </div>
              {bankFeedFile ? <p style={themedStyles.updateIndicator}>Selected: {bankFeedFile.name}</p> : null}
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Date</th>
                      <th style={themedStyles.th}>Description</th>
                      <th style={themedStyles.th}>Direction</th>
                      <th style={themedStyles.th}>Amount</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankTransactions.slice(0, 8).map((transaction) => (
                      <tr key={transaction.id}>
                        <td style={themedStyles.td}>{transaction.posted_at}</td>
                        <td style={themedStyles.td}>{transaction.description}</td>
                        <td style={themedStyles.td}>{transaction.direction}</td>
                        <td style={themedStyles.td}>{formatMoney(transaction.absolute_amount)}</td>
                        <td style={themedStyles.td}><span style={themedStyles.statusPill}>{transaction.status}</span></td>
                        <td style={themedStyles.td}>
                          {transaction.status !== "matched" ? (
                            <button type="button" onClick={() => flagReconciliationException(transaction.id)} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                              Flag Exception
                            </button>
                          ) : (
                            <span style={themedStyles.updateIndicator}>Cleared</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Reconciliation Suggestions</h4>
              {reconciliationItems.length ? (
                <div style={themedStyles.reconciliationList}>
                  {reconciliationItems.map((suggestion) => (
                    <div key={`${suggestion.transaction.id}-${suggestion.entity_type}`} style={themedStyles.reconciliationItem}>
                      <div>
                        <strong>{suggestion.document_number}</strong>
                        <div style={themedStyles.updateIndicator}>
                          {suggestion.counterparty} • Confidence {(suggestion.confidence * 100).toFixed(0)}%
                        </div>
                        <div style={themedStyles.updateIndicator}>
                          {suggestion.transaction.description} • {formatMoney(suggestion.transaction.absolute_amount)}
                        </div>
                      </div>
                      <button type="button" onClick={() => reconcileSuggestion(suggestion)} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                        Match
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={themedStyles.updateIndicator}>No reconciliation suggestions right now.</p>
              )}
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Tax Center</h3>
              <p style={themedStyles.graphNote}>Track indirect tax, set company tax profile defaults, and preview filing-period totals.</p>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Tax Profile</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input
                  placeholder="Jurisdiction code"
                  value={taxProfile.jurisdiction_code}
                  onChange={(event) => updateTaxProfileField("jurisdiction_code", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <select
                  value={taxProfile.filing_frequency}
                  onChange={(event) => updateTaxProfileField("filing_frequency", event.target.value)}
                  style={themedStyles.tableInput}
                >
                  <option value="monthly">monthly</option>
                  <option value="quarterly">quarterly</option>
                  <option value="annual">annual</option>
                </select>
                <input
                  placeholder="Registration number"
                  value={taxProfile.registration_number}
                  onChange={(event) => updateTaxProfileField("registration_number", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  placeholder="Currency"
                  value={taxProfile.currency_code}
                  onChange={(event) => updateTaxProfileField("currency_code", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  placeholder="Sales tax label"
                  value={taxProfile.sales_tax_name}
                  onChange={(event) => updateTaxProfileField("sales_tax_name", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  placeholder="Purchase tax label"
                  value={taxProfile.purchase_tax_name}
                  onChange={(event) => updateTaxProfileField("purchase_tax_name", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Indirect tax rate"
                  value={taxProfile.indirect_tax_rate}
                  onChange={(event) => updateTaxProfileField("indirect_tax_rate", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Income tax rate"
                  value={taxProfile.income_tax_rate}
                  onChange={(event) => updateTaxProfileField("income_tax_rate", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="number"
                  min="1"
                  max="12"
                  placeholder="Period start month"
                  value={taxProfile.period_start_month}
                  onChange={(event) => updateTaxProfileField("period_start_month", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={saveTaxProfile} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                  Save Tax Profile
                </button>
              </div>
              <p style={themedStyles.updateIndicator}>
                This profile makes the tax center jurisdiction-aware by company configuration, so the filing preview reflects your labels, rates, filing cadence, and registration context.
              </p>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Current Tax Summary</h4>
              <div style={themedStyles.kpiGrid}>
                <div style={themedStyles.kpiItem}>
                  <strong>{taxSummary?.sales_tax_name || "Sales Tax Collected"}</strong>
                  <div>{formatMoney(taxSummary?.sales_tax_collected || 0)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>{taxSummary?.purchase_tax_name || "Purchase Tax Credit"}</strong>
                  <div>{formatMoney(taxSummary?.purchase_tax_credit || 0)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Net Tax Due</strong>
                  <div>{formatMoney(taxSummary?.net_tax_due || 0)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Taxable Profit</strong>
                  <div>{formatMoney(taxSummary?.taxable_profit || 0)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Estimated Income Tax</strong>
                  <div>{formatMoney(taxSummary?.estimated_income_tax || 0)}</div>
                </div>
                <div style={themedStyles.kpiItem}>
                  <strong>Effective Rate</strong>
                  <div>{formatPercent(taxSummary?.effective_tax_rate || 0)}</div>
                </div>
              </div>
              <div style={themedStyles.narrativeCard}>
                Filing window: {taxFilingPreview?.period_start || "N/A"} to {taxFilingPreview?.period_end || "N/A"}.
                {` `}Sales docs: {taxFilingPreview?.documents?.sales_documents || 0}. Purchase docs: {taxFilingPreview?.documents?.purchase_documents || 0}.
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Jurisdictions and Filing Queue</h4>
              <div style={themedStyles.adminCreateGrid}>
                <select
                  value={taxProfile.jurisdiction_code}
                  onChange={(event) => updateTaxProfileField("jurisdiction_code", event.target.value)}
                  style={themedStyles.tableInput}
                >
                  {taxJurisdictions.map((jurisdiction) => (
                    <option key={jurisdiction.code} value={jurisdiction.code}>
                      {jurisdiction.name}
                    </option>
                  ))}
                </select>
                <select
                  value={taxFilingForm.filing_type}
                  onChange={(event) => updateTaxFilingFormField("filing_type", event.target.value)}
                  style={themedStyles.tableInput}
                >
                  <option value="indirect_tax">indirect_tax</option>
                  <option value="income_tax">income_tax</option>
                  <option value="payroll_tax">payroll_tax</option>
                </select>
                <input
                  type="date"
                  value={taxFilingForm.period_start}
                  onChange={(event) => updateTaxFilingFormField("period_start", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <input
                  type="date"
                  value={taxFilingForm.period_end}
                  onChange={(event) => updateTaxFilingFormField("period_end", event.target.value)}
                  style={themedStyles.tableInput}
                />
                <button type="button" onClick={prepareTaxFilingRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                  Prepare Filing
                </button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Jurisdiction</th>
                      <th style={themedStyles.th}>Period</th>
                      <th style={themedStyles.th}>Type</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxFilings.slice(0, 8).map((filing) => (
                      <tr key={filing.id}>
                        <td style={themedStyles.td}>{filing.jurisdiction_code}</td>
                        <td style={themedStyles.td}>{filing.period_start} to {filing.period_end}</td>
                        <td style={themedStyles.td}>{filing.filing_type}</td>
                        <td style={themedStyles.td}><span style={themedStyles.statusPill}>{filing.status}</span></td>
                        <td style={themedStyles.td}>
                          {filing.status !== "submitted" ? (
                            <button type="button" onClick={() => submitTaxFilingRecord(filing.id)} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                              Submit
                            </button>
                          ) : (
                            <span style={themedStyles.updateIndicator}>{filing.reference || "Submitted"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Accounting Core</h3>
              <p style={themedStyles.graphNote}>True chart of accounts, double-entry journals, trial balance, and live account registers for accountant-grade review.</p>
            </div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Accounts</strong>
              <div>{accountingOverviewData?.account_count || 0}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Journal Entries</strong>
              <div>{accountingOverviewData?.journal_count || 0}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Trial Balance</strong>
              <div>{accountingOverviewData?.trial_balance?.balanced ? "Balanced" : "Out of balance"}</div>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Chart of Accounts</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Code" value={accountForm.code} onChange={(event) => updateAccountFormField("code", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Name" value={accountForm.name} onChange={(event) => updateAccountFormField("name", event.target.value)} style={themedStyles.tableInput} />
                <select value={accountForm.category} onChange={(event) => updateAccountFormField("category", event.target.value)} style={themedStyles.tableInput}>
                  <option value="asset">asset</option>
                  <option value="liability">liability</option>
                  <option value="equity">equity</option>
                  <option value="revenue">revenue</option>
                  <option value="expense">expense</option>
                </select>
                <input placeholder="Subtype" value={accountForm.subtype} onChange={(event) => updateAccountFormField("subtype", event.target.value)} style={themedStyles.tableInput} />
                <select value={accountForm.normal_balance} onChange={(event) => updateAccountFormField("normal_balance", event.target.value)} style={themedStyles.tableInput}>
                  <option value="debit">debit</option>
                  <option value="credit">credit</option>
                </select>
                <button type="button" onClick={createChartAccount} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Create Account</button>
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={seedDefaultChartOfAccounts} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                  Seed Default Chart
                </button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Code</th>
                      <th style={themedStyles.th}>Name</th>
                      <th style={themedStyles.th}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartOfAccounts.slice(0, 10).map((account) => (
                      <tr key={account.id}>
                        <td style={themedStyles.td}>{account.code}</td>
                        <td style={themedStyles.td}>{account.name}</td>
                        <td style={themedStyles.td}>{account.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Manual Journal</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Memo" value={journalForm.memo} onChange={(event) => setJournalForm((current) => ({ ...current, memo: event.target.value }))} style={themedStyles.tableInput} />
                <input type="date" value={journalForm.entry_date} onChange={(event) => setJournalForm((current) => ({ ...current, entry_date: event.target.value }))} style={themedStyles.tableInput} />
                <input placeholder="Reference" value={journalForm.reference} onChange={(event) => setJournalForm((current) => ({ ...current, reference: event.target.value }))} style={themedStyles.tableInput} />
              </div>
              <div style={themedStyles.documentLineList}>
                {journalForm.lines.map((line, index) => (
                  <div key={`journal-line-${index}`} style={themedStyles.documentLineRow}>
                    <input placeholder="Account code" value={line.account_code} onChange={(event) => updateJournalLine(index, "account_code", event.target.value)} style={themedStyles.tableInput} />
                    <input type="number" step="0.01" placeholder="Debit" value={line.debit} onChange={(event) => updateJournalLine(index, "debit", event.target.value)} style={themedStyles.tableInput} />
                    <input type="number" step="0.01" placeholder="Credit" value={line.credit} onChange={(event) => updateJournalLine(index, "credit", event.target.value)} style={themedStyles.tableInput} />
                    <button type="button" onClick={() => removeJournalLine(index)} style={themedStyles.deleteButton}>Remove</button>
                  </div>
                ))}
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={addJournalLine} style={themedStyles.secondaryActionButton}>Add Line</button>
                <button type="button" onClick={postManualJournal} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Post Journal</button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Entry</th>
                      <th style={themedStyles.th}>Date</th>
                      <th style={themedStyles.th}>Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(accountingOverviewData?.recent_entries || []).map((entry) => (
                      <tr key={entry.id}>
                        <td style={themedStyles.td}>{entry.entry_number}</td>
                        <td style={themedStyles.td}>{entry.entry_date}</td>
                        <td style={themedStyles.td}>{entry.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Account Register</h4>
              <div style={themedStyles.adminCreateGrid}>
                <select value={selectedRegisterAccountId} onChange={(event) => setSelectedRegisterAccountId(event.target.value)} style={themedStyles.tableInput}>
                  {chartOfAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={themedStyles.kpiItem}>
                <strong>Ending Balance</strong>
                <div>{formatMoney(accountRegister?.ending_balance || 0)}</div>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Date</th>
                      <th style={themedStyles.th}>Entry</th>
                      <th style={themedStyles.th}>Debit</th>
                      <th style={themedStyles.th}>Credit</th>
                      <th style={themedStyles.th}>Running</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(accountRegister?.items || []).slice(-8).map((item) => (
                      <tr key={`${item.entry_id}-${item.entry_number}`}>
                        <td style={themedStyles.td}>{item.entry_date}</td>
                        <td style={themedStyles.td}>{item.entry_number}</td>
                        <td style={themedStyles.td}>{formatMoney(item.debit)}</td>
                        <td style={themedStyles.td}>{formatMoney(item.credit)}</td>
                        <td style={themedStyles.td}>{formatMoney(item.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Vendor Compliance and Bill Pay Rails</h3>
              <p style={themedStyles.graphNote}>Vendor master data, 1099 readiness, scheduled disbursements, and execution tracking by payment rail.</p>
            </div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}>
              <strong>Reportable 1099 Total</strong>
              <div>{formatMoney(vendor1099Summary?.reportable_total || 0)}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>1099 Ready Vendors</strong>
              <div>{vendor1099Summary?.ready_count || 0}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Scheduled Disbursements</strong>
              <div>{billPaySummary?.scheduled_count || 0}</div>
            </div>
            <div style={themedStyles.kpiItem}>
              <strong>Completed Disbursements</strong>
              <div>{formatMoney(billPaySummary?.completed_amount || 0)}</div>
            </div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Vendor Profile</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Vendor name" value={vendorForm.vendor_name} onChange={(event) => updateVendorFormField("vendor_name", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Email" value={vendorForm.email} onChange={(event) => updateVendorFormField("email", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Tax ID / TIN" value={vendorForm.tax_id} onChange={(event) => updateVendorFormField("tax_id", event.target.value)} style={themedStyles.tableInput} />
                <select value={vendorForm.default_payment_rail} onChange={(event) => updateVendorFormField("default_payment_rail", event.target.value)} style={themedStyles.tableInput}>
                  <option value="ach">ach</option>
                  <option value="wire">wire</option>
                  <option value="card">card</option>
                  <option value="check">check</option>
                  <option value="mobile_money">mobile_money</option>
                </select>
                <select value={vendorForm.tin_status} onChange={(event) => updateVendorFormField("tin_status", event.target.value)} style={themedStyles.tableInput}>
                  <option value="pending">pending</option>
                  <option value="received">received</option>
                  <option value="verified">verified</option>
                </select>
                <button type="button" onClick={saveVendorProfile} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Save Vendor</button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Vendor</th>
                      <th style={themedStyles.th}>Rail</th>
                      <th style={themedStyles.th}>1099</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.slice(0, 8).map((vendor) => (
                      <tr key={vendor.id}>
                        <td style={themedStyles.td}>{vendor.vendor_name}</td>
                        <td style={themedStyles.td}>{vendor.default_payment_rail}</td>
                        <td style={themedStyles.td}>{vendor.is_1099_eligible ? vendor.tin_status : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Scheduled and Completed Payments</h4>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Bill</th>
                      <th style={themedStyles.th}>Vendor</th>
                      <th style={themedStyles.th}>Rail</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(billPaySummary?.items || []).slice(0, 8).map((item) => (
                      <tr key={item.id}>
                        <td style={themedStyles.td}>{item.bill_number}</td>
                        <td style={themedStyles.td}>{item.vendor_name}</td>
                        <td style={themedStyles.td}>{item.payment_rail}</td>
                        <td style={themedStyles.td}><span style={themedStyles.statusPill}>{item.status}</span></td>
                        <td style={themedStyles.td}>
                          {item.status !== "completed" ? (
                            <button type="button" onClick={() => executeBillDisbursement(item.id)} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                              Execute
                            </button>
                          ) : (
                            <span style={themedStyles.updateIndicator}>{item.confirmation_code || "Completed"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={themedStyles.updateIndicator}>Use the Vendor Bill Queue above to schedule payments directly from open bills.</p>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Reconciliation Rules and Exceptions</h3>
              <p style={themedStyles.graphNote}>Keyword rules, exception queues, and transaction triage so bank close becomes a managed workflow instead of a manual hunt.</p>
            </div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}><strong>Unmatched</strong><div>{reconciliationWorkspaceData?.summary?.unmatched || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Rule Matched</strong><div>{reconciliationWorkspaceData?.summary?.rule_matched || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Exceptions</strong><div>{reconciliationWorkspaceData?.summary?.exceptions || 0}</div></div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Rule Builder</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Rule name" value={reconciliationRuleForm.name} onChange={(event) => updateReconciliationRuleField("name", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Keyword" value={reconciliationRuleForm.keyword} onChange={(event) => updateReconciliationRuleField("keyword", event.target.value)} style={themedStyles.tableInput} />
                <select value={reconciliationRuleForm.direction} onChange={(event) => updateReconciliationRuleField("direction", event.target.value)} style={themedStyles.tableInput}>
                  <option value="any">any</option>
                  <option value="inflow">inflow</option>
                  <option value="outflow">outflow</option>
                </select>
                <select value={reconciliationRuleForm.auto_action} onChange={(event) => updateReconciliationRuleField("auto_action", event.target.value)} style={themedStyles.tableInput}>
                  <option value="suggest_account">suggest_account</option>
                  <option value="flag_exception">flag_exception</option>
                </select>
                <input placeholder="Target / reference" value={reconciliationRuleForm.target_reference} onChange={(event) => updateReconciliationRuleField("target_reference", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createReconciliationRuleRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Save Rule</button>
              </div>
              <div style={themedStyles.actionRow}>
                <button type="button" onClick={autoApplyReconciliationRules} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                  Auto Apply Rules
                </button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Rule</th>
                      <th style={themedStyles.th}>Direction</th>
                      <th style={themedStyles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationRules.slice(0, 8).map((rule) => (
                      <tr key={rule.id}>
                        <td style={themedStyles.td}>{rule.name}</td>
                        <td style={themedStyles.td}>{rule.direction}</td>
                        <td style={themedStyles.td}>{rule.auto_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Exception Queue</h4>
              <div style={themedStyles.reconciliationList}>
                {(reconciliationWorkspaceData?.exceptions || []).slice(0, 8).map((exception) => (
                  <div key={exception.id} style={themedStyles.reconciliationItem}>
                    <div>
                      <strong>{exception.exception_type}</strong>
                      <div style={themedStyles.updateIndicator}>{exception.transaction?.description || "Bank transaction"} • {formatMoney(exception.transaction?.absolute_amount || 0)}</div>
                    </div>
                    <button type="button" onClick={() => resolveReconciliationException(exception.id)} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
              <p style={themedStyles.updateIndicator}>Use “Flag Exception” on bank items that need human follow-up.</p>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Payroll, Contractors, Time, and Mileage</h3>
              <p style={themedStyles.graphNote}>Operational workforce management with contractor tracking, time capture, mileage reimbursement, and payroll processing.</p>
            </div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}><strong>Employees</strong><div>{workforceOverviewData?.employee_count || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Contractors</strong><div>{workforceOverviewData?.contractor_count || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Hours This Month</strong><div>{workforceOverviewData?.hours_this_month || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Mileage This Month</strong><div>{workforceOverviewData?.mileage_this_month || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Payroll This Month</strong><div>{formatMoney(workforceOverviewData?.payroll_this_month || 0)}</div></div>
            <div style={themedStyles.kpiItem}><strong>1099 Exposure</strong><div>{formatMoney(workforceOverviewData?.contractor_1099_exposure || 0)}</div></div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>People Setup</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Employee name" value={employeeForm.full_name} onChange={(event) => updateEmployeeFormField("full_name", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Email" value={employeeForm.email} onChange={(event) => updateEmployeeFormField("email", event.target.value)} style={themedStyles.tableInput} />
                <select value={employeeForm.pay_type} onChange={(event) => updateEmployeeFormField("pay_type", event.target.value)} style={themedStyles.tableInput}>
                  <option value="hourly">hourly</option>
                  <option value="salary">salary</option>
                </select>
                <input type="number" step="0.01" placeholder="Hourly rate" value={employeeForm.hourly_rate} onChange={(event) => updateEmployeeFormField("hourly_rate", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Salary amount" value={employeeForm.salary_amount} onChange={(event) => updateEmployeeFormField("salary_amount", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createEmployeeRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Add Employee</button>
              </div>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Contractor name" value={contractorForm.full_name} onChange={(event) => updateContractorFormField("full_name", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Email" value={contractorForm.email} onChange={(event) => updateContractorFormField("email", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Tax ID" value={contractorForm.tax_id} onChange={(event) => updateContractorFormField("tax_id", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Default rate" value={contractorForm.default_rate} onChange={(event) => updateContractorFormField("default_rate", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createContractorRecord} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>Add Contractor</button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>People</th>
                      <th style={themedStyles.th}>Type</th>
                      <th style={themedStyles.th}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...employees.slice(0, 4).map((employee) => ({ ...employee, worker_type: "employee", display_rate: employee.pay_type === "hourly" ? employee.hourly_rate : employee.salary_amount })), ...contractors.slice(0, 4).map((contractor) => ({ ...contractor, worker_type: "contractor", display_rate: contractor.default_rate }))].map((worker) => (
                      <tr key={`${worker.worker_type}-${worker.id}`}>
                        <td style={themedStyles.td}>{worker.full_name}</td>
                        <td style={themedStyles.td}>{worker.worker_type}</td>
                        <td style={themedStyles.td}>{formatMoney(worker.display_rate || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Time, Mileage, and Payroll</h4>
              <div style={themedStyles.adminCreateGrid}>
                <select value={timeEntryForm.employee_id} onChange={(event) => updateTimeEntryFormField("employee_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Select employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
                </select>
                <select value={timeEntryForm.contractor_id} onChange={(event) => updateTimeEntryFormField("contractor_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Select contractor</option>
                  {contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.full_name}</option>)}
                </select>
                <select value={timeEntryForm.project_id} onChange={(event) => updateTimeEntryFormField("project_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Project (optional)</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.project_code}</option>)}
                </select>
                <input type="date" value={timeEntryForm.work_date} onChange={(event) => updateTimeEntryFormField("work_date", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.1" placeholder="Hours" value={timeEntryForm.hours} onChange={(event) => updateTimeEntryFormField("hours", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createTimeEntryRecord} style={themedStyles.button} disabled={!canManageFinanceOps || !hasProPlan}>Log Time</button>
              </div>
              <div style={themedStyles.adminCreateGrid}>
                <select value={mileageForm.employee_id} onChange={(event) => updateMileageFormField("employee_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Mileage employee</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
                </select>
                <select value={mileageForm.contractor_id} onChange={(event) => updateMileageFormField("contractor_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Mileage contractor</option>
                  {contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.full_name}</option>)}
                </select>
                <input type="number" step="0.1" placeholder="Miles" value={mileageForm.miles} onChange={(event) => updateMileageFormField("miles", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Rate per mile" value={mileageForm.rate_per_mile} onChange={(event) => updateMileageFormField("rate_per_mile", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createMileageRecord} style={themedStyles.secondaryActionButton} disabled={!canManageFinanceOps || !hasProPlan}>Log Mileage</button>
                <button type="button" onClick={processPayrollRun} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Process Payroll</button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Entry</th>
                      <th style={themedStyles.th}>Worker</th>
                      <th style={themedStyles.th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payrollRuns.slice(0, 3) || []).map((run) => (
                      <tr key={`payroll-${run.id}`}>
                        <td style={themedStyles.td}>{run.payroll_number}</td>
                        <td style={themedStyles.td}>Payroll Run</td>
                        <td style={themedStyles.td}>{formatMoney(run.net_cash)}</td>
                      </tr>
                    ))}
                    {(timeEntries.slice(0, 3) || []).map((entry) => (
                      <tr key={`time-${entry.id}`}>
                        <td style={themedStyles.td}>{entry.work_date}</td>
                        <td style={themedStyles.td}>{entry.worker_name}</td>
                        <td style={themedStyles.td}>{entry.hours} hrs</td>
                      </tr>
                    ))}
                    {(mileageEntries.slice(0, 2) || []).map((entry) => (
                      <tr key={`mileage-${entry.id}`}>
                        <td style={themedStyles.td}>{entry.trip_date}</td>
                        <td style={themedStyles.td}>{entry.worker_name}</td>
                        <td style={themedStyles.td}>{formatMoney(entry.reimbursement)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <div>
              <h3>Inventory, Purchasing, Projects, and Integrations</h3>
              <p style={themedStyles.graphNote}>SKU-level stock, purchase ordering, reorder signals, project/job costing, accountant toolkit, and installable/mobile-ready integration surfaces.</p>
            </div>
          </div>
          <div style={themedStyles.kpiGrid}>
            <div style={themedStyles.kpiItem}><strong>Inventory Value</strong><div>{formatMoney(inventoryWorkspace?.inventory_value || 0)}</div></div>
            <div style={themedStyles.kpiItem}><strong>Low Stock Items</strong><div>{inventoryWorkspace?.low_stock_count || 0}</div></div>
            <div style={themedStyles.kpiItem}><strong>Project Margin</strong><div>{formatMoney(projectSummaryData?.total_margin || 0)}</div></div>
            <div style={themedStyles.kpiItem}><strong>Connected Integrations</strong><div>{integrations.filter((item) => item.status === "connected").length}</div></div>
          </div>
          <div style={themedStyles.moduleGrid}>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Inventory and Purchase Orders</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="SKU" value={inventoryItemForm.sku} onChange={(event) => updateInventoryItemFormField("sku", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Name" value={inventoryItemForm.name} onChange={(event) => updateInventoryItemFormField("name", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Qty on hand" value={inventoryItemForm.quantity_on_hand} onChange={(event) => updateInventoryItemFormField("quantity_on_hand", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Reorder point" value={inventoryItemForm.reorder_point} onChange={(event) => updateInventoryItemFormField("reorder_point", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Unit cost" value={inventoryItemForm.unit_cost} onChange={(event) => updateInventoryItemFormField("unit_cost", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createInventoryItemRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Create Item</button>
              </div>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="PO vendor" value={purchaseOrderForm.vendor_name} onChange={(event) => updatePurchaseOrderFormField("vendor_name", event.target.value)} style={themedStyles.tableInput} />
                <input type="date" value={purchaseOrderForm.issue_date} onChange={(event) => updatePurchaseOrderFormField("issue_date", event.target.value)} style={themedStyles.tableInput} />
                <input type="date" value={purchaseOrderForm.expected_date} onChange={(event) => updatePurchaseOrderFormField("expected_date", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={() => addPurchaseOrderItem()} style={themedStyles.secondaryActionButton}>Add PO Line</button>
                <button type="button" onClick={createPurchaseOrderRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Create PO</button>
              </div>
              <div style={themedStyles.documentLineList}>
                {purchaseOrderForm.items.map((item, index) => (
                  <div key={`po-item-${index}`} style={themedStyles.documentLineRow}>
                    <input placeholder="SKU" value={item.sku} onChange={(event) => updatePurchaseOrderItem(index, "sku", event.target.value)} style={themedStyles.tableInput} />
                    <input type="number" step="0.01" placeholder="Qty" value={item.quantity} onChange={(event) => updatePurchaseOrderItem(index, "quantity", event.target.value)} style={themedStyles.tableInput} />
                    <input type="number" step="0.01" placeholder="Unit cost" value={item.unit_cost} onChange={(event) => updatePurchaseOrderItem(index, "unit_cost", event.target.value)} style={themedStyles.tableInput} />
                    <button type="button" onClick={() => removePurchaseOrderItem(index)} style={themedStyles.deleteButton}>Remove</button>
                  </div>
                ))}
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>PO</th>
                      <th style={themedStyles.th}>Vendor</th>
                      <th style={themedStyles.th}>Status</th>
                      <th style={themedStyles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inventoryWorkspace?.purchase_orders || []).slice(0, 6).map((po) => (
                      <tr key={po.id}>
                        <td style={themedStyles.td}>{po.po_number}</td>
                        <td style={themedStyles.td}>{po.vendor_name}</td>
                        <td style={themedStyles.td}><span style={themedStyles.statusPill}>{po.status}</span></td>
                        <td style={themedStyles.td}>
                          {po.status === "draft" ? (
                            <button type="button" onClick={() => submitPurchaseOrderRecord(po.id)} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Submit</button>
                          ) : null}
                          {po.status === "ordered" || po.status === "partial" ? (
                            <button type="button" onClick={() => receivePurchaseOrderRecord(po)} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>Receive</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Projects and Accountant Toolkit</h4>
              <div style={themedStyles.adminCreateGrid}>
                <input placeholder="Project code" value={projectForm.project_code} onChange={(event) => updateProjectFormField("project_code", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Name" value={projectForm.name} onChange={(event) => updateProjectFormField("name", event.target.value)} style={themedStyles.tableInput} />
                <input placeholder="Customer" value={projectForm.customer_name} onChange={(event) => updateProjectFormField("customer_name", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Budget revenue" value={projectForm.budget_revenue} onChange={(event) => updateProjectFormField("budget_revenue", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Budget cost" value={projectForm.budget_cost} onChange={(event) => updateProjectFormField("budget_cost", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createProjectRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Create Project</button>
              </div>
              <div style={themedStyles.adminCreateGrid}>
                <select value={projectCostForm.project_id} onChange={(event) => updateProjectCostFormField("project_id", event.target.value)} style={themedStyles.tableInput}>
                  <option value="">Select project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.project_code}</option>)}
                </select>
                <select value={projectCostForm.entry_type} onChange={(event) => updateProjectCostFormField("entry_type", event.target.value)} style={themedStyles.tableInput}>
                  <option value="cost">cost</option>
                  <option value="revenue">revenue</option>
                </select>
                <input placeholder="Description" value={projectCostForm.description} onChange={(event) => updateProjectCostFormField("description", event.target.value)} style={themedStyles.tableInput} />
                <input type="number" step="0.01" placeholder="Amount" value={projectCostForm.amount} onChange={(event) => updateProjectCostFormField("amount", event.target.value)} style={themedStyles.tableInput} />
                <button type="button" onClick={createProjectCostRecord} style={themedStyles.secondaryActionButton} disabled={!canManageFinanceOps || !hasProPlan}>Post Project Entry</button>
              </div>
              <div style={themedStyles.tableWrap}>
                <table style={themedStyles.table}>
                  <thead>
                    <tr>
                      <th style={themedStyles.th}>Project</th>
                      <th style={themedStyles.th}>Revenue</th>
                      <th style={themedStyles.th}>Cost</th>
                      <th style={themedStyles.th}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projectSummaryData?.items || []).slice(0, 8).map((project) => (
                      <tr key={project.id}>
                        <td style={themedStyles.td}>{project.project_code}</td>
                        <td style={themedStyles.td}>{formatMoney(project.actual_revenue)}</td>
                        <td style={themedStyles.td}>{formatMoney(project.actual_cost)}</td>
                        <td style={themedStyles.td}>{formatMoney(project.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={themedStyles.narrativeCard}>
                Accountant toolkit:
                {` `}Receivables {formatMoney(accountantToolkitData?.receivables || 0)},
                {` `}Payables {formatMoney(accountantToolkitData?.payables || 0)},
                {` `}Tax due {formatMoney(accountantToolkitData?.tax_due || 0)}.
              </div>
            </div>
            <div style={themedStyles.modulePanel}>
              <h4 style={themedStyles.moduleTitle}>Mobile and Integration Hub</h4>
              <p style={themedStyles.graphNote}>The app now behaves like an installable mobile workspace and keeps external systems visible in one hub.</p>
              <div style={themedStyles.adminCreateGrid}>
                <select value={integrationForm.provider} onChange={(event) => updateIntegrationFormField("provider", event.target.value)} style={themedStyles.tableInput}>
                  <option value="stripe">stripe</option>
                  <option value="google_drive">google_drive</option>
                  <option value="slack">slack</option>
                  <option value="power_bi">power_bi</option>
                  <option value="plaid">plaid</option>
                </select>
                <button type="button" onClick={connectIntegrationRecord} style={themedStyles.button} disabled={!canManagePayables || !hasProPlan}>Connect Integration</button>
              </div>
              <div style={themedStyles.reconciliationList}>
                {integrations.map((integration) => (
                  <div key={integration.id} style={themedStyles.reconciliationItem}>
                    <div>
                      <strong>{integration.provider}</strong>
                      <div style={themedStyles.updateIndicator}>{integration.category} • {integration.status}</div>
                    </div>
                    <button type="button" onClick={() => syncIntegrationRecord(integration.id)} style={themedStyles.secondaryActionButton} disabled={!canManagePayables || !hasProPlan}>
                      Sync
                    </button>
                  </div>
                ))}
              </div>
              <p style={themedStyles.updateIndicator}>Open the frontend on phone and install it from the browser menu for an app-like experience.</p>
            </div>
          </div>
        </div>

        {(currentUser?.role === "owner" || currentUser?.role === "admin") ? (
          <div style={themedStyles.card}>
            <h3>Admin Panel</h3>
            <div style={themedStyles.adminCreateGrid}>
              <input
                placeholder="New user email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                style={themedStyles.tableInput}
              />
              <input
                placeholder="Temporary password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                style={themedStyles.tableInput}
              />
              <select value={adminRole} onChange={(event) => setAdminRole(event.target.value)} style={themedStyles.tableInput}>
                <option value="admin">admin</option>
                <option value="accountant">accountant</option>
                <option value="manager">manager</option>
                <option value="cashier">cashier</option>
                <option value="member">member</option>
              </select>
              <button onClick={createAdminUser} style={themedStyles.button}>Create User</button>
            </div>
            <div style={themedStyles.tableWrap}>
              <table style={themedStyles.table}>
                <thead>
                  <tr>
                    <th style={themedStyles.th}>Email</th>
                    <th style={themedStyles.th}>Role</th>
                    <th style={themedStyles.th}>Companies</th>
                    <th style={themedStyles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user) => (
                    <tr key={user.id}>
                      <td style={themedStyles.td}>{user.email}</td>
                      <td style={themedStyles.td}>
                        <select
                          value={user.role}
                          onChange={(event) => changeAdminRole(user.id, event.target.value)}
                          style={themedStyles.tableInput}
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="accountant">accountant</option>
                          <option value="manager">manager</option>
                          <option value="cashier">cashier</option>
                          <option value="member">member</option>
                        </select>
                      </td>
                      <td style={themedStyles.td}>
                        {(user.memberships || []).map((membership) => membership.company_name).join(", ") || "No company access"}
                      </td>
                      <td style={themedStyles.td}>
                        <button onClick={() => removeAdminUser(user.id)} style={themedStyles.deleteButton}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div style={themedStyles.card}>
          <h3>Company Setup</h3>
          <div style={themedStyles.quickEntryGrid}>
            <label style={themedStyles.budgetField}>
              Active Company
              <select
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                style={themedStyles.tableInput}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={themedStyles.budgetField}>
              Business Type
              <select
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value)}
                style={themedStyles.tableInput}
              >
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={applyBusinessTemplate} style={themedStyles.button}>
              Load Inputs
            </button>
          </div>
          <p style={themedStyles.graphNote}>
            {BUSINESS_TYPE_OPTIONS.find((option) => option.value === businessType)?.description}
          </p>
          {(currentUser?.role === "owner" || currentUser?.role === "admin") ? (
            <>
              <div style={themedStyles.adminCreateGrid}>
                <input
                  placeholder="New company name"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  style={themedStyles.tableInput}
                />
                <select
                  value={newCompanyType}
                  onChange={(event) => setNewCompanyType(event.target.value)}
                  style={themedStyles.tableInput}
                >
                  {BUSINESS_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {newCompanyType === "partnership" ? (
                  <input
                    type="number"
                    min={MIN_PARTNER_COUNT}
                    max={MAX_PARTNER_COUNT}
                    value={newCompanyPartnerCount}
                    onChange={(event) => {
                      const nextCount = clampPartnerCount(event.target.value, newCompanyPartnerCount);
                      setNewCompanyPartnerCount(nextCount);
                      setNewCompanyPartnerNames((names) => createPartnerNameInputs(nextCount, names));
                    }}
                    style={themedStyles.tableInput}
                    placeholder="Partners"
                  />
                ) : null}
                <button onClick={createCompany} style={themedStyles.button}>
                  Create Company
                </button>
              </div>
              {newCompanyType === "partnership" ? (
                <div style={themedStyles.quickEntryGrid}>
                  {newCompanyPartnerNames.map((partnerName, index) => (
                    <label key={`new-company-partner-${index + 1}`} style={themedStyles.budgetField}>
                      Partner {index + 1} Name
                      <input
                        value={partnerName}
                        onChange={(event) => updateNewCompanyPartnerName(index, event.target.value)}
                        style={themedStyles.tableInput}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div style={themedStyles.card}>
          <h3>{activeLayout.layoutName}</h3>
          <p style={themedStyles.graphNote}>{activeLayout.description}</p>
          <div style={themedStyles.kpiGrid}>
            {activeLayout.sections.map((section) => (
              <div key={section} style={themedStyles.kpiItem}>
                <strong>{section}</strong>
                <div style={themedStyles.updateIndicator}>Visible for this business type only.</div>
              </div>
            ))}
          </div>
        </div>

        <div style={themedStyles.card}>
          <input
            type="file"
            accept=".csv,.txt,.json,.xls,.xlsx,.pdf,.doc,.docx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <p style={themedStyles.graphNote}>Upload external files for analytics or ledger calculations, including stacked trial balances and manufacturing schedules with particulars/subtotal layouts.</p>
          <div style={themedStyles.actionRow}>
            <button onClick={analyze} style={themedStyles.button} disabled={loading || maintenance.maintenance}>
              {loading ? "Processing..." : "Generate Report"}
            </button>
            <button
              onClick={extractForCalculation}
              style={themedStyles.button}
              disabled={extracting || maintenance.maintenance}
            >
              {extracting ? "Extracting..." : "Extract For Calculation"}
            </button>
            <button onClick={printReceipt} style={themedStyles.button}>
              Print Receipt
            </button>
          </div>
          {file ? <p style={themedStyles.updateIndicator}>Selected file: {file.name}</p> : null}
        </div>

        {stats ? (
          <div style={themedStyles.card}>
            <h3>Analytics</h3>
            <div style={themedStyles.analyticsChartWrap}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1d4e89" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        <div style={themedStyles.card}>
          <h3>Quick Accounting Entry</h3>
          <p style={themedStyles.graphNote}>
            Post common transactions like Accounts Receivable, Accounts Payable, and Purchases.
          </p>
          <div style={themedStyles.quickEntryGrid}>
            <select
              value={quickEntryId}
              onChange={(event) => setQuickEntryId(event.target.value)}
              style={themedStyles.tableInput}
            >
              {availableQuickEntries.map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quickAmount}
              onChange={(event) => setQuickAmount(event.target.value)}
              style={themedStyles.tableInput}
              placeholder="Amount"
            />
            <button onClick={applyQuickEntry} style={themedStyles.button}>Post Entry</button>
          </div>
        </div>

        <div style={themedStyles.card}>
          <div style={themedStyles.statementHeader}>
            <h3>{activeLayout.inputTitle}</h3>
            <button onClick={addLedgerRow} style={themedStyles.button}>Add Row</button>
          </div>
          <p style={themedStyles.graphNote}>{activeLayout.inputNote}</p>
          <div style={themedStyles.tableWrap}>
            <table style={themedStyles.table}>
              <thead>
                <tr>
                  <th style={themedStyles.th}>Account</th>
                  <th style={themedStyles.th}>Type</th>
                  <th style={themedStyles.th}>Class</th>
                  <th style={themedStyles.th}>Amount</th>
                  <th style={themedStyles.th}>Depreciation</th>
                  <th style={themedStyles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td style={themedStyles.td}>
                      <input
                        value={row.account}
                        onChange={(event) => updateLedgerRow(row.id, "account", event.target.value)}
                        style={themedStyles.tableInput}
                        placeholder="Account name"
                        list="account-options"
                      />
                    </td>
                    <td style={themedStyles.td}>
                      <select
                        value={row.type}
                        onChange={(event) => updateLedgerRow(row.id, "type", event.target.value)}
                        style={themedStyles.tableInput}
                      >
                        <option value="revenue">Revenue</option>
                        <option value="expense">Expense</option>
                        <option value="asset">Asset</option>
                        <option value="liability">Liability</option>
                        <option value="capital">Capital</option>
                        <option value="drawings">Drawings</option>
                      </select>
                    </td>
                    <td style={themedStyles.td}>
                      <select
                        value={row.subtype}
                        onChange={(event) => updateLedgerRow(row.id, "subtype", event.target.value)}
                        style={themedStyles.tableInput}
                      >
                        {getSubtypeOptions(row.type).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td style={themedStyles.td}>
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(event) => updateLedgerRow(row.id, "amount", event.target.value)}
                        style={themedStyles.tableInput}
                        placeholder="0.00"
                      />
                    </td>
                    <td style={themedStyles.td}>
                      {row.type === "asset" && row.subtype === "non-current" ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.depreciation || ""}
                          onChange={(event) => updateLedgerRow(row.id, "depreciation", event.target.value)}
                          style={themedStyles.tableInput}
                          placeholder="0.00"
                        />
                      ) : (
                        <span style={themedStyles.updateIndicator}>N/A</span>
                      )}
                    </td>
                    <td style={themedStyles.td}>
                      <button onClick={() => deleteLedgerRow(row.id)} style={themedStyles.deleteButton}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="account-options">
              {suggestedAccountOptions.map((account) => (
                <option key={account} value={account} />
              ))}
            </datalist>
            <datalist id="depreciable-asset-options">
              {depreciableAssetOptions.map((account) => (
                <option key={account} value={account} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={themedStyles.card}>
          <h3>Grouped Accounts</h3>
          <div style={themedStyles.kpiGrid}>
            {Object.entries(groupedLedgerRows).map(([group, items]) => (
              <div key={group} style={themedStyles.kpiItem}>
                <strong>{group}</strong>
                <div>{items.length} account(s)</div>
                <div>{formatMoney(items.reduce((sum, row) => sum + toAmount(row.amount), 0))}</div>
              </div>
            ))}
          </div>
        </div>

        {businessType === "manufacturing" ? (
          <div style={themedStyles.card}>
            <h3>Manufacturing Drivers</h3>
            <p style={themedStyles.graphNote}>
              Enter or override raw-material, overhead, and WIP values directly. Uploaded manufacturing schedules will prefill these fields automatically.
            </p>
            <div style={themedStyles.quickEntryGrid}>
              <label style={themedStyles.budgetField}>
                Opening Raw Materials
                <input type="number" step="0.01" value={manufacturingInputs.openingRawMaterials} onChange={(event) => updateManufacturingInput("openingRawMaterials", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Purchases of Raw Materials
                <input type="number" step="0.01" value={manufacturingInputs.purchases} onChange={(event) => updateManufacturingInput("purchases", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Carriage Inwards
                <input type="number" step="0.01" value={manufacturingInputs.carriageInwards} onChange={(event) => updateManufacturingInput("carriageInwards", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Returns Outwards
                <input type="number" step="0.01" value={manufacturingInputs.returnsOutwards} onChange={(event) => updateManufacturingInput("returnsOutwards", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Closing Raw Materials
                <input type="number" step="0.01" value={manufacturingInputs.closingRawMaterials} onChange={(event) => updateManufacturingInput("closingRawMaterials", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Direct Manufacturing Labor
                <input type="number" step="0.01" value={manufacturingInputs.directLabour} onChange={(event) => updateManufacturingInput("directLabour", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Factory Indirect Labor
                <input type="number" step="0.01" value={manufacturingInputs.factoryIndirectLabor} onChange={(event) => updateManufacturingInput("factoryIndirectLabor", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Factory Utilities
                <input type="number" step="0.01" value={manufacturingInputs.factoryUtilities} onChange={(event) => updateManufacturingInput("factoryUtilities", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Depreciation of Factory Equipment
                <input type="number" step="0.01" value={manufacturingInputs.depreciationFactoryEquipment} onChange={(event) => updateManufacturingInput("depreciationFactoryEquipment", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Other Factory Overheads
                <input type="number" step="0.01" value={manufacturingInputs.factoryExpenses} onChange={(event) => updateManufacturingInput("factoryExpenses", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Opening Work in Progress
                <input type="number" step="0.01" value={manufacturingInputs.openingWip} onChange={(event) => updateManufacturingInput("openingWip", event.target.value)} style={themedStyles.tableInput} />
              </label>
              <label style={themedStyles.budgetField}>
                Closing Work in Progress
                <input type="number" step="0.01" value={manufacturingInputs.closingWip} onChange={(event) => updateManufacturingInput("closingWip", event.target.value)} style={themedStyles.tableInput} />
              </label>
            </div>
          </div>
        ) : null}

        {businessType === "manufacturing" ? (
          <div style={themedStyles.card}>
            <h3>Manufacturing Account</h3>
            <p>Opening Raw Materials: {formatMoney(statement.rawMaterialsOpening)}</p>
            <p>Add: Purchases of Raw Materials: {formatMoney(statement.rawMaterialsPurchases)}</p>
            <p>Carriage Inwards: {formatMoney(statement.rawMaterialsCarriage)}</p>
            <p>Less: Returns Outwards: {formatMoney(statement.rawMaterialsReturns)}</p>
            <p>Less: Closing Raw Materials: {formatMoney(statement.rawMaterialsClosing)}</p>
            <p style={themedStyles.totalLine}>Cost of Raw Materials Consumed: {formatMoney(statement.rawMaterialsUsed)}</p>
            <p>Add: Direct Manufacturing Labor: {formatMoney(statement.directLabour)}</p>
            <p style={themedStyles.totalLine}>Prime Cost: {formatMoney(statement.primeCost)}</p>
            <hr />
            <p style={themedStyles.sectionLine}>Factory Overheads</p>
            <p>Factory Indirect Labor: {formatMoney(statement.factoryIndirectLabor)}</p>
            <p>Factory Utilities: {formatMoney(statement.factoryUtilities)}</p>
            <p>Depreciation of Factory Equipment: {formatMoney(statement.depreciationFactoryEquipment)}</p>
            <p>Other Factory Overheads: {formatMoney(statement.factoryExpenses)}</p>
            <p style={themedStyles.totalLine}>Total Factory Overheads: {formatMoney(statement.totalFactoryOverheads)}</p>
            <p style={themedStyles.totalLine}>Total Factory Cost: {formatMoney(statement.totalFactoryCost)}</p>
            <p>Add: Opening Work in Progress (WIP): {formatMoney(statement.openingWip)}</p>
            <p>Less: Closing Work in Progress (WIP): {formatMoney(statement.closingWip)}</p>
            <p style={themedStyles.totalLine}>Cost of Goods Manufactured: {formatMoney(statement.costOfGoodsManufactured)}</p>
          </div>
        ) : null}

        {businessType === "partnership" ? (
          <div style={themedStyles.card}>
            <h3>Partnership Terms and Adjustments</h3>
            <p style={themedStyles.graphNote}>
              Use this for partnership questions with profit-sharing ratios, monthly partner salaries, interest on capital, salary arrears, and depreciation on a selected fixed asset.
            </p>
            <div style={themedStyles.quickEntryGrid}>
              <label style={themedStyles.budgetField}>
                Interest on Capital % p.a.
                <input
                  type="number"
                  step="0.01"
                  value={partnershipAdjustments.interestRate}
                  onChange={(event) => updatePartnershipAdjustment("interestRate", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
              <label style={themedStyles.budgetField}>
                Interest on Drawings % p.a.
                <input
                  type="number"
                  step="0.01"
                  value={partnershipAdjustments.interestOnDrawingsRate}
                  onChange={(event) => updatePartnershipAdjustment("interestOnDrawingsRate", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
              <label style={themedStyles.budgetField}>
                Salary Arrears
                <input
                  type="number"
                  step="0.01"
                  value={partnershipAdjustments.salaryArrears}
                  onChange={(event) => updatePartnershipAdjustment("salaryArrears", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
              <label style={themedStyles.budgetField}>
                Prepaid Insurance / Expense
                <input
                  type="number"
                  step="0.01"
                  value={partnershipAdjustments.prepaidExpenseAdjustment}
                  onChange={(event) => updatePartnershipAdjustment("prepaidExpenseAdjustment", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
              <label style={themedStyles.budgetField}>
                Depreciation Rate %
                <input
                  type="number"
                  step="0.01"
                  value={partnershipAdjustments.depreciationRate}
                  onChange={(event) => updatePartnershipAdjustment("depreciationRate", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
              <label style={themedStyles.budgetField}>
                Depreciable Asset
                <input
                  list="depreciable-asset-options"
                  value={partnershipAdjustments.depreciationAsset}
                  onChange={(event) => updatePartnershipAdjustment("depreciationAsset", event.target.value)}
                  style={themedStyles.tableInput}
                />
              </label>
            </div>
            <p style={themedStyles.updateIndicator}>
              Depreciation basis: {formatMoney(statement.depreciationAdjustmentBase)} at {statement.depreciationAdjustmentRate || 0}% =
              {" "}
              {formatMoney(statement.depreciationAdjustmentAmount)}
            </p>
            <p style={themedStyles.updateIndicator}>
              Interest on drawings at {statement.interestOnDrawingsRate || 0}% = {formatMoney(statement.appropriationInterestOnDrawings)}. Prepaid expense moved to current assets: {formatMoney(statement.prepaidExpenseAdjustment)}.
            </p>
          </div>
        ) : null}

        {businessType === "partnership" ? (
          <div style={themedStyles.card}>
            <div style={themedStyles.statementHeader}>
              <h3>Partner Capital Layout</h3>
              <button onClick={addPartner} style={themedStyles.button}>Add Partner</button>
            </div>
            <p style={themedStyles.graphNote}>
              This partnership workspace now supports fixed capital, opening current accounts, ratio units, monthly partner salaries, manual overrides, and appropriation schedules.
            </p>
            <div style={themedStyles.tableWrap}>
              <table style={themedStyles.table}>
                <thead>
                  <tr>
                    <th style={themedStyles.th}>Partner</th>
                    <th style={themedStyles.th}>Fixed Capital</th>
                    <th style={themedStyles.th}>Opening Current A/C</th>
                    <th style={themedStyles.th}>Ratio Units</th>
                    <th style={themedStyles.th}>Drawings</th>
                    <th style={themedStyles.th}>Monthly Salary</th>
                    <th style={themedStyles.th}>Annual Salary Override</th>
                    <th style={themedStyles.th}>Interest Override</th>
                    <th style={themedStyles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id}>
                      <td style={themedStyles.td}>
                        <input value={partner.name} onChange={(event) => updatePartner(partner.id, "name", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.capital} onChange={(event) => updatePartner(partner.id, "capital", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.currentAccount} onChange={(event) => updatePartner(partner.id, "currentAccount", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.share} onChange={(event) => updatePartner(partner.id, "share", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.drawings} onChange={(event) => updatePartner(partner.id, "drawings", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.monthlySalary} onChange={(event) => updatePartner(partner.id, "monthlySalary", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.salary} onChange={(event) => updatePartner(partner.id, "salary", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <input type="number" step="0.01" value={partner.interestOnCapital} onChange={(event) => updatePartner(partner.id, "interestOnCapital", event.target.value)} style={themedStyles.tableInput} />
                      </td>
                      <td style={themedStyles.td}>
                        <button onClick={() => removePartner(partner.id)} style={themedStyles.deleteButton}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {businessType === "partnership" ? (
          <div style={themedStyles.card}>
            <h3>Profit and Loss Appropriation</h3>
            <p>Net Profit Before Appropriation: {formatMoney(statement.netProfitAfterTax)}</p>
            <p>Add: Interest on Drawings @ {statement.interestOnDrawingsRate || 0}%: {formatMoney(statement.appropriationInterestOnDrawings)}</p>
            <p>Interest on Capital @ {statement.partnershipInterestRate || 0}%: {formatMoney(statement.appropriationInterest)}</p>
            <p>Partner Salaries: {formatMoney(statement.appropriationSalary)}</p>
            <p style={themedStyles.totalLine}>Profit Available for Sharing: {formatMoney(statement.appropriationBase)}</p>
            {statement.partnerAppropriation.map((partner) => (
              <p key={partner.id}>
                {partner.name}: Share {formatMoney(partner.shareOfProfit)} | Interest {formatMoney(partner.interestAmount)} | Salary {formatMoney(partner.salaryAmount)} | Interest on Drawings {formatMoney(partner.interestOnDrawingsAmount)} | Closing Current A/C {formatMoney(partner.closingCurrentAccount)} | Total Equity {formatMoney(partner.totalEquity)}
              </p>
            ))}
          </div>
        ) : null}

        <div style={themedStyles.card}>
          <h3>{activeLayout.statementTitle}</h3>
          <p style={themedStyles.sectionLine}>Income</p>
          <p>Gross Sales: {formatMoney(statement.grossSales)}</p>
          <p>Less: Goods Return: {formatMoney(statement.goodsReturn)}</p>
          <p>Less: Discounts: {formatMoney(statement.discounts)}</p>
          <p>Less: Bad Debts: {formatMoney(statement.badDebts)}</p>
          <p>Less: Cost of Goods Sold (COGS): {formatMoney(statement.cogs)}</p>
          <p style={themedStyles.totalLine}>Income From Revenue: {formatMoney(statement.incomeFromRevenue)}</p>
          <hr />
          <p style={themedStyles.sectionLine}>Other Income</p>
          <p>Interest Received on Bank Accounts: {formatMoney(statement.interestReceived)}</p>
          <p>Rental Income from Properties: {formatMoney(statement.rentalIncome)}</p>
          <p>Income from Miscellaneous Sources: {formatMoney(statement.miscIncome)}</p>
          <p style={themedStyles.totalLine}>Income from Other Sources: {formatMoney(statement.incomeFromOtherSources)}</p>
          <p style={themedStyles.totalLine}>Gross Income: {formatMoney(statement.grossIncome)}</p>
          <hr />
          <p style={themedStyles.sectionLine}>Expenses</p>
          <p>Payroll Expenses: {formatMoney(statement.payrollExpenses)}</p>
          {businessType === "partnership" ? (
            <p>Included Salary Arrears Adjustment: {formatMoney(statement.salaryArrearsAdjustment)}</p>
          ) : null}
          <p>Advertising Expenses: {formatMoney(statement.advertisingExpenses)}</p>
          <p>Marketing Expenses: {formatMoney(statement.marketingExpenses)}</p>
          <p>Office Expenses: {formatMoney(statement.officeExpenses)}</p>
          <p>Utilities: {formatMoney(statement.utilitiesExpense)}</p>
          <p>License Fees: {formatMoney(statement.licenseFees)}</p>
          <p>Interest Paid on Loans: {formatMoney(statement.interestPaidOnLoans)}</p>
          <p>Insurance Premiums: {formatMoney(statement.insurancePremiums)}</p>
          <p>Other Miscellaneous Expenses: {formatMoney(statement.otherMiscExpenses)}</p>
          {businessType === "partnership" ? (
            <p>
              Depreciation on {statement.depreciationAdjustmentAsset || "selected asset"}: {formatMoney(statement.depreciationAdjustmentAmount)}
            </p>
          ) : null}
          <p style={themedStyles.totalLine}>Total Expenses: {formatMoney(statement.totalExpensesDetailed)}</p>
          <hr />
          <p style={themedStyles.totalLine}>Profit Before Taxes: {formatMoney(statement.profitBeforeTax)}</p>
          <p>Less Income Tax: {formatMoney(statement.incomeTaxExpense)}</p>
          <p style={themedStyles.totalLine}>Net Profit / Loss After Tax: {formatMoney(statement.netProfitAfterTax)}</p>
        </div>

        <div style={themedStyles.card}>
          <h3>{activeLayout.balanceTitle}</h3>
          <p style={themedStyles.sectionLine}>Assets</p>
          <p>Current Assets: {formatMoney(statement.assetsCurrent)}</p>
          {businessType === "partnership" ? (
            <p>Prepaid Expense Included in Current Assets: {formatMoney(statement.prepaidExpenseAdjustment)}</p>
          ) : null}
          <p>Non-Current Assets (Gross): {formatMoney(statement.assetsNonCurrentGross)}</p>
          <p>Less: Accumulated Depreciation: {formatMoney(statement.nonCurrentAccumulatedDepreciation)}</p>
          <p>Non-Current Assets (Net): {formatMoney(statement.assetsNonCurrent)}</p>
          <p style={themedStyles.totalLine}>Total Assets: {formatMoney(statement.totalAssets)}</p>
          <hr />
          <p style={themedStyles.sectionLine}>Liabilities and Equity</p>
          <p>Current Liabilities: {formatMoney(statement.liabilitiesCurrent)}</p>
          {businessType === "partnership" ? (
            <p>Salary Arrears Included in Current Liabilities: {formatMoney(statement.salaryArrearsAdjustment)}</p>
          ) : null}
          <p>Non-Current Liabilities: {formatMoney(statement.liabilitiesNonCurrent)}</p>
          <p>Total Liabilities: {formatMoney(statement.totalLiabilities)}</p>
          <p>Equity (Capital + Profit - Drawings): {formatMoney(statement.equity)}</p>
          <p style={themedStyles.totalLine}>Total Liabilities + Equity: {formatMoney(statement.liabilitiesAndEquity)}</p>
          <p style={Math.abs(statement.balanceDelta) < 0.01 ? styles.infoText : styles.errorText}>
            Balance Check (Assets - Liabilities & Equity): {formatMoney(statement.balanceDelta)}
          </p>
        </div>

        <div style={themedStyles.card}>
          <h3>{activeLayout.cashFlowTitle}</h3>
          <p>I. Net profit before taxation: {formatMoney(statement.profitBeforeTax)}</p>
          <p style={themedStyles.sectionLine}>II. Adjustments related to non-cash and non-operating items</p>
          <p>Add: Depreciation on Fixed Assets: {formatMoney(statement.depreciation)}</p>
          <p>Add: Interest on Borrowings: {formatMoney(statement.interestOnBorrowings)}</p>
          <p>Add: Loss on Sale of Asset: {formatMoney(statement.lossOnSale)}</p>
          <p>Less: Interest Income / Other Income: {formatMoney(statement.interestIncome)}</p>
          <p>Less: Dividend Income: {formatMoney(statement.dividendIncome)}</p>
          <p>Less: Profit on Sale of Asset: {formatMoney(statement.profitOnSale)}</p>
          <p style={themedStyles.totalLine}>
            Operating Profit before Working Capital Changes: {formatMoney(statement.operatingProfitBeforeWorkingCapital)}
          </p>
          <hr />
          <p style={themedStyles.sectionLine}>III. Adjustments related to current assets and current liabilities</p>
          <p>Add: Decrease in Current Assets: {formatMoney(statement.decreaseCurrentAssets)}</p>
          <p>Add: Increase in Current Liabilities: {formatMoney(statement.adjustedIncreaseCurrentLiabilities)}</p>
          <p>Less: Increase in Current Assets: {formatMoney(statement.increaseCurrentAssets)}</p>
          <p>Less: Decrease in Current Liabilities: {formatMoney(statement.decreaseCurrentLiabilities)}</p>
          <p style={themedStyles.totalLine}>Working Capital Adjustment: {formatMoney(statement.workingCapitalAdjustments)}</p>
          <p style={themedStyles.totalLine}>Cash generated from Operations: {formatMoney(statement.cashGeneratedFromOperations)}</p>
          <p>Less: Income taxes paid (net of refund): {formatMoney(statement.incomeTaxesPaid)}</p>
          <p style={themedStyles.totalLine}>Net Cash Inflow / (Outflow) from Operating Activities: {formatMoney(statement.netCashFromOperations)}</p>
        </div>

        <div style={themedStyles.card}>
          <h3>Financial Statement Graph</h3>
          <p style={themedStyles.graphNote}>
            Bar/Column comparison of actual results against budget by statement category.
          </p>
          <div style={themedStyles.budgetGrid}>
            <label style={themedStyles.budgetField}>
              Revenue Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.revenue}
                onChange={(event) => updateBudgetTarget("revenue", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
            <label style={themedStyles.budgetField}>
              Expense Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.expense}
                onChange={(event) => updateBudgetTarget("expense", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
            <label style={themedStyles.budgetField}>
              Asset Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.totalAssets}
                onChange={(event) => updateBudgetTarget("totalAssets", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
            <label style={themedStyles.budgetField}>
              Liability Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.totalLiabilities}
                onChange={(event) => updateBudgetTarget("totalLiabilities", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
            <label style={themedStyles.budgetField}>
              Equity Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.equity}
                onChange={(event) => updateBudgetTarget("equity", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
            <label style={themedStyles.budgetField}>
              Net Cash Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.netCashFlow}
                onChange={(event) => updateBudgetTarget("netCashFlow", event.target.value)}
                style={themedStyles.tableInput}
              />
            </label>
          </div>
          <div style={themedStyles.chartWrap}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={statementGraphData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                <Bar dataKey="actual" name="Actual" fill="#1d4ed8" />
                <Bar dataKey="budget" name="Budget" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    background: "linear-gradient(140deg, #082f49 0%, #155e75 48%, #f59e0b 100%)",
  },
  landingShell: {
    width: "100%",
    maxWidth: 1320,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    alignItems: "stretch",
  },
  landingStoryPanel: {
    background: "linear-gradient(160deg, rgba(11, 31, 58, 0.9) 0%, rgba(15, 118, 110, 0.88) 100%)",
    color: "#f8fafc",
    borderRadius: 30,
    padding: "clamp(24px, 4vw, 42px)",
    boxShadow: "0 30px 80px rgba(7, 13, 28, 0.3)",
    border: "1px solid rgba(255,255,255,0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  landingBadge: {
    alignSelf: "flex-start",
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(254, 240, 138, 0.18)",
    border: "1px solid rgba(254, 240, 138, 0.35)",
    color: "#fef08a",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  landingHeadline: {
    margin: 0,
    fontSize: "clamp(36px, 5vw, 64px)",
    lineHeight: 0.98,
    letterSpacing: -1.4,
  },
  landingLead: {
    margin: 0,
    maxWidth: 840,
    color: "rgba(248, 250, 252, 0.9)",
    fontSize: 17,
    lineHeight: 1.7,
  },
  landingAudienceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  landingAudienceCard: {
    padding: "18px 18px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.2)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  landingActionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  authSingleCard: {
    width: "100%",
    maxWidth: 380,
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: 28,
    padding: 36,
    boxShadow: "0 24px 70px rgba(7, 13, 28, 0.32)",
    border: "1px solid rgba(255, 255, 255, 0.22)",
    backdropFilter: "blur(16px)",
  },
  authTitle: {
    marginTop: 2,
    marginBottom: 24,
    textAlign: "center",
    color: "#ffffff",
    fontSize: 36,
    fontWeight: 300,
    letterSpacing: 0.6,
  },
  authInput: {
    display: "block",
    marginBottom: 18,
    padding: "12px 0",
    width: "100%",
    borderRadius: 0,
    border: "none",
    borderBottom: "2px solid rgba(255, 255, 255, 0.88)",
    background: "transparent",
    color: "#ffffff",
    fontSize: 16,
  },
  passwordWrap: {
    position: "relative",
  },
  eyeToggle: {
    position: "absolute",
    right: 0,
    top: 10,
    border: "none",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    cursor: "pointer",
    padding: 2,
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#ffffff",
    fontWeight: 500,
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
  authPrimaryButton: {
    width: "100%",
    border: "none",
    borderRadius: 10,
    background: "linear-gradient(135deg, #0f766e 0%, #155e75 100%)",
    color: "#ffffff",
    fontWeight: 700,
    padding: "12px 14px",
    cursor: "pointer",
    marginTop: 8,
    letterSpacing: 1,
  },
  authSwitchText: {
    margin: "12px 0 2px 0",
    textAlign: "center",
    color: "#ffffff",
    fontSize: 14,
  },
  authDivider: {
    marginTop: 12,
    marginBottom: 10,
    textAlign: "center",
    color: "#8b95a3",
    fontSize: 12,
    fontWeight: 600,
  },
  inlineLink: {
    border: "none",
    background: "transparent",
    color: "#ffffff",
    cursor: "pointer",
    padding: 0,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "underline",
  },
  themeToggle: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: 6,
    background: "transparent",
    color: "#ffffff",
    fontWeight: 600,
    padding: "8px 10px",
    marginBottom: 18,
    cursor: "pointer",
  },
  authOptions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
    color: "#ffffff",
    fontSize: 12,
  },
  rememberWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#ffffff",
  },
  layout: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "\"IBM Plex Sans\", \"Trebuchet MS\", sans-serif",
    background: "#f4f9ff",
  },
  sidebar: {
    width: "clamp(220px, 22vw, 280px)",
    background: "#0b1f3a",
    color: "#ffffff",
    padding: 20,
  },
  main: {
    flex: 1,
    width: "100%",
    padding: "clamp(16px, 3vw, 32px)",
    background: "radial-gradient(circle at top, #f8fafc 0%, #e0f2fe 45%, #f8fafc 100%)",
  },
  card: {
    background: "#ffffff",
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
  },
  heroCard: {
    background: "linear-gradient(145deg, #0f172a 0%, #0f766e 48%, #99f6e4 120%)",
    color: "#f8fafc",
    padding: 24,
    borderRadius: 24,
    marginBottom: 16,
    boxShadow: "0 22px 60px rgba(15, 23, 42, 0.22)",
  },
  heroHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontSize: 12,
    opacity: 0.78,
  },
  heroTitle: {
    margin: "6px 0 10px",
    fontSize: "clamp(28px, 4vw, 44px)",
    lineHeight: 1.06,
    maxWidth: 760,
  },
  heroAccent: {
    color: "#fef08a",
  },
  heroSubtitle: {
    margin: 0,
    maxWidth: 720,
    color: "rgba(248, 250, 252, 0.85)",
    fontSize: 15,
    lineHeight: 1.6,
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  secondaryActionButton: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid rgba(15, 118, 110, 0.2)",
    background: "rgba(255, 255, 255, 0.86)",
    color: "#0f172a",
    fontWeight: 700,
    cursor: "pointer",
  },
  heroMetricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  heroMetricCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "16px 18px",
    borderRadius: 18,
    background: "rgba(255, 255, 255, 0.12)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
  },
  metricLabel: {
    color: "inherit",
    opacity: 0.72,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  metricValue: {
    fontSize: 26,
    lineHeight: 1,
  },
  metricHelper: {
    color: "inherit",
    opacity: 0.78,
    fontSize: 12,
  },
  chartWrap: {
    width: "100%",
    minHeight: 300,
  },
  analyticsChartWrap: {
    width: "100%",
    maxWidth: 420,
    minHeight: 200,
  },
  input: {
    display: "block",
    marginBottom: 10,
    padding: 10,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #9fd3ff",
  },
  button: {
    padding: "10px 20px",
    background: "linear-gradient(135deg, #0f766e 0%, #0b1f3a 100%)",
    color: "white",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    marginTop: 8,
    fontWeight: 700,
  },
  secondaryButton: {
    padding: "10px 16px",
    marginTop: 16,
    border: "1px solid #9fd3ff",
    background: "transparent",
    color: "#ffffff",
    borderRadius: 8,
    cursor: "pointer",
  },
  sidebarMeta: {
    margin: "4px 0",
    color: "#bfdbfe",
    fontSize: 12,
  },
  liveUserCard: {
    background: "linear-gradient(135deg, #0b1f3a 0%, #1d4e89 55%, #60a5fa 100%)",
    color: "white",
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: "0 4px 10px rgba(11, 31, 58, 0.2)",
    maxWidth: 260,
  },
  userCountDisplay: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  userCountNumber: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Consolas, monospace",
  },
  pulse: {
    color: "#dbeafe",
    fontSize: 10,
    animation: "pulse 1.5s infinite",
  },
  updateIndicator: {
    fontSize: 10,
    opacity: 0.9,
    margin: 0,
  },
  errorText: {
    margin: 0,
    color: "#9b2226",
    fontWeight: 600,
  },
  warningText: {
    margin: "0 0 10px 0",
    color: "#9a3412",
    background: "#fff7ed",
    border: "1px solid #fdba74",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 700,
  },
  infoText: {
    margin: 0,
    color: "#1d4e89",
    fontWeight: 600,
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 920,
  },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #dbeafe",
    color: "#0b1f3a",
  },
  td: {
    padding: 8,
    borderBottom: "1px solid #eff6ff",
  },
  tableInput: {
    width: "100%",
    padding: 8,
    borderRadius: 6,
    border: "1px solid #bfdbfe",
    background: "#f8fbff",
  },
  deleteButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#9b2226",
    cursor: "pointer",
  },
  statementHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },
  totalLine: {
    fontWeight: 700,
    color: "#0b1f3a",
  },
  scoreBadge: {
    minWidth: 88,
    textAlign: "center",
    padding: "14px 18px",
    borderRadius: 18,
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: 800,
  },
  sectionLine: {
    fontWeight: 700,
    color: "#1d4e89",
    marginTop: 4,
    marginBottom: 6,
  },
  graphNote: {
    marginTop: 0,
    marginBottom: 12,
    color: "#1d4e89",
    fontSize: 13,
  },
  budgetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  budgetField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "#1d4e89",
    fontSize: 12,
    fontWeight: 600,
  },
  quickEntryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    alignItems: "center",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  pricingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginTop: 14,
  },
  pricingCard: {
    background: "#f8fbff",
    border: "1px solid #dbeafe",
    borderRadius: 20,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  pricingHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  pricingAmount: {
    fontSize: 30,
    fontWeight: 800,
    color: "#0b1f3a",
    lineHeight: 1,
  },
  pricingAmountSubtle: {
    fontSize: 13,
    color: "#1d4e89",
    fontWeight: 700,
  },
  landingFeatureList: {
    margin: 0,
    paddingLeft: 18,
    display: "grid",
    gap: 6,
    color: "inherit",
  },
  kpiItem: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 600,
    color: "#0b1f3a",
  },
  adminCreateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  activityList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 8,
  },
  activityItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid #dbeafe",
    paddingBottom: 8,
  },
  activityTime: {
    color: "#1d4e89",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  moduleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  modulePanel: {
    background: "#f8fbff",
    border: "1px solid #dbeafe",
    borderRadius: 18,
    padding: 18,
  },
  moduleTitle: {
    marginTop: 0,
    marginBottom: 12,
    color: "#0b1f3a",
    fontSize: 18,
  },
  documentLineList: {
    display: "grid",
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  integrationBanner: {
    background: "#ecfeff",
    border: "1px solid #99f6e4",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  connectionList: {
    display: "grid",
    gap: 10,
    marginBottom: 12,
  },
  connectionCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
  },
  documentLineRow: {
    display: "grid",
    gridTemplateColumns: "2fr repeat(2, minmax(90px, 1fr)) auto",
    gap: 10,
    alignItems: "center",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4e89",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "capitalize",
  },
  reconciliationList: {
    display: "grid",
    gap: 12,
  },
  reconciliationItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
  },
  alertGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  alertCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 18,
    borderRadius: 18,
    border: "1px solid transparent",
  },
  alertCritical: {
    background: "#fff1f2",
    borderColor: "#fecdd3",
    color: "#881337",
  },
  alertWarning: {
    background: "#fff7ed",
    borderColor: "#fdba74",
    color: "#9a3412",
  },
  alertPositive: {
    background: "#ecfeff",
    borderColor: "#99f6e4",
    color: "#0f766e",
  },
  alertPill: {
    alignSelf: "flex-start",
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
  },
  alertText: {
    margin: 0,
    lineHeight: 1.55,
  },
  alertAction: {
    margin: 0,
    fontWeight: 700,
  },
  signalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 12,
  },
  signalCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 16,
    borderRadius: 18,
    border: "1px solid transparent",
  },
  signalPositive: {
    background: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  signalWarning: {
    background: "#fffbeb",
    borderColor: "#fcd34d",
  },
  signalCritical: {
    background: "#fff1f2",
    borderColor: "#fecdd3",
  },
  presetRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  presetButton: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid #99f6e4",
    background: "#f0fdfa",
    color: "#115e59",
    cursor: "pointer",
    fontWeight: 700,
  },
  narrativeCard: {
    padding: "18px 20px",
    borderRadius: 18,
    background: "linear-gradient(135deg, #f8fafc 0%, #dcfce7 100%)",
    border: "1px solid #bbf7d0",
    color: "#14532d",
    fontSize: 15,
    lineHeight: 1.75,
    marginBottom: 10,
  },
};

