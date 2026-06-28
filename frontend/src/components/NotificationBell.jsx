import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api, tokenStore } from "../api";

const getWsUrl = () => {
  const token = tokenStore.get() || "";
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  let url = "";
  
  if (apiUrl.startsWith("http://") || apiUrl.startsWith("https://")) {
    const tempUrl = new URL(apiUrl);
    const wsProto = tempUrl.protocol === "https:" ? "wss:" : "ws:";
    url = `${wsProto}//${tempUrl.host}${tempUrl.pathname}/chat/ws?token=${encodeURIComponent(token)}`;
  } else {
    const wsHost = window.location.host;
    url = `${wsProtocol}//${wsHost}${apiUrl}/chat/ws?token=${encodeURIComponent(token)}`;
  }
  return url.replace(/([^:]\/)\/+/g, "$1");
};

export function NotificationBell({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const reqData = await api.myNotifications();
      const combined = reqData.map((n) => ({ ...n, source: "requirement" }));
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setNotifications(combined);
    } catch {
      // silently fail
    }
  }, []);

  // Fetch notifications once on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // WebSocket connection & handling for real-time notifications
  useEffect(() => {
    let socket = null;
    let reconnectTimeout = null;
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;

      const wsUrl = getWsUrl();
      console.log("NotificationBell connecting to WebSocket URL:", wsUrl);
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("NotificationBell WebSocket connected successfully");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "notification") return;

          const notif = { ...data.payload, source: "requirement" };
          
          setNotifications((prev) => {
            // Check if notification already exists in the list
            if (prev.some((n) => n.id === notif.id && n.source === "requirement")) return prev;
            
            // Append and sort chronologically
            const updated = [notif, ...prev];
            updated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return updated;
          });
        } catch (err) {
          console.error("Error parsing notification WebSocket message:", err);
        }
      };

      socket.onclose = () => {
        console.log("NotificationBell WebSocket disconnected. Reconnecting...");
        if (isMounted) {
          reconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
      };

      socket.onerror = (err) => {
        console.error("NotificationBell WebSocket error:", err);
        socket.close();
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleMarkOne = async (notif) => {
    try {
      await api.markNotificationRead(notif.id);
      setNotifications((prev) => prev.filter((n) => !(n.id === notif.id && n.source === "requirement")));
      setOpen(false);
      if (onNavigate) onNavigate("requirements", notif.requirement?.id);
    } catch {/* ignore */}
  };

  const handleMarkAll = async () => {
    try {
      await api.markAllNotificationsRead().catch(() => {});
      setNotifications([]);
    } catch {/* ignore */}
    setOpen(false);
  };

  const unreadCount = notifications.length;

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef}>
      <button
        id="notification-bell-btn"
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications panel">
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={handleMarkAll}
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={28} />
                <span>No new notifications</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={`${notif.source}-${notif.id}`}
                  type="button"
                  className={`notif-item notif-type-${notif.type}`}
                  onClick={() => handleMarkOne(notif)}
                >
                  <span className="notif-icon">
                    {notif.type === "completed" ? "✅" : "📋"}
                  </span>
                  <div className="notif-content">
                    <span className="notif-title">
                      {notif.type === "completed"
                        ? `Your requirement is done!`
                        : `New requirement assigned to you`}
                    </span>
                    <span className="notif-subtitle">
                      {notif.requirement?.title}
                    </span>
                    {notif.type === "completed" && notif.requirement?.assigned_to && (
                      <span className="notif-meta">
                        Completed by {notif.requirement.assigned_to.name}
                      </span>
                    )}
                    {notif.type === "assigned" && notif.requirement?.added_by && (
                      <span className="notif-meta">
                        From {notif.requirement.added_by.name}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

