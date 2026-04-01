import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getThemeSetting, updateThemeSetting } from "../api/theme";
import { useAuthContext } from "../store/authStore";

const THEME_KEY = "financepro_theme";
const ThemeContext = createContext(null);

export function readThemePreference() {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
}

export function initTheme() {
  const theme = readThemePreference();
  applyTheme(theme);
  return theme;
}

export function ThemeProvider({ children }) {
  const { isAuthenticated, loading, user } = useAuthContext();
  const [theme, setThemeState] = useState(() => readThemePreference());
  const [syncReady, setSyncReady] = useState(false);

  const setTheme = (nextTheme) => {
    setThemeState(nextTheme === "dark" ? "dark" : "light");
  };

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    if (!isAuthenticated || !user?.id) {
      setSyncReady(false);
      return undefined;
    }

    const preferredTheme = user.theme_preference;
    if (preferredTheme === "light" || preferredTheme === "dark") {
      setTheme(preferredTheme);
      setSyncReady(true);
      return undefined;
    }

    let cancelled = false;
    setSyncReady(false);

    getThemeSetting()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        if (payload?.theme === "light" || payload?.theme === "dark") {
          setTheme(payload.theme);
        }
      })
      .catch(() => {
        // Keep local preference when the backend theme lookup is unavailable.
      })
      .finally(() => {
        if (!cancelled) {
          setSyncReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, user?.id, user?.theme_preference]);

  useEffect(() => {
    if (!isAuthenticated || loading || !syncReady || !user?.id) {
      return;
    }

    updateThemeSetting(theme).catch(() => {
      // Keep local state even if backend sync fails temporarily.
    });
  }, [theme, isAuthenticated, loading, syncReady, user?.id]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
