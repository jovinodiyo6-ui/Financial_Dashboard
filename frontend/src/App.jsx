import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Navbar from "./components/Navbar";
import Loader from "./components/Loader";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./hooks/useAuth";
import { AuthProvider } from "./store/authStore";
import Billing from "./pages/Billing";
import Dashboard from "./pages/Dashboard";
import Entries from "./pages/Entries";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Reports from "./pages/Reports";
import Register from "./pages/Register";
import Setup from "./pages/Setup";

function resolveWorkspacePath(user) {
  return user?.default_company?.onboarding_complete ? "/app" : "/setup";
}

function ProtectedLayout() {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loader label="Loading workspace..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isConfigured = Boolean(user?.default_company?.onboarding_complete);
  if (!isConfigured && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  if (isConfigured && location.pathname === "/setup") {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="workspace-shell">
      <Navbar />
      <main className="workspace-main">
        <Outlet />
      </main>
    </div>
  );
}

function PublicOnly({ children }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <Loader label="Checking session..." />;
  }

  if (isAuthenticated) {
    return <Navigate to={resolveWorkspacePath(user)} replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Landing />}
      />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      <Route element={<ProtectedLayout />}>
        <Route path="/setup" element={<Setup />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/entries" element={<Entries />} />
        <Route path="/billing" element={<Billing />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
