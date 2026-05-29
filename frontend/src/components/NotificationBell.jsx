import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "../api";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const [reqData, taskData] = await Promise.all([
        api.myNotifications().catch(() => []),
        api.taskNotifications().catch(() => []),
      ]);
      const combined = [
        ...reqData.map((n) => ({ ...n, source: "requirement" })),
        ...taskData.map((n) => ({ ...n, source: "task" })),
      ];
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setNotifications(combined);
    } catch {
      // silently fail
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
      if (notif.source === "task") {
        await api.markTaskNotificationRead(notif.id);
        setNotifications((prev) => prev.filter((n) => !(n.id === notif.id && n.source === "task")));
        setOpen(false);
        if (onNavigate) onNavigate("tasks");
      } else {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) => prev.filter((n) => !(n.id === notif.id && n.source === "requirement")));
        setOpen(false);
        if (onNavigate) onNavigate("requirements");
      }
    } catch {/* ignore */}
  };

  const handleMarkAll = async () => {
    try {
      await Promise.all([
        api.markAllNotificationsRead().catch(() => {}),
        api.markAllTaskNotificationsRead().catch(() => {}),
      ]);
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
                      {notif.source === "task"
                        ? notif.message
                        : notif.type === "completed"
                        ? `Your requirement is done!`
                        : `New requirement assigned to you`}
                    </span>
                    <span className="notif-subtitle">
                      {notif.source === "task" ? notif.task_title : notif.requirement?.title}
                    </span>
                    {notif.source === "requirement" && notif.type === "completed" && notif.requirement?.assigned_to && (
                      <span className="notif-meta">
                        Completed by {notif.requirement.assigned_to.name}
                      </span>
                    )}
                    {notif.source === "requirement" && notif.type === "assigned" && notif.requirement?.added_by && (
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

