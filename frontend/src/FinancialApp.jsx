import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:5000").trim();
const TOKEN_KEY = "financepro_token";

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

const INITIAL_LEDGER_ROWS = [
  { id: 1, account: "Sales Revenue", type: "revenue", subtype: "operating", amount: "" },
  { id: 2, account: "Rent Expense", type: "expense", subtype: "operating", amount: "" },
  { id: 3, account: "Cash", type: "asset", subtype: "current", amount: "" },
  { id: 4, account: "Equipment", type: "asset", subtype: "non-current", amount: "" },
  { id: 5, account: "Accounts Payable", type: "liability", subtype: "current", amount: "" },
  { id: 6, account: "Owner Capital", type: "capital", subtype: "equity", amount: "" },
  { id: 7, account: "Drawings", type: "drawings", subtype: "equity", amount: "" },
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

export default function App() {
  const [token, setToken] = useState(() => readStoredToken());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [file, setFile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [userCountUpdating, setUserCountUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [ledgerRows, setLedgerRows] = useState(INITIAL_LEDGER_ROWS);

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
          totals.assetsNonCurrent += amount;
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
    };
  }, [ledgerRows]);

  const statementGraphData = useMemo(
    () => [
      { name: "Revenue", value: statement.revenue },
      { name: "Expenses", value: statement.expense },
      { name: "Profit", value: statement.profit },
      { name: "Assets", value: statement.totalAssets },
      { name: "Liabilities", value: statement.totalLiabilities },
      { name: "Equity", value: statement.equity },
      { name: "Net Cash Flow", value: statement.netCashFlow },
    ],
    [statement],
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

    if (!org || !registerEmail || !registerPassword) {
      setErrorMessage("Organization, email, and password are required.");
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org,
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
          return { ...row, type: nextType, subtype: nextSubtype };
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
        { id: nextId, account: "", type: "expense", subtype: "operating", amount: "" },
      ];
    });
  };

  const deleteLedgerRow = (rowId) => {
    setLedgerRows((rows) => rows.filter((row) => row.id !== rowId));
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

  if (!token) {
    return (
      <div style={styles.center}>
        <style>{`
          @media (max-width: 880px) {
            .auth-card { width: 100% !important; }
          }
        `}</style>

        <div style={styles.authShell}>
          <div style={{ ...styles.card, ...styles.authCard }} className="auth-card">
            <h2>Financial Analytics Platform</h2>
            <input
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={styles.input}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={styles.input}
            />
            <button onClick={login} style={styles.button} disabled={authLoading}>
              {authLoading ? "Signing in..." : "Login"}
            </button>
          </div>

          <div style={{ ...styles.card, ...styles.authCard }} className="auth-card">
            <h2>Create Account</h2>
            <input
              placeholder="Organization"
              value={org}
              onChange={(event) => setOrg(event.target.value)}
              style={styles.input}
            />
            <input
              placeholder="Email"
              value={registerEmail}
              onChange={(event) => setRegisterEmail(event.target.value)}
              style={styles.input}
            />
            <input
              placeholder="Password"
              type="password"
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
              style={styles.input}
            />
            <button onClick={register} style={styles.button} disabled={authLoading}>
              {authLoading ? "Creating..." : "Register"}
            </button>
          </div>
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
                      <button onClick={() => deleteLedgerRow(row.id)} style={styles.deleteButton}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <h3>Statement of Profit or Loss</h3>
          <p>Total Revenue: {formatMoney(statement.revenue)}</p>
          <p>Total Expenses: {formatMoney(statement.expense)}</p>
          <p style={styles.totalLine}>Net Profit / (Loss): {formatMoney(statement.profit)}</p>
        </div>

        <div style={styles.card}>
          <h3>Statement of Financial Position</h3>
          <p>Current Assets: {formatMoney(statement.assetsCurrent)}</p>
          <p>Non-Current Assets: {formatMoney(statement.assetsNonCurrent)}</p>
          <p style={styles.totalLine}>Total Assets: {formatMoney(statement.totalAssets)}</p>
          <hr />
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
          <h3>Statement of Cash Flow</h3>
          <p>Operating Cash Inflows (Revenue): {formatMoney(statement.operatingCashInflows)}</p>
          <p>Operating Cash Outflows (Expenses): {formatMoney(statement.operatingCashOutflows)}</p>
          <p>Net Operating Cash Flow: {formatMoney(statement.netOperatingCashFlow)}</p>
          <p>Investing Cash Outflows (Non-current Assets): {formatMoney(statement.investingCashOutflows)}</p>
          <p>Financing Inflows (Capital): {formatMoney(statement.financingInflows)}</p>
          <p>Financing Outflows (Drawings): {formatMoney(statement.financingOutflows)}</p>
          <p style={styles.totalLine}>Net Cash Flow: {formatMoney(statement.netCashFlow)}</p>
        </div>

        <div style={styles.card}>
          <h3>Financial Statement Graph</h3>
          <p style={styles.graphNote}>
            Bar/Column Charts: Best for comparing distinct categories, such as sales performance by region, or comparing actual costs against budgeted costs.
          </p>
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={statementGraphData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar dataKey="value" fill="#2563eb" />
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
    background: "linear-gradient(145deg, #0b1f3a 0%, #9fd3ff 65%, #ffffff 100%)",
  },
  authShell: {
    width: "100%",
    maxWidth: 980,
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  authCard: {
    width: 420,
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
    minWidth: 760,
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
  graphNote: {
    marginTop: 0,
    marginBottom: 12,
    color: "#1d4e89",
    fontSize: 13,
  },
};
