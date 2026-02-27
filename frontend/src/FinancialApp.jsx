import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const API_URL = (import.meta.env.VITE_API_URL || "/api").trim();
const TOKEN_KEY = "financepro_token";
const LAST_EMAIL_KEY = "financepro_last_email";
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

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

const ACCOUNT_CATALOG = [
  { account: "Cash", type: "asset", subtype: "current" },
  { account: "Cash and Cash Equivalents", type: "asset", subtype: "current" },
  { account: "Accounts Receivable", type: "asset", subtype: "current" },
  { account: "Inventory", type: "asset", subtype: "current" },
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
  { account: "Goods Return", type: "expense", subtype: "operating" },
  { account: "Discounts", type: "expense", subtype: "operating" },
  { account: "Bad Debts", type: "expense", subtype: "operating" },
  { account: "Sales Revenue", type: "revenue", subtype: "operating" },
  { account: "Service Revenue", type: "revenue", subtype: "operating" },
  { account: "Purchases", type: "expense", subtype: "operating" },
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

const QUICK_ENTRY_TEMPLATES = [
  {
    id: "invoice-on-credit",
    label: "Invoice Customer (A/R)",
    entries: [
      { account: "Accounts Receivable", type: "asset", subtype: "current" },
      { account: "Sales Revenue", type: "revenue", subtype: "operating" },
    ],
  },
  {
    id: "receive-from-customer",
    label: "Receive Payment (A/R)",
    entries: [
      { account: "Cash", type: "asset", subtype: "current" },
      { account: "Accounts Receivable", type: "asset", subtype: "current" },
    ],
  },
  {
    id: "purchase-on-credit",
    label: "Purchase On Credit (A/P)",
    entries: [
      { account: "Purchases", type: "expense", subtype: "operating" },
      { account: "Accounts Payable", type: "liability", subtype: "current" },
    ],
  },
  {
    id: "pay-supplier",
    label: "Pay Supplier (A/P)",
    entries: [
      { account: "Accounts Payable", type: "liability", subtype: "current" },
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
  const googleButtonRef = useRef(null);

  const [file, setFile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [userCountUpdating, setUserCountUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [ledgerRows, setLedgerRows] = useState(INITIAL_LEDGER_ROWS);
  const [budgetTargets, setBudgetTargets] = useState(INITIAL_BUDGET_TARGETS);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickEntryId, setQuickEntryId] = useState(QUICK_ENTRY_TEMPLATES[0].id);

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
      expense: 0,
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
        totals.expense += amount;
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

    const profit = totals.revenue - totals.expense;
    const equity = totals.capital + profit - totals.drawings;
    const totalAssets = totals.assetsCurrent + totals.assetsNonCurrent;
    const totalLiabilities = totals.liabilitiesCurrent + totals.liabilitiesNonCurrent;
    const liabilitiesAndEquity = totalLiabilities + equity;

    const operatingCashInflows = totals.revenue;
    const operatingCashOutflows = totals.expense;
    const netOperatingCashFlow = operatingCashInflows - operatingCashOutflows;
    const investingCashOutflows = totals.assetsNonCurrent;
    const financingInflows = totals.capital;
    const financingOutflows = totals.drawings;
    const netCashFlow = netOperatingCashFlow - investingCashOutflows + financingInflows - financingOutflows;

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

    const grossSales = amountByAccount("Gross Sales");
    const goodsReturn = amountByAccount("Goods Return");
    const discounts = amountByAccount("Discounts");
    const badDebts = amountByAccount("Bad Debts");
    const cogs = amountByAccount("Cost of Goods Sold");
    const incomeFromRevenue = grossSales - goodsReturn - discounts - badDebts - cogs;

    const interestReceived = amountByAccount("Interest Received");
    const rentalIncome = amountByAccount("Rental Income");
    const miscIncome = amountByAccount("Miscellaneous Income");
    const incomeFromOtherSources = interestReceived + rentalIncome + miscIncome;
    const grossIncome = incomeFromRevenue + incomeFromOtherSources;

    const payrollExpenses = amountByAccount("Payroll Expenses");
    const advertisingExpenses = amountByAccount("Advertising Expenses");
    const marketingExpenses = amountByAccount("Marketing Expenses");
    const officeExpenses = amountByAccount("Office Expenses");
    const utilitiesExpense = amountByAccount("Utilities Expense");
    const licenseFees = amountByAccount("License Fees");
    const interestPaidOnLoans = amountByAccount("Interest Paid on Loans");
    const insurancePremiums = amountByAccount("Insurance Premiums");
    const otherMiscExpenses = amountByAccount("Other Miscellaneous Expenses");
    const totalExpensesDetailed =
      payrollExpenses +
      advertisingExpenses +
      marketingExpenses +
      officeExpenses +
      utilitiesExpense +
      licenseFees +
      interestPaidOnLoans +
      insurancePremiums +
      otherMiscExpenses;

    const profitBeforeTax = grossIncome - totalExpensesDetailed;
    const incomeTaxExpense = amountByAccount("Income Tax Expense");
    const netProfitAfterTax = profitBeforeTax - incomeTaxExpense;

    const depreciation = amountByAccount("Depreciation Expense");
    const interestOnBorrowings = amountByAccount("Interest on Borrowings");
    const lossOnSale = amountByAccount("Loss on Sale of Asset");
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

    return {
      ...totals,
      profit,
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
      incomeFromRevenue,
      interestReceived,
      rentalIncome,
      miscIncome,
      incomeFromOtherSources,
      grossIncome,
      payrollExpenses,
      advertisingExpenses,
      marketingExpenses,
      officeExpenses,
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
    };
  }, [ledgerRows]);

  const statementGraphData = useMemo(
    () => [
      { name: "Revenue", actual: statement.revenue, budget: toAmount(budgetTargets.revenue) },
      { name: "Expenses", actual: statement.totalExpensesDetailed || statement.expense, budget: toAmount(budgetTargets.expense) },
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
      persistToken(data.token);
      persistEmail(email);
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

  const logout = () => {
    setToken(null);
    persistToken(null);
    setStats(null);
    setUserCount(0);
    setFile(null);
    setInfoMessage("Signed out.");
  };

  const continueWithGoogle = async (credential) => {
    setErrorMessage("");
    setInfoMessage("");
    if (!credential) {
      setErrorMessage("Google sign-in failed. Please try again.");
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await response.json();
      if (!response.ok || !data.token) {
        throw new Error(data.error || "Google login failed");
      }

      setToken(data.token);
      persistToken(data.token);
      if (data.email) {
        setEmail(data.email);
        persistEmail(data.email);
      }
      setInfoMessage(data.created ? "Google account created and signed in." : "Signed in with Google.");
    } catch (error) {
      setErrorMessage(error.message || "Google login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const loadStats = async () => {
    const data = await authorizedFetch("/analytics");
    setStats(data);
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

  const analyze = async () => {
    setErrorMessage("");
    setInfoMessage("");

    if (!file) {
      setErrorMessage("Upload a CSV file first.");
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);

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

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    const bootstrap = async () => {
      try {
        await Promise.all([loadStats(), loadLiveUserCount()]);
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
        await loadLiveUserCount();
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
    if (token || !GOOGLE_CLIENT_ID || !googleButtonRef.current) {
      return;
    }

    const googleSdk = window.google?.accounts?.id;
    if (!googleSdk) {
      return;
    }

    googleButtonRef.current.innerHTML = "";
    googleSdk.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => continueWithGoogle(response.credential),
    });
    googleSdk.renderButton(googleButtonRef.current, {
      type: "standard",
      shape: "rectangular",
      theme: "outline",
      text: "continue_with",
      size: "large",
      width: 320,
    });
  }, [token, authMode]);

  if (!token) {
    return (
      <div style={styles.center}>
        <div style={styles.authSingleCard}>
          <h2 style={styles.authTitle}>{authMode === "login" ? "Login" : "Signup"}</h2>

          {authMode === "login" ? (
            <>
              <input
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={styles.authInput}
              />
              <div style={styles.passwordWrap}>
                <input
                  placeholder="Password"
                  type={showLoginPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={styles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  style={styles.eyeToggle}
                >
                  {showLoginPassword ? "Hide" : "Show"}
                </button>
              </div>
              <button
                type="button"
                style={styles.linkButton}
                onClick={() => setInfoMessage("Password reset flow can be added next.")}
              >
                Forgot password?
              </button>
              <button onClick={login} style={styles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Signing in..." : "Login"}
              </button>
              {GOOGLE_CLIENT_ID ? (
                <>
                  <div style={styles.authDivider}><span>or</span></div>
                  <div ref={googleButtonRef} style={styles.googleButtonWrap} />
                </>
              ) : null}
              <p style={styles.authSwitchText}>
                Don't have an account?{" "}
                <button
                  type="button"
                  style={styles.inlineLink}
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
                style={styles.authInput}
              />
              <div style={styles.passwordWrap}>
                <input
                  placeholder="Create password"
                  type={showSignupPassword ? "text" : "password"}
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  style={styles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword((value) => !value)}
                  style={styles.eyeToggle}
                >
                  {showSignupPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div style={styles.passwordWrap}>
                <input
                  placeholder="Confirm password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={styles.authInput}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  style={styles.eyeToggle}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                placeholder="Organization (optional)"
                value={org}
                onChange={(event) => setOrg(event.target.value)}
                style={styles.authInput}
              />
              <button onClick={register} style={styles.authPrimaryButton} disabled={authLoading}>
                {authLoading ? "Creating..." : "Signup"}
              </button>
              {GOOGLE_CLIENT_ID ? (
                <>
                  <div style={styles.authDivider}><span>or</span></div>
                  <div ref={googleButtonRef} style={styles.googleButtonWrap} />
                </>
              ) : null}
              <p style={styles.authSwitchText}>
                Already have an account?{" "}
                <button
                  type="button"
                  style={styles.inlineLink}
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

        {errorMessage ? <p style={styles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={styles.infoText}>{infoMessage}</p> : null}
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @media (max-width: 1024px) {
          .app-layout { flex-direction: column; height: auto !important; }
          .sidebar { width: 100% !important; }
          .main { padding: 20px !important; }
        }
      `}</style>

      <div style={styles.sidebar} className="sidebar">
        <h2>Financial Analytics Platform</h2>
        <p>Dashboard</p>
        <p>Reports</p>
        <p>Statements</p>
        <button onClick={logout} style={styles.secondaryButton}>Logout</button>
      </div>

      <div style={styles.main} className="main app-layout">
        <h1>Executive Dashboard</h1>

        {errorMessage ? <p style={styles.errorText}>{errorMessage}</p> : null}
        {infoMessage ? <p style={styles.infoText}>{infoMessage}</p> : null}

        <div style={styles.liveUserCard}>
          <h3>Live Active Users</h3>
          <div style={styles.userCountDisplay}>
            <span style={styles.userCountNumber}>{userCount}</span>
            {userCountUpdating && <span style={styles.pulse}>●</span>}
          </div>
          <p style={styles.updateIndicator}>Updates every 3 seconds</p>
        </div>

        <div style={styles.card}>
          <input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button onClick={analyze} style={styles.button} disabled={loading}>
            {loading ? "Processing..." : "Generate Report"}
          </button>
        </div>

        {stats ? (
          <div style={styles.card}>
            <h3>Analytics</h3>
            <div style={styles.analyticsChartWrap}>
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

        <div style={styles.card}>
          <h3>Quick Accounting Entry</h3>
          <p style={styles.graphNote}>
            Post common transactions like Accounts Receivable, Accounts Payable, and Purchases.
          </p>
          <div style={styles.quickEntryGrid}>
            <select
              value={quickEntryId}
              onChange={(event) => setQuickEntryId(event.target.value)}
              style={styles.tableInput}
            >
              {QUICK_ENTRY_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quickAmount}
              onChange={(event) => setQuickAmount(event.target.value)}
              style={styles.tableInput}
              placeholder="Amount"
            />
            <button onClick={applyQuickEntry} style={styles.button}>Post Entry</button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.statementHeader}>
            <h3>Financial Input Sheet</h3>
            <button onClick={addLedgerRow} style={styles.button}>Add Row</button>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Account</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Class</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Depreciation</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>
                      <input
                        value={row.account}
                        onChange={(event) => updateLedgerRow(row.id, "account", event.target.value)}
                        style={styles.tableInput}
                        placeholder="Account name"
                        list="account-options"
                      />
                    </td>
                    <td style={styles.td}>
                      <select
                        value={row.type}
                        onChange={(event) => updateLedgerRow(row.id, "type", event.target.value)}
                        style={styles.tableInput}
                      >
                        <option value="revenue">Revenue</option>
                        <option value="expense">Expense</option>
                        <option value="asset">Asset</option>
                        <option value="liability">Liability</option>
                        <option value="capital">Capital</option>
                        <option value="drawings">Drawings</option>
                      </select>
                    </td>
                    <td style={styles.td}>
                      <select
                        value={row.subtype}
                        onChange={(event) => updateLedgerRow(row.id, "subtype", event.target.value)}
                        style={styles.tableInput}
                      >
                        {getSubtypeOptions(row.type).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(event) => updateLedgerRow(row.id, "amount", event.target.value)}
                        style={styles.tableInput}
                        placeholder="0.00"
                      />
                    </td>
                    <td style={styles.td}>
                      {row.type === "asset" && row.subtype === "non-current" ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.depreciation || ""}
                          onChange={(event) => updateLedgerRow(row.id, "depreciation", event.target.value)}
                          style={styles.tableInput}
                          placeholder="0.00"
                        />
                      ) : (
                        <span style={styles.updateIndicator}>N/A</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <button onClick={() => deleteLedgerRow(row.id)} style={styles.deleteButton}>Remove</button>
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

        <div style={styles.card}>
          <h3>Profit and Loss Statement</h3>
          <p style={styles.sectionLine}>Income</p>
          <p>Gross Sales: {formatMoney(statement.grossSales)}</p>
          <p>Less: Goods Return: {formatMoney(statement.goodsReturn)}</p>
          <p>Less: Discounts: {formatMoney(statement.discounts)}</p>
          <p>Less: Bad Debts: {formatMoney(statement.badDebts)}</p>
          <p>Less: Cost of Goods Sold (COGS): {formatMoney(statement.cogs)}</p>
          <p style={styles.totalLine}>Income From Revenue: {formatMoney(statement.incomeFromRevenue)}</p>
          <hr />
          <p style={styles.sectionLine}>Other Income</p>
          <p>Interest Received on Bank Accounts: {formatMoney(statement.interestReceived)}</p>
          <p>Rental Income from Properties: {formatMoney(statement.rentalIncome)}</p>
          <p>Income from Miscellaneous Sources: {formatMoney(statement.miscIncome)}</p>
          <p style={styles.totalLine}>Income from Other Sources: {formatMoney(statement.incomeFromOtherSources)}</p>
          <p style={styles.totalLine}>Gross Income: {formatMoney(statement.grossIncome)}</p>
          <hr />
          <p style={styles.sectionLine}>Expenses</p>
          <p>Payroll Expenses: {formatMoney(statement.payrollExpenses)}</p>
          <p>Advertising Expenses: {formatMoney(statement.advertisingExpenses)}</p>
          <p>Marketing Expenses: {formatMoney(statement.marketingExpenses)}</p>
          <p>Office Expenses: {formatMoney(statement.officeExpenses)}</p>
          <p>Utilities: {formatMoney(statement.utilitiesExpense)}</p>
          <p>License Fees: {formatMoney(statement.licenseFees)}</p>
          <p>Interest Paid on Loans: {formatMoney(statement.interestPaidOnLoans)}</p>
          <p>Insurance Premiums: {formatMoney(statement.insurancePremiums)}</p>
          <p>Other Miscellaneous Expenses: {formatMoney(statement.otherMiscExpenses)}</p>
          <p style={styles.totalLine}>Total Expenses: {formatMoney(statement.totalExpensesDetailed)}</p>
          <hr />
          <p style={styles.totalLine}>Profit Before Taxes: {formatMoney(statement.profitBeforeTax)}</p>
          <p>Less Income Tax: {formatMoney(statement.incomeTaxExpense)}</p>
          <p style={styles.totalLine}>Net Profit / Loss After Tax: {formatMoney(statement.netProfitAfterTax)}</p>
        </div>

        <div style={styles.card}>
          <h3>Balance Sheet</h3>
          <p style={styles.sectionLine}>Assets</p>
          <p>Current Assets: {formatMoney(statement.assetsCurrent)}</p>
          <p>Non-Current Assets (Gross): {formatMoney(statement.assetsNonCurrentGross)}</p>
          <p>Less: Accumulated Depreciation: {formatMoney(statement.nonCurrentAccumulatedDepreciation)}</p>
          <p>Non-Current Assets (Net): {formatMoney(statement.assetsNonCurrent)}</p>
          <p style={styles.totalLine}>Total Assets: {formatMoney(statement.totalAssets)}</p>
          <hr />
          <p style={styles.sectionLine}>Liabilities and Equity</p>
          <p>Current Liabilities: {formatMoney(statement.liabilitiesCurrent)}</p>
          <p>Non-Current Liabilities: {formatMoney(statement.liabilitiesNonCurrent)}</p>
          <p>Total Liabilities: {formatMoney(statement.totalLiabilities)}</p>
          <p>Equity (Capital + Profit - Drawings): {formatMoney(statement.equity)}</p>
          <p style={styles.totalLine}>Total Liabilities + Equity: {formatMoney(statement.liabilitiesAndEquity)}</p>
          <p style={Math.abs(statement.balanceDelta) < 0.01 ? styles.infoText : styles.errorText}>
            Balance Check (Assets - Liabilities & Equity): {formatMoney(statement.balanceDelta)}
          </p>
        </div>

        <div style={styles.card}>
          <h3>Statement of Cash Flows (Operating Activities)</h3>
          <p>I. Net profit before taxation: {formatMoney(statement.profitBeforeTax)}</p>
          <p style={styles.sectionLine}>II. Adjustments related to non-cash and non-operating items</p>
          <p>Add: Depreciation on Fixed Assets: {formatMoney(statement.depreciation)}</p>
          <p>Add: Interest on Borrowings: {formatMoney(statement.interestOnBorrowings)}</p>
          <p>Add: Loss on Sale of Asset: {formatMoney(statement.lossOnSale)}</p>
          <p>Less: Interest Income / Other Income: {formatMoney(statement.interestIncome)}</p>
          <p>Less: Dividend Income: {formatMoney(statement.dividendIncome)}</p>
          <p>Less: Profit on Sale of Asset: {formatMoney(statement.profitOnSale)}</p>
          <p style={styles.totalLine}>
            Operating Profit before Working Capital Changes: {formatMoney(statement.operatingProfitBeforeWorkingCapital)}
          </p>
          <hr />
          <p style={styles.sectionLine}>III. Adjustments related to current assets and current liabilities</p>
          <p>Add: Decrease in Current Assets: {formatMoney(statement.decreaseCurrentAssets)}</p>
          <p>Add: Increase in Current Liabilities: {formatMoney(statement.increaseCurrentLiabilities)}</p>
          <p>Less: Increase in Current Assets: {formatMoney(statement.increaseCurrentAssets)}</p>
          <p>Less: Decrease in Current Liabilities: {formatMoney(statement.decreaseCurrentLiabilities)}</p>
          <p style={styles.totalLine}>Working Capital Adjustment: {formatMoney(statement.workingCapitalAdjustments)}</p>
          <p style={styles.totalLine}>Cash generated from Operations: {formatMoney(statement.cashGeneratedFromOperations)}</p>
          <p>Less: Income taxes paid (net of refund): {formatMoney(statement.incomeTaxesPaid)}</p>
          <p style={styles.totalLine}>Net Cash Inflow / (Outflow) from Operating Activities: {formatMoney(statement.netCashFromOperations)}</p>
        </div>

        <div style={styles.card}>
          <h3>Financial Statement Graph</h3>
          <p style={styles.graphNote}>
            Bar/Column comparison of actual results against budget by statement category.
          </p>
          <div style={styles.budgetGrid}>
            <label style={styles.budgetField}>
              Revenue Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.revenue}
                onChange={(event) => updateBudgetTarget("revenue", event.target.value)}
                style={styles.tableInput}
              />
            </label>
            <label style={styles.budgetField}>
              Expense Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.expense}
                onChange={(event) => updateBudgetTarget("expense", event.target.value)}
                style={styles.tableInput}
              />
            </label>
            <label style={styles.budgetField}>
              Asset Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.totalAssets}
                onChange={(event) => updateBudgetTarget("totalAssets", event.target.value)}
                style={styles.tableInput}
              />
            </label>
            <label style={styles.budgetField}>
              Liability Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.totalLiabilities}
                onChange={(event) => updateBudgetTarget("totalLiabilities", event.target.value)}
                style={styles.tableInput}
              />
            </label>
            <label style={styles.budgetField}>
              Equity Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.equity}
                onChange={(event) => updateBudgetTarget("equity", event.target.value)}
                style={styles.tableInput}
              />
            </label>
            <label style={styles.budgetField}>
              Net Cash Budget
              <input
                type="number"
                step="0.01"
                value={budgetTargets.netCashFlow}
                onChange={(event) => updateBudgetTarget("netCashFlow", event.target.value)}
                style={styles.tableInput}
              />
            </label>
          </div>
          <div style={styles.chartWrap}>
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
    background: "#f2f3f5",
  },
  authSingleCard: {
    width: "100%",
    maxWidth: 360,
    background: "#ffffff",
    borderRadius: 10,
    padding: 18,
    boxShadow: "0 8px 22px rgba(18, 40, 64, 0.14)",
    border: "1px solid #e4e9f1",
  },
  authTitle: {
    marginTop: 2,
    marginBottom: 16,
    textAlign: "center",
    color: "#1b2c42",
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  authInput: {
    display: "block",
    marginBottom: 12,
    padding: "12px 14px",
    width: "100%",
    borderRadius: 6,
    border: "1px solid #d6dce5",
    background: "#ffffff",
    color: "#1b2c42",
    fontSize: 15,
  },
  passwordWrap: {
    position: "relative",
  },
  eyeToggle: {
    position: "absolute",
    right: 10,
    top: 10,
    border: "none",
    background: "transparent",
    color: "#7a8798",
    fontSize: 12,
    cursor: "pointer",
    padding: 2,
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2476d2",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    display: "block",
    margin: "0 auto 10px auto",
  },
  authPrimaryButton: {
    width: "100%",
    border: "none",
    borderRadius: 6,
    background: "#1171c7",
    color: "#ffffff",
    fontWeight: 700,
    padding: "11px 14px",
    cursor: "pointer",
    marginTop: 4,
  },
  authSwitchText: {
    margin: "12px 0 2px 0",
    textAlign: "center",
    color: "#6b7380",
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
  googleButtonWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 6,
  },
  inlineLink: {
    border: "none",
    background: "transparent",
    color: "#2476d2",
    cursor: "pointer",
    padding: 0,
    fontWeight: 600,
    fontSize: 14,
  },
  layout: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
    background: "#f4f9ff",
  },
  sidebar: {
    width: 240,
    background: "#0b1f3a",
    color: "#ffffff",
    padding: 20,
  },
  main: {
    flex: 1,
    padding: 32,
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
  infoText: {
    margin: 0,
    color: "#1d4e89",
    fontWeight: 600,
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
};
