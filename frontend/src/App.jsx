import React, { useState } from "react";
import { navigation } from "./config/navigation";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./components/NotificationProvider";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";

function AppShell() {
  const { user, booting } = useAuth();
  const [page, setPage] = useState(navigation[0].page);

  if (booting) return <main className="login">Loading...</main>;
  return user ? <AppLayout page={page} setPage={setPage} /> : <LoginPage />;
}

export function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </NotificationProvider>
  );
}
