import React, { useState, useEffect } from "react";
import { Clock, Calendar, Users, RefreshCw, AlertTriangle, CheckCircle, Search } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";

export function StrictComplianceLogsPage() {
  const notify = useNotify();
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load users on mount
    api.users()
      .then((data) => setUsers(data))
      .catch((err) => console.error("Failed to load users:", err));
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await api.strictProgressReports({
        date: selectedDate,
        user_id: selectedUserId || undefined
      });
      setReports(data);
    } catch (err) {
      console.error("Failed to load compliance reports:", err);
      notify("Failed to load compliance reports.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedDate, selectedUserId]);

  const formatTime = (isoString) => {
    if (!isoString) return "—";
    try {
      let cleanStr = isoString;
      if (!cleanStr.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(cleanStr)) {
        cleanStr += "Z";
      }
      const dateObj = new Date(cleanStr);
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return "—";
    }
  };

  return (
    <div className="strict-compliance-page" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>⏱️ Strict Compliance Tracking Log</h2>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.875rem" }}>
            Monitor employee 30-minute progress reporting compliance, alerts count, and submission lateness.
          </p>
        </div>
        <button
          onClick={loadReports}
          disabled={loading}
          className="secondary"
          style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px" }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>

      {/* Filters card */}
      <div style={{ background: "#ffffff", borderRadius: "12px", padding: "18px 24px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
          <label style={{ fontSize: "0.75rem", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
            <Calendar size={12} style={{ marginRight: "4px" }} /> Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.875rem" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
          <label style={{ fontSize: "0.75rem", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>
            <Users size={12} style={{ marginRight: "4px" }} /> Filter By Employee
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.875rem", background: "#ffffff" }}
          >
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Display Grid / Table */}
      <div style={{ background: "#ffffff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Employee</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Task Worked On</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Progress Report Details</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Next Planned Task</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Due Time</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Submission</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Lateness</th>
                <th style={{ padding: "14px 20px", color: "#475569", fontWeight: "600" }}>Alerts Sent</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                    <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px auto", display: "block" }} /> Loading compliance logs...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                    No progress reports found for the selected date and filters.
                  </td>
                </tr>
              ) : (
                reports.map((report) => {
                  const isLate = report.late_minutes > 0;
                  const hadReminders = report.reminders_sent > 0;
                  
                  return (
                    <tr key={report.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                      <td style={{ padding: "16px 20px", fontWeight: "500", color: "#0f172a" }}>
                        <span style={{ display: "block" }}>{report.user_name}</span>
                        <small style={{ color: "#64748b", fontSize: "0.75rem" }}>{report.user_email}</small>
                      </td>
                      <td style={{ padding: "16px 20px", color: "#334155", maxWidth: "200px" }}>
                        <strong>{report.task_title || report.custom_task_title || "—"}</strong>
                      </td>
                      <td style={{ padding: "16px 20px", color: "#334155", whiteSpace: "pre-wrap", maxWidth: "250px" }}>
                        {report.progress_description}
                      </td>
                      <td style={{ padding: "16px 20px", color: "#334155", maxWidth: "200px" }}>
                        {report.next_task}
                      </td>
                      <td style={{ padding: "16px 20px", color: "#475569" }}>
                        {formatTime(report.due_at)}
                      </td>
                      <td style={{ padding: "16px 20px", color: "#475569" }}>
                        {formatTime(report.reported_at)}
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        {isLate ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.75rem", fontWeight: "600" }}>
                            <Clock size={12} /> {report.late_minutes} min late
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#166534", fontSize: "0.75rem", fontWeight: "600" }}>
                            <CheckCircle size={12} /> On Time
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        {hadReminders ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", background: "#fffbeb", color: "#b45309", fontSize: "0.75rem", fontWeight: "600" }}>
                            <AlertTriangle size={12} /> {report.reminders_sent} warnings
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
