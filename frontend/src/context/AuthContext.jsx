import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) {
      setBooting(false);
      return;
    }
    api.me()
      .then(async (userData) => {
        setUser(userData);
        try {
          await api.timeResume();
        } catch (e) {
          console.error("Failed to resume time tracking:", e);
        }
      })
      .catch(() => tokenStore.clear())
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const handleUnload = () => {
      const token = tokenStore.get();
      if (token) {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
        fetch(`${API_URL}/time/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener("unload", handleUnload);
    return () => window.removeEventListener("unload", handleUnload);
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    tokenStore.set(res.access_token);
    setUser(await api.me());
  };

  const logout = async () => {
    try {
      await api.markTimeLogout();
    } catch {
      // Logout should still clear the local session if time close fails.
    }
    tokenStore.clear();
    setUser(null);
  };

  const value = useMemo(() => ({ user, booting, login, logout }), [user, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
