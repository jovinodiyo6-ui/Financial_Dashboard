import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const API_URL = (import.meta.env.VITE_API_URL || "/api").trim();
const TOKEN_KEY = "financepro_token";
const LAST_EMAIL_KEY = "financepro_last_email";
const THEME_KEY = "financepro_theme";
const BUSINESS_TYPE_KEY = "financepro_business_type";

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

const BUSINESS_TYPE_OPTIONS = [
  {
    value: "sole_proprietor",
    label: "Sole Proprietorship",
    description: "Trading account, profit and loss, and balance sheet for a single owner.",
  },
  {
    value: "partnership",
    label: "Partnership",
    description: "Adds appropriation and partner capital schedules on top of standard statements.",
  },
  {
    value: "manufacturing",
    label: "Manufacturing Company",
    description: "Adds a manufacturing account and cost of production before trading profit.",
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
  { account: "Prepaid Expenses", type: "asset", subtype: "current" },
  { account: "Accrued Expenses", type: "liability", subtype: "current" },
  { account: "Land and Buildings", type: "asset", subtype: "non-current" },
  { account: "Machinery and Equipment", type: "asset", subtype: "non-current" },
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
  { account: "Sales Returns", type: "expense", subtype: "operating" },
  { account: "Goods Return", type: "expense", subtype: "operating" },
  { account: "Discounts", type: "expense", subtype: "operating" },
  { account: "Bad Debts", type: "expense", subtype: "operating" },
  { account: "Sales Revenue", type: "revenue", subtype: "operating" },
  { account: "Service Revenue", type: "revenue", subtype: "operating" },
  { account: "Purchases", type: "expense", subtype: "operating" },
  { account: "Returns Outwards", type: "expense", subtype: "operating" },
  { account: "Carriage Inwards", type: "expense", subtype: "operating" },
  { account: "Direct Labour", type: "expense", subtype: "operating" },
  { account: "Factory Expenses", type: "expense", subtype: "operating" },
  { account: "Factory Overheads", type: "expense", subtype: "operating" },
  { account: "Partner Salary", type: "expense", subtype: "operating" },
  { account: "Interest on Capital", type: "expense", subtype: "operating" },
  { account: "Cost of Goods Sold", type: "expense", subtype: "operating" },
  { account: "Interest Received", type: "revenue", subtype: "other" },
  { account: "Rental Income", type: "revenue", subtype: "other" },
  { account: "Miscellaneous Income", type: "revenue", subtype: "other" },
  { account: "Payroll Expenses", type: "expense", subtype: "operating" },
  { account: "Advertising Expenses", type: "expense", subtype: "operating" },
  { account: "Marketing Expenses", type: "expense", subtype: "operating" },
  { account: "Office Expenses", type: "expense", subtype: "operating" },
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
    { account: "Direct Labour", type: "expense", subtype: "operating" },
    { account: "Factory Expenses", type: "expense", subtype: "operating" },
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

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

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
  factoryExpenses: "",
};

const INITIAL_PARTNERS = [
  { id: 1, name: "Partner A", capital: "", share: "50", drawings: "", interestOnCapital: "", salary: "" },
  { id: 2, name: "Partner B", capital: "", share: "50", drawings: "", interestOnCapital: "", salary: "" },
];

const getAccountGroupLabel = (row) => {
  if (row.type === "asset") {
    return row.subtype === "non-current" ? "Non-Current Assets" : "Current Assets";
  }
  if (row.type === "liability") {
    return row.subtype === "non-current" ? "Non-Current Liabilities" : "Current Liabilities";
  }
  if (row.type === "expense") {
    if (["Direct Labour", "Factory Expenses", "Factory Overheads", "Raw Materials Opening Stock", "Closing Raw Materials"].includes(row.account)) {
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

export default function App() {
  const [token, setToken] = useState(() => readStoredToken());
  const [email, setEmail] = useState(() => readStoredEmail());
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
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

  const [file, setFile] = useState(null);
  const [stats, setStats] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [userCountUpdating, setUserCountUpdating] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState("cashier");
  const [maintenance, setMaintenance] = useState({
    maintenance: false,
    message: "[System Under Maintainance]",
  });
  const [extracting, setExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [ledgerRows, setLedgerRows] = useState(INITIAL_LEDGER_ROWS);
  const [budgetTargets, setBudgetTargets] = useState(INITIAL_BUDGET_TARGETS);
  const [manufacturingInputs, setManufacturingInputs] = useState(INITIAL_MANUFACTURING_INPUTS);
  const [partners, setPartners] = useState(INITIAL_PARTNERS);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickEntryId, setQuickEntryId] = useState("invoice-on-credit");
  const isDarkMode = themeMode === "dark";

  const availableQuickEntries = useMemo(
    () => QUICK_ENTRY_TEMPLATES.filter((template) => template.businessTypes.includes(businessType)),
    [businessType],
  );

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
      const key = (row.account || "").trim().toLowerCase();
      if (!key) {
        return acc;
      }
      acc[key] = (acc[key] || 0) + toAmount(row.amount);
      return acc;
    }, {});

    const amountByAccount = (...names) =>
      names.reduce((sum, name) => sum + (accountTotals[name.toLowerCase()] || 0), 0);

    const grossSales = amountByAccount("Gross Sales", "Sales Revenue");
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
    const directLabour = toAmount(manufacturingInputs.directLabour) || amountByAccount("Direct Labour");
    const factoryExpenses =
      toAmount(manufacturingInputs.factoryExpenses) || amountByAccount("Factory Expenses", "Factory Overheads");
    const rawMaterialsAvailable = rawMaterialsOpening + rawMaterialsPurchases + rawMaterialsCarriage - rawMaterialsReturns;
    const rawMaterialsUsed = rawMaterialsAvailable - rawMaterialsClosing;
    const costOfProduction = rawMaterialsUsed + directLabour + factoryExpenses;

    const costOfGoodsAvailable =
      openingStock +
      (purchases - returnsOutwards + carriageInwardsLedger) +
      (businessType === "manufacturing" ? costOfProduction : 0);
    const cogs = costOfGoodsAvailable - closingStock;
    const grossProfit = netSales - cogs;
    const incomeFromRevenue = netSales - cogs;

    const interestReceived = amountByAccount("Interest Received");
    const rentalIncome = amountByAccount("Rental Income");
    const miscIncome = amountByAccount("Miscellaneous Income");
    const incomeFromOtherSources = interestReceived + rentalIncome + miscIncome;
    const grossIncome = incomeFromRevenue + incomeFromOtherSources;

    const payrollExpenses = amountByAccount("Payroll Expenses");
    const advertisingExpenses = amountByAccount("Advertising Expenses");
    const marketingExpenses = amountByAccount("Marketing Expenses");
    const officeExpenses = amountByAccount("Office Expenses");
    const rentExpense = amountByAccount("Rent Expense");
    const utilitiesExpense = amountByAccount("Utilities Expense");
    const licenseFees = amountByAccount("License Fees");
    const interestPaidOnLoans = amountByAccount("Interest Paid on Loans");
    const insurancePremiums = amountByAccount("Insurance Premiums");
    const otherMiscExpenses = amountByAccount("Other Miscellaneous Expenses");
    const depreciation = amountByAccount("Depreciation Expense");
    const lossOnSale = amountByAccount("Loss on Sale of Asset");
    const totalExpensesDetailed =
      payrollExpenses +
      advertisingExpenses +
      marketingExpenses +
      officeExpenses +
      rentExpense +
      utilitiesExpense +
      licenseFees +
      interestPaidOnLoans +
      insurancePremiums +
      otherMiscExpenses +
      depreciation +
      lossOnSale +
      badDebts;

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
    const workingCapitalAdjustments =
      decreaseCurrentAssets +
      increaseCurrentLiabilities -
      increaseCurrentAssets -
      decreaseCurrentLiabilities;

    const cashGeneratedFromOperations = operatingProfitBeforeWorkingCapital + workingCapitalAdjustments;
    const incomeTaxesPaid = amountByAccount("Income Taxes Paid");
    const netCashFromOperations = cashGeneratedFromOperations - incomeTaxesPaid;

    const appropriationInterest = partners.reduce((sum, partner) => sum + toAmount(partner.interestOnCapital), 0);
    const appropriationSalary = partners.reduce((sum, partner) => sum + toAmount(partner.salary), 0);
    const appropriationBase = netProfitAfterTax - appropriationInterest - appropriationSalary;
    const totalPartnerRatio = partners.reduce((sum, partner) => sum + Math.max(0, toAmount(partner.share)), 0) || 1;
    const partnerAppropriation = partners.map((partner) => {
      const ratio = Math.max(0, toAmount(partner.share));
      const shareOfProfit = appropriationBase * (ratio / totalPartnerRatio);
      const closingCapital =
        toAmount(partner.capital) +
        toAmount(partner.interestOnCapital) +
        toAmount(partner.salary) +
        shareOfProfit -
        toAmount(partner.drawings);
      return {
        ...partner,
        shareOfProfit,
        closingCapital,
      };
    });

    const partnershipCapital = partnerAppropriation.reduce((sum, partner) => sum + partner.closingCapital, 0);
    const equity =
      businessType === "partnership" ? partnershipCapital : totals.capital + netProfitAfterTax - totals.drawings;
    const totalAssets = totals.assetsCurrent + totals.assetsNonCurrent;
    const totalLiabilities = totals.liabilitiesCurrent + totals.liabilitiesNonCurrent;
    const liabilitiesAndEquity = totalLiabilities + equity;
    const operatingCashInflows = netSales + incomeFromOtherSources;
    const operatingCashOutflows = totalExpensesDetailed + incomeTaxExpense;
    const netOperatingCashFlow = operatingCashInflows - operatingCashOutflows;
    const investingCashOutflows = totals.assetsNonCurrent;
    const financingInflows = businessType === "partnership" ? partnershipCapital : totals.capital;
    const financingOutflows =
      businessType === "partnership"
        ? partners.reduce((sum, partner) => sum + toAmount(partner.drawings), 0)
        : totals.drawings;
    const netCashFlow = netOperatingCashFlow - investingCashOutflows + financingInflows - financingOutflows;

    return {
      ...totals,
      businessType,
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
      factoryExpenses,
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
      officeExpenses,
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
      increaseCurrentAssets,
      increaseCurrentLiabilities,
      decreaseCurrentLiabilities,
      workingCapitalAdjustments,
      cashGeneratedFromOperations,
      incomeTaxesPaid,
      netCashFromOperations,
      appropriationInterest,
      appropriationSalary,
      appropriationBase,
      partnerAppropriation,
    };
  }, [ledgerRows, businessType, manufacturingInputs, partners]);

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

  const authorizedFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.error || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return payload;
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

      const data = await response.json();
      if (!response.ok || !data.token) {
        throw new Error(data.error || "Login failed");
      }

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

      const data = await response.json();
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
      setAuthMode("login");
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
    setStats(null);
    setDashboardStats(null);
    setUserCount(0);
    setCurrentUser(null);
    setAdminUsers([]);
    setFile(null);
    setInfoMessage("Signed out.");
  };

  const loadStats = async () => {
    const data = await authorizedFetch("/analytics");
    setStats(data);
  };

  const loadDashboardStats = async () => {
    const path = selectedCompanyId ? `/dashboard?company_id=${selectedCompanyId}` : "/dashboard";
    const data = await authorizedFetch(path);
    setDashboardStats(data);
  };

  const loadCurrentUser = async () => {
    const data = await authorizedFetch("/me");
    setCurrentUser(data);
    return data;
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
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || "Failed to read system status");
    }

    setMaintenance({
      maintenance: Boolean(payload.maintenance),
      message: payload.message || "[System Under Maintainance]",
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

      setLedgerRows(
        data.ledger_rows.map((row, index) => ({
          id: index + 1,
          account: row.account || "",
          type: row.type || "expense",
          subtype: row.subtype || "operating",
          amount: row.amount ?? "",
          depreciation: row.depreciation ?? "",
        })),
      );
      setInfoMessage(`Extracted ${data.ledger_rows.length} row(s) for calculations.`);
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
    setLedgerRows(BUSINESS_TEMPLATE_ROWS[businessType].map((row) => ({ ...row })));
    setInfoMessage("Business-specific input template loaded.");
    setErrorMessage("");
  };

  const updateManufacturingInput = (key, value) => {
    setManufacturingInputs((current) => ({ ...current, [key]: value }));
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
        { id: nextId, name: `Partner ${String.fromCharCode(64 + nextId)}`, capital: "", share: "", drawings: "", interestOnCapital: "", salary: "" },
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

  const createCompany = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!newCompanyName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }

    try {
      const company = await authorizedFetch("/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompanyName.trim(),
          business_type: newCompanyType,
        }),
      });
      setNewCompanyName("");
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

  useEffect(() => {
    let active = true;

    const checkSystemStatus = async () => {
      try {
        await loadSystemStatus();
      } catch {
        if (active) {
          setMaintenance({ maintenance: false, message: "[System Under Maintainance]" });
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
    };
  }, [isDarkMode]);

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
          loadDashboardStats(),
          loadLiveUserCount(),
          loadRecentActivity(),
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
    if (!selectedCompanyId || !companies.length) {
      return;
    }

    const selectedCompany = companies.find((company) => String(company.id) === String(selectedCompanyId));
    if (!selectedCompany) {
      return;
    }

    setBusinessType(selectedCompany.business_type || "sole_proprietor");
    loadDashboardStats();
  }, [selectedCompanyId, companies]);

  if (!token) {
    return (
      <div style={themedStyles.center}>
        <div style={themedStyles.authSingleCard}>
          <h2 style={themedStyles.authTitle}>{authMode === "login" ? "Login" : "Signup"}</h2>
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
                  onClick={() => setInfoMessage("Password reset flow can be added next.")}
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
                  onClick={() => {
                    setAuthMode("signup");
                    setErrorMessage("");
                    setInfoMessage("");
                  }}
                >
                  Signup
                </button>
              </p>
            </>
          ) : (
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
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMessage("");
                    setInfoMessage("");
                  }}
                >
                  Login
                </button>
              </p>
            </>
          )}
        </div>

        {maintenance.maintenance ? <p style={themedStyles.warningText}>{maintenance.message}</p> : null}
        {errorMessage ? <p style={themedStyles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={themedStyles.infoText}>{infoMessage}</p> : null}
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
        <p>Dashboard</p>
        <p>Reports</p>
        <p>Statements</p>
        {(currentUser?.role === "owner" || currentUser?.role === "admin") ? <p>Admin Panel</p> : null}
        <button onClick={toggleTheme} style={themedStyles.secondaryButton}>
          {isDarkMode ? "Light Mode" : "Dark Mode"}
        </button>
        <button onClick={logout} style={themedStyles.secondaryButton}>Logout</button>
      </div>

      <div style={themedStyles.main} className="main">
        <h1>Executive Dashboard</h1>

        {maintenance.maintenance ? <p style={themedStyles.warningText}>{maintenance.message}</p> : null}
        {errorMessage ? <p style={themedStyles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={themedStyles.infoText}>{infoMessage}</p> : null}

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
              <button onClick={createCompany} style={themedStyles.button}>
                Create Company
              </button>
            </div>
          ) : null}
        </div>

        <div style={themedStyles.card}>
          <input
            type="file"
            accept=".csv,.txt,.json,.xls,.xlsx,.pdf,.doc,.docx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <p style={themedStyles.graphNote}>Upload external files for analytics or ledger calculations.</p>
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
            <h3>Financial Input Sheet</h3>
            <button onClick={addLedgerRow} style={themedStyles.button}>Add Row</button>
          </div>
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
              {ACCOUNT_CATALOG.map((option) => (
                <option key={option.account} value={option.account} />
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
            <h3>Manufacturing Account</h3>
            <p>Opening Raw Materials: {formatMoney(statement.rawMaterialsOpening)}</p>
            <p>Purchases: {formatMoney(statement.rawMaterialsPurchases)}</p>
            <p>Carriage Inwards: {formatMoney(statement.rawMaterialsCarriage)}</p>
            <p>Returns Outwards: {formatMoney(statement.rawMaterialsReturns)}</p>
            <p>Closing Raw Materials: {formatMoney(statement.rawMaterialsClosing)}</p>
            <p>Raw Materials Used: {formatMoney(statement.rawMaterialsUsed)}</p>
            <p>Direct Labour: {formatMoney(statement.directLabour)}</p>
            <p>Factory Expenses: {formatMoney(statement.factoryExpenses)}</p>
            <p style={themedStyles.totalLine}>Cost of Production: {formatMoney(statement.costOfProduction)}</p>
          </div>
        ) : null}

        {businessType === "partnership" ? (
          <div style={themedStyles.card}>
            <h3>Profit and Loss Appropriation</h3>
            <p>Net Profit: {formatMoney(statement.netProfitAfterTax)}</p>
            <p>Interest on Capital: {formatMoney(statement.appropriationInterest)}</p>
            <p>Partner Salaries: {formatMoney(statement.appropriationSalary)}</p>
            <p style={themedStyles.totalLine}>Profit Available for Sharing: {formatMoney(statement.appropriationBase)}</p>
            {statement.partnerAppropriation.map((partner) => (
              <p key={partner.id}>
                {partner.name}: {formatMoney(partner.shareOfProfit)}
              </p>
            ))}
          </div>
        ) : null}

        <div style={themedStyles.card}>
          <h3>Profit and Loss Statement</h3>
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
          <p>Advertising Expenses: {formatMoney(statement.advertisingExpenses)}</p>
          <p>Marketing Expenses: {formatMoney(statement.marketingExpenses)}</p>
          <p>Office Expenses: {formatMoney(statement.officeExpenses)}</p>
          <p>Utilities: {formatMoney(statement.utilitiesExpense)}</p>
          <p>License Fees: {formatMoney(statement.licenseFees)}</p>
          <p>Interest Paid on Loans: {formatMoney(statement.interestPaidOnLoans)}</p>
          <p>Insurance Premiums: {formatMoney(statement.insurancePremiums)}</p>
          <p>Other Miscellaneous Expenses: {formatMoney(statement.otherMiscExpenses)}</p>
          <p style={themedStyles.totalLine}>Total Expenses: {formatMoney(statement.totalExpensesDetailed)}</p>
          <hr />
          <p style={themedStyles.totalLine}>Profit Before Taxes: {formatMoney(statement.profitBeforeTax)}</p>
          <p>Less Income Tax: {formatMoney(statement.incomeTaxExpense)}</p>
          <p style={themedStyles.totalLine}>Net Profit / Loss After Tax: {formatMoney(statement.netProfitAfterTax)}</p>
        </div>

        <div style={themedStyles.card}>
          <h3>Balance Sheet</h3>
          <p style={themedStyles.sectionLine}>Assets</p>
          <p>Current Assets: {formatMoney(statement.assetsCurrent)}</p>
          <p>Non-Current Assets (Gross): {formatMoney(statement.assetsNonCurrentGross)}</p>
          <p>Less: Accumulated Depreciation: {formatMoney(statement.nonCurrentAccumulatedDepreciation)}</p>
          <p>Non-Current Assets (Net): {formatMoney(statement.assetsNonCurrent)}</p>
          <p style={themedStyles.totalLine}>Total Assets: {formatMoney(statement.totalAssets)}</p>
          <hr />
          <p style={themedStyles.sectionLine}>Liabilities and Equity</p>
          <p>Current Liabilities: {formatMoney(statement.liabilitiesCurrent)}</p>
          <p>Non-Current Liabilities: {formatMoney(statement.liabilitiesNonCurrent)}</p>
          <p>Total Liabilities: {formatMoney(statement.totalLiabilities)}</p>
          <p>Equity (Capital + Profit - Drawings): {formatMoney(statement.equity)}</p>
          <p style={themedStyles.totalLine}>Total Liabilities + Equity: {formatMoney(statement.liabilitiesAndEquity)}</p>
          <p style={Math.abs(statement.balanceDelta) < 0.01 ? styles.infoText : styles.errorText}>
            Balance Check (Assets - Liabilities & Equity): {formatMoney(statement.balanceDelta)}
          </p>
        </div>

        <div style={themedStyles.card}>
          <h3>Statement of Cash Flows (Operating Activities)</h3>
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
          <p>Add: Increase in Current Liabilities: {formatMoney(statement.increaseCurrentLiabilities)}</p>
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
    background: "linear-gradient(135deg, #c59ad9 0%, #9ad3d6 100%)",
  },
  authSingleCard: {
    width: "100%",
    maxWidth: 380,
    background: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    padding: 36,
    boxShadow: "0 22px 60px rgba(33, 43, 74, 0.18)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
    backdropFilter: "blur(12px)",
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
    borderRadius: 6,
    background: "#3c5a80",
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
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
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
    background: "#eaf4ff",
  },
  card: {
    background: "#ffffff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
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
    background: "#0b1f3a",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 8,
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
};

