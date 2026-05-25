import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ClipboardList } from "lucide-react";
import { api } from "../api";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell({ onNavigateToRequirements }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.myNotifications();
      setNotifications(data);
    } catch {
      // silently fail — don't interrupt the user
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

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
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    } catch {/* ignore */}
    setOpen(false);
    onNavigateToRequirements();
  };

  const handleMarkAll = async () => {
    try {
      await api.markAllNotificationsRead();
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
                  key={notif.id}
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
                    <span className="notif-subtitle">{notif.requirement?.title}</span>
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
