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
            <h2>NavySky Financial Suite</h2>
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
        <h2>NavySky</h2>
        <p>Dashboard</p>
        <p>Reports</p>
        <p>Analytics</p>
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
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={300}>
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
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: "0 10px 20px rgba(45, 106, 79, 0.35)",
  },
  userCountDisplay: {
    display: "flex",
    alignItems: "center",
    gap: 15,
    marginTop: 12,
    marginBottom: 12,
  },
  userCountNumber: {
    fontSize: 44,
    fontWeight: "bold",
    fontFamily: "Consolas, monospace",
  },
  pulse: {
    color: "#dbeafe",
    fontSize: 20,
    animation: "pulse 1.5s infinite",
  },
  updateIndicator: {
    fontSize: 12,
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
};
