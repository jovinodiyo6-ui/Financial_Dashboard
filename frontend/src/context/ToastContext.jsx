import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

const createToast = ({ title, message, tone = "success" }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title,
  message,
  tone,
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ title, message, tone = "success", duration = 4200 }) => {
      const toast = createToast({ title, message, tone });
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => dismissToast(toast.id), duration);
      return toast.id;
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast,
      success: (title, message) => pushToast({ title, message, tone: "success" }),
      error: (title, message) => pushToast({ title, message, tone: "error" }),
      info: (title, message) => pushToast({ title, message, tone: "info" }),
    }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={`toast toast--${toast.tone}`}
            onClick={() => dismissToast(toast.id)}
          >
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
