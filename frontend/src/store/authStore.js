import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, register as registerRequest } from "../api/auth";
import { AUTH_EXPIRED_EVENT, readToken, storeToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(readToken()));

  const logout = () => {
    storeToken(null);
    setToken(null);
    setUser(null);
  };

  const hydrateUser = async () => {
    const activeToken = readToken();
    if (!activeToken) {
      setLoading(false);
      setUser(null);
      return null;
    }

    setLoading(true);
    try {
      const profile = await getMe();
      setUser(profile);
      setToken(activeToken);
      return profile;
    } catch (error) {
      logout();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrateUser().catch(() => {
      // Ignore startup auth errors and fall back to logged-out state.
    });
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      storeToken(null);
      setToken(null);
      setUser(null);
      setLoading(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleUnauthorized);
  }, []);

  const login = async (credentials) => {
    const payload = await loginRequest(credentials);
    storeToken(payload.token);
    setToken(payload.token);
    return hydrateUser();
  };

  const register = async (payload) => {
    await registerRequest(payload);
    return login({
      email: payload.email,
      password: payload.password,
    });
  };

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      refreshUser: hydrateUser,
    }),
    [token, user, loading],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
