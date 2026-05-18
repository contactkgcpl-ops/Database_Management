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
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setBooting(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    tokenStore.set(res.access_token);
    setUser(await api.me());
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  const value = useMemo(() => ({ user, booting, login, logout }), [user, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
