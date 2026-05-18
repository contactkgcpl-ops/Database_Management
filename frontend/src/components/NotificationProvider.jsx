import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const NotificationContext = createContext(null);
const NOTIFY_EVENT = "erp:notify";

export function notify(message, type = "error") {
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: { message, type } }));
}

export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, type = "error") => {
    const text = String(message || "Something went wrong");
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setItems((current) => [...current, { id, message: text, type }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ notify: push }), [push]);

  useEffect(() => {
    const onNotify = (event) => push(event.detail?.message, event.detail?.type);
    const onUnhandled = (event) => {
      if (event.reason?.notified) return;
      push(event.reason?.message || event.reason || "Unexpected error");
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, onNotify);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, [push]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notifications" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <div className={`notification ${item.type}`} key={item.id}>
            {item.message}
            <button type="button" aria-label="Dismiss notification" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
              x
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotify must be used inside NotificationProvider");
  return context.notify;
}
