import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Navbar from "./components/Navbar";
import Loader from "./components/Loader";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./hooks/useAuth";
import { AuthProvider } from "./store/authStore";
import Billing from "./pages/Billing";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Loader label="Loading workspace..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Loader label="Checking session..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
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
        <Route path="/app" element={<Dashboard />} />
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
