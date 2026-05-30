import React, { useState } from "react";
import { navigation } from "./config/navigation";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./components/NotificationProvider";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { GlobalLoader } from "./components/GlobalLoader";

function MainApp() {
  const { user } = useAuth();
  const initialPage = React.useMemo(() => {
    const canOpen = (item) => user.permissions.includes(item.permission) || user.permissions.includes(item.alternatePermission);
    const flatNav = navigation.flatMap((item) => item.children || [item]);
    const firstAllowed = flatNav.find(canOpen);
    return firstAllowed ? firstAllowed.page : "dashboard";
  }, [user]);

  const [page, setPage] = React.useState(initialPage);
  return <AppLayout page={page} setPage={setPage} />;
}

function AppShell() {
  const { user, booting } = useAuth();
  if (booting) return <main className="login">Loading...</main>;
  return user ? <MainApp /> : <LoginPage />;
}

export function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppShell />
        <GlobalLoader />
      </AuthProvider>
    </NotificationProvider>
  );
}
