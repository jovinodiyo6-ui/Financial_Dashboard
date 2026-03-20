import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const API = "/api"; // Vite proxy strips /api -> Flask backend
const TOKEN_KEY = "financepro_token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const storeToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export default function App() {
  const [token, setToken] = useState(() => readToken());
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const apiFetch = useCallback(
    async (path, options = {}) => {
      if (!token) throw new Error("missing token");
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      };
      const res = await fetch(`${API}${path}`, { ...options, headers, credentials: "include" });
      let payload = {};
      try {
        payload = await res.json();
      } catch {
        payload = {};
      }
      if (res.status === 401) {
        setToken(null);
        storeToken(null);
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      return payload;
    },
    [token],
  );

  const handleAuthSuccess = (newToken, message = "Signed in") => {
    setToken(newToken);
    storeToken(newToken);
    setToast({ kind: "success", message });
  };

  const handleSignOut = () => {
    setToken(null);
    storeToken(null);
    setToast({ kind: "info", message: "Signed out" });
  };

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const authedLayout = (
    <div className="bg-black text-white min-h-screen">
      <Navbar onSignOut={handleSignOut} />
      <Routes>
        <Route
          path="/"
          element={<Dashboard apiFetch={apiFetch} refreshKey={refreshKey} setToast={setToast} />}
        />
        <Route
          path="/invoices"
          element={<Invoices apiFetch={apiFetch} onCreated={triggerRefresh} setToast={setToast} />}
        />
        <Route
          path="/bills"
          element={<Bills apiFetch={apiFetch} onCreated={triggerRefresh} setToast={setToast} />}
        />
        <Route path="*" element={<Center text="Not found" />} />
      </Routes>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );

  return (
    <BrowserRouter>
      {token ? (
        authedLayout
      ) : (
        <Routes>
          <Route path="*" element={<Auth onSuccess={handleAuthSuccess} setToast={setToast} />} />
        </Routes>
      )}
      {toast && !token && <Toast toast={toast} onClose={() => setToast(null)} />}
    </BrowserRouter>
  );
}

function Navbar({ onSignOut }) {
  return (
    <div className="flex items-center gap-6 p-4 bg-zinc-900">
      <Link to="/" className="font-semibold">
        Dashboard
      </Link>
      <Link to="/invoices">Invoices</Link>
      <Link to="/bills">Bills</Link>
      <div className="flex-1" />
      <button onClick={onSignOut} className="text-sm text-gray-300 hover:text-white">
        Sign out
      </button>
    </div>
  );
}

function Dashboard({ apiFetch, refreshKey, setToast }) {
  const [summary, setSummary] = useState(null);
  const [ai, setAI] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [finance, aiPayload] = await Promise.all([
          apiFetch("/dashboard"),
          apiFetch("/ai-cfo/overview"),
        ]);
        if (!cancelled) {
          setSummary(finance);
          setAI(aiPayload);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err.message || "Failed to load data");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, refreshKey]);

  if (error) return <Center text={error} />;
  if (!summary) return <Center text="Loading..." />;

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold">Finance Control Tower</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <Card title="Open Receivables" value={summary.open_receivables} prefix="$" />
        <Card title="Open Payables" value={summary.open_payables} prefix="$" />
        <Card title="Net Tax Due" value={summary.net_tax_due} prefix="$" />
        <Card title="Invoices" value={summary.invoice_count} />
        <Card title="Bills" value={summary.bill_count} />
        <Card title="Collected This Month" value={summary.collected_this_month} prefix="$" />
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">AI CFO</h2>
        {!ai ? (
          <p className="text-gray-400">Loading insights...</p>
        ) : (
          <div className="space-y-4">
            {ai.insights?.map((i, idx) => (
              <div key={idx} className="bg-zinc-900 p-4 rounded-xl">
                <p className="font-semibold">{i.title}</p>
                <p className="text-gray-400 text-sm">{i.message}</p>
              </div>
            ))}
            {ai.alerts?.map((a, idx) => (
              <div key={idx} className="bg-red-900 p-4 rounded-xl">
                ⚠️ {a}
              </div>
            ))}
            {ai.recommendations?.map((r, idx) => (
              <div key={idx} className="bg-blue-900 p-4 rounded-xl">
                💡 {r}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Invoices({ apiFetch, onCreated, setToast }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const createInvoice = async () => {
    const subtotal = Number(amount || 0);
    if (subtotal <= 0) {
      setToast({ kind: "error", message: "Enter a valid amount" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: "Walk-in Customer",
          tax_rate: 16,
          items: [{ description: "Services", quantity: 1, unit_price: subtotal }],
        }),
      });
      setToast({ kind: "success", message: "Invoice created" });
      setAmount("");
      onCreated?.();
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPage
      title="Create Invoice"
      amount={amount}
      setAmount={setAmount}
      saving={saving}
      onSubmit={createInvoice}
      submitLabel="Create Invoice"
    />
  );
}

function Bills({ apiFetch, onCreated, setToast }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const createBill = async () => {
    const subtotal = Number(amount || 0);
    if (subtotal <= 0) {
      setToast({ kind: "error", message: "Enter a valid amount" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: "Demo Vendor",
          status: "approved",
          tax_rate: 16,
          items: [{ description: "Supplies", quantity: 1, unit_price: subtotal }],
        }),
      });
      setToast({ kind: "success", message: "Bill created" });
      setAmount("");
      onCreated?.();
    } catch (err) {
      console.error(err);
      setToast({ kind: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPage
      title="Create Bill"
      amount={amount}
      setAmount={setAmount}
      saving={saving}
      onSubmit={createBill}
      submitLabel="Create Bill"
    />
  );
}

function FormPage({ title, amount, setAmount, saving, onSubmit, submitLabel }) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="space-x-3">
        <input
          className="p-2 text-black rounded"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
        />
        <button
          onClick={onSubmit}
          disabled={saving}
          className="bg-white text-black px-4 py-2 rounded disabled:opacity-60"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

function Card({ title, value, prefix = "" }) {
  const display =
    value === undefined || value === null ? "—" : `${prefix}${Number(value).toLocaleString()}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 p-6 rounded-2xl"
    >
      <h3 className="text-gray-400 text-sm">{title}</h3>
      <p className="text-2xl font-bold mt-2">{display}</p>
    </motion.div>
  );
}

function Center({ text }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      {text}
    </div>
  );
}

function Toast({ toast, onClose }) {
  const tone =
    toast.kind === "error"
      ? "bg-red-900"
      : toast.kind === "success"
        ? "bg-green-900"
        : "bg-zinc-800";
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`${tone} text-white px-4 py-3 rounded shadow-lg`}>{toast.message}</div>
    </div>
  );
}

function Auth({ onSuccess, setToast }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("Acme Inc");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      setToast({ kind: "error", message: "Email and password required" });
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/login" : "/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, org, business_type: "sole_proprietor" };
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Auth failed");
      if (mode === "login") {
        onSuccess(payload.token, "Signed in");
      } else {
        setToast({ kind: "success", message: "Account created, please sign in" });
        setMode("login");
      }
    } catch (err) {
      setToast({ kind: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <div className="space-y-3">
          {mode === "register" && (
            <input
              className="w-full p-2 text-black rounded"
              placeholder="Organization"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
          )}
          <input
            className="w-full p-2 text-black rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full p-2 text-black rounded"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="w-full bg-white text-black py-2 rounded font-semibold disabled:opacity-60"
        >
          {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Sign up"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="w-full text-sm text-gray-300 hover:text-white"
        >
          {mode === "login" ? "Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
