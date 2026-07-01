import React, { useState, useEffect } from "react";
import { Clock, Calendar, Users, RefreshCw, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";

export function StrictComplianceLogsPage() {
  const notify = useNotify();
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Track which user groups and task groups are expanded
  const [expandedUsers, setExpandedUsers] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});

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
      
      // Auto-expand all users and tasks by default
      const initialUsers = {};
      const initialTasks = {};
      data.forEach((r) => {
        initialUsers[r.user_email] = true;
        const taskKey = `${r.user_email}_${r.task_title || r.custom_task_title || "Other Task"}`;
        initialTasks[taskKey] = true;
      });
      setExpandedUsers(initialUsers);
      setExpandedTasks(initialTasks);
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

  const toggleUser = (userEmail) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userEmail]: !prev[userEmail]
    }));
  };

  const toggleTask = (taskKey) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskKey]: !prev[taskKey]
    }));
  };

  // Group data: User -> Tasks -> Reports list
  const getGroupedData = () => {
    const groupedUsers = {};

    reports.forEach((report) => {
      const userEmail = report.user_email;
      if (!groupedUsers[userEmail]) {
        groupedUsers[userEmail] = {
          userName: report.user_name,
          userEmail: report.user_email,
          tasks: {},
          totalReports: 0
        };
      }

      const taskTitle = report.task_title || report.custom_task_title || "Other Task";
      if (!groupedUsers[userEmail].tasks[taskTitle]) {
        groupedUsers[userEmail].tasks[taskTitle] = [];
      }

      groupedUsers[userEmail].tasks[taskTitle].push(report);
      groupedUsers[userEmail].totalReports += 1;
    });

    return Object.values(groupedUsers);
  };

  const groupedData = getGroupedData();

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

      {/* Grouped Compliance Log List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {loading ? (
          <div style={{ background: "#ffffff", borderRadius: "12px", padding: "40px", textAlign: "center", border: "1px solid #e2e8f0", color: "#64748b" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px auto", display: "block" }} /> Loading compliance logs...
          </div>
        ) : groupedData.length === 0 ? (
          <div style={{ background: "#ffffff", borderRadius: "12px", padding: "40px", textAlign: "center", border: "1px solid #e2e8f0", color: "#64748b" }}>
            No progress reports found for the selected date and filters.
          </div>
        ) : (
          groupedData.map((userGroup) => {
            const isUserExpanded = expandedUsers[userGroup.userEmail];
            return (
              <div key={userGroup.userEmail} style={{ background: "#ffffff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {/* User Accordion Header */}
                <div 
                  onClick={() => toggleUser(userGroup.userEmail)}
                  style={{ padding: "16px 24px", background: "#f8fafc", borderBottom: isUserExpanded ? "1px solid #e2e8f0" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ background: "#3b82f6", color: "#ffffff", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.875rem" }}>
                      {userGroup.userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700", color: "#0f172a" }}>{userGroup.userName}</h3>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{userGroup.userEmail}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ background: "#eff6ff", color: "#1e40af", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "600" }}>
                      {userGroup.totalReports} reports submitted
                    </span>
                    {isUserExpanded ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
                  </div>
                </div>

                {/* User Expanded Content */}
                {isUserExpanded && (
                  <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                    {Object.entries(userGroup.tasks).map(([taskTitle, reportsList]) => {
                      const taskKey = `${userGroup.userEmail}_${taskTitle}`;
                      const isTaskExpanded = expandedTasks[taskKey];
                      return (
                        <div key={taskTitle} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                          {/* Task Accordion Header */}
                          <div 
                            onClick={() => toggleTask(taskKey)}
                            style={{ padding: "12px 20px", background: "#f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: isTaskExpanded ? "1px solid #e2e8f0" : "none", userSelect: "none" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#334155" }}>
                              <ClipboardList size={16} />
                              <span style={{ fontWeight: "700", fontSize: "0.875rem" }}>Planned Task: {taskTitle}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                {reportsList.length} updates
                              </span>
                              {isTaskExpanded ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                            </div>
                          </div>

                          {/* Task Expanded Progress Sub-Reports Table */}
                          {isTaskExpanded && (
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                                <thead>
                                  <tr style={{ background: "#fafafa", borderBottom: "1px solid #e2e8f0" }}>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>30-Min Progress Report</th>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>Next Planned Task</th>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>Due Time</th>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>Submitted At</th>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>Lateness</th>
                                    <th style={{ padding: "10px 16px", color: "#64748b", fontWeight: "600" }}>Banners/Alerts</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {reportsList.map((report) => {
                                    const isLate = report.late_minutes > 0;
                                    const hadReminders = report.reminders_sent > 0;
                                    return (
                                      <tr key={report.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "12px 16px", color: "#1e293b", whiteSpace: "pre-wrap", maxWidth: "300px" }}>
                                          {report.progress_description}
                                        </td>
                                        <td style={{ padding: "12px 16px", color: "#475569", maxWidth: "200px" }}>
                                          {report.next_task}
                                        </td>
                                        <td style={{ padding: "12px 16px", color: "#64748b" }}>
                                          {formatTime(report.due_at)}
                                        </td>
                                        <td style={{ padding: "12px 16px", color: "#64748b" }}>
                                          {formatTime(report.reported_at)}
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                          {isLate ? (
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "4px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.75rem", fontWeight: "600" }}>
                                              <Clock size={10} /> {report.late_minutes} min late
                                            </span>
                                          ) : (
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "4px", background: "#f0fdf4", color: "#166534", fontSize: "0.75rem", fontWeight: "600" }}>
                                              <CheckCircle size={10} /> On Time
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                          {hadReminders ? (
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 6px", borderRadius: "4px", background: "#fffbeb", color: "#b45309", fontSize: "0.75rem", fontWeight: "600" }}>
                                              <AlertTriangle size={10} /> {report.reminders_sent} warnings
                                            </span>
                                          ) : (
                                            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>None</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
