import React, { useState, useEffect } from "react";
import { Clock, Calendar, Users, RefreshCw, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, ClipboardList, MapPin } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";

export function StrictComplianceLogsPage() {
  const notify = useNotify();
  const [activeTab, setActiveTab] = useState("compliance"); // compliance, locations
  const [reports, setReports] = useState([]);
  const [locationLogs, setLocationLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Track which user groups and task groups are expanded
  const [expandedUsers, setExpandedUsers] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});
  
  // Track expanded users for location logs
  const [expandedLocUsers, setExpandedLocUsers] = useState({});
  const [geoPermission, setGeoPermission] = useState("prompt"); // prompt, granted, denied

  useEffect(() => {
    // Load users on mount
    api.users()
      .then((data) => setUsers(data))
      .catch((err) => console.error("Failed to load users:", err));

    // Check geolocation permission state
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" })
        .then((result) => {
          setGeoPermission(result.state);
          result.onchange = () => {
            setGeoPermission(result.state);
          };
        })
        .catch(() => {});
    }
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      if (activeTab === "compliance") {
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
      } else {
        const data = await api.locationHistory({
          date: selectedDate,
          user_id: selectedUserId || undefined
        });
        setLocationLogs(data);
        
        // Auto-expand all location users by default
        const initialLocUsers = {};
        data.forEach((log) => {
          initialLocUsers[log.user_email || `user_${log.user_id}`] = true;
        });
        setExpandedLocUsers(initialLocUsers);
      }
    } catch (err) {
      console.error("Failed to load reports:", err);
      notify("Failed to load data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedDate, selectedUserId, activeTab]);

  const formatTime = (isoString) => {
    if (!isoString) return "—";
    try {
      let cleanStr = isoString;
      if (!cleanStr.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(cleanStr)) {
        cleanStr += "Z";
      }
      const dateObj = new Date(cleanStr);
      return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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

  const toggleLocUser = (userKey) => {
    setExpandedLocUsers(prev => ({
      ...prev,
      [userKey]: !prev[userKey]
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

  // Group location data: User -> Location logs
  const getGroupedLocations = () => {
    const groupedUsers = {};

    locationLogs.forEach((log) => {
      const userEmail = log.user_email || `user_${log.user_id}`;
      if (!groupedUsers[userEmail]) {
        groupedUsers[userEmail] = {
          userName: log.user_name || "Unknown Employee",
          userEmail: userEmail,
          logs: []
        };
      }
      groupedUsers[userEmail].logs.push(log);
    });

    return Object.values(groupedUsers);
  };

  const groupedData = getGroupedData();
  const groupedLocations = getGroupedLocations();

  return (
    <div className="strict-compliance-page" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "700", color: "#0f172a" }}>⏱️ Strict Compliance Tracking Log</h2>
          <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.875rem" }}>
            Monitor employee 30-minute progress reporting compliance and coordinate-change location history logs.
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: "16px", borderBottom: "2px solid #e2e8f0", paddingBottom: "1px" }}>
        <button
          onClick={() => setActiveTab("compliance")}
          style={{
            padding: "10px 20px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "compliance" ? "3px solid #3b82f6" : "3px solid transparent",
            color: activeTab === "compliance" ? "#1e40af" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "0.875rem",
            transition: "all 0.2s"
          }}
        >
          📋 Compliance Logs
        </button>
        <button
          onClick={() => setActiveTab("locations")}
          style={{
            padding: "10px 20px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "locations" ? "3px solid #3b82f6" : "3px solid transparent",
            color: activeTab === "locations" ? "#1e40af" : "#64748b",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "0.875rem",
            transition: "all 0.2s"
          }}
        >
          📍 Location Tracking History
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

      {geoPermission === "denied" && activeTab === "locations" && (
        <div style={{
          padding: "16px 20px",
          background: "#fff1f2",
          border: "1px solid #fecdd3",
          borderRadius: "8px",
          color: "#9f1239",
          fontSize: "0.875rem",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 1px 2px rgba(159, 18, 57, 0.05)"
        }}>
          <AlertTriangle size={18} />
          <span>
            Geolocation permission is blocked in your browser. Please click the site settings icon (lock icon) in the address bar, change Location to "Allow", and reload this page to start tracking and viewing employee movements.
          </span>
        </div>
      )}

      {/* Grouped Lists (Tab Conditional) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {loading ? (
          <div style={{ background: "#ffffff", borderRadius: "12px", padding: "40px", textAlign: "center", border: "1px solid #e2e8f0", color: "#64748b" }}>
            <RefreshCw size={24} className="spin" style={{ margin: "0 auto 12px auto", display: "block" }} /> Loading data...
          </div>
        ) : activeTab === "compliance" ? (
          /* Tab 1: Compliance Logs */
          groupedData.length === 0 ? (
            <div style={{ background: "#ffffff", borderRadius: "12px", padding: "40px", textAlign: "center", border: "1px solid #e2e8f0", color: "#64748b" }}>
              No progress reports found for the selected date and filters.
            </div>
          ) : (
            groupedData.map((userGroup) => {
              const isUserExpanded = expandedUsers[userGroup.userEmail];
              return (
                <div key={userGroup.userEmail} style={{ background: "#ffffff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
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

                  {isUserExpanded && (
                    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                      {Object.entries(userGroup.tasks).map(([taskTitle, reportsList]) => {
                        const taskKey = `${userGroup.userEmail}_${taskTitle}`;
                        const isTaskExpanded = expandedTasks[taskKey];
                        return (
                          <div key={taskTitle} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
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
          )
        ) : (
          /* Tab 2: Location History Tracking */
          groupedLocations.length === 0 ? (
            <div style={{ background: "#ffffff", borderRadius: "12px", padding: "40px", textAlign: "center", border: "1px solid #e2e8f0", color: "#64748b" }}>
              No location movement logs found for the selected date and filters.
            </div>
          ) : (
            groupedLocations.map((locGroup) => {
              const isLocExpanded = expandedLocUsers[locGroup.userEmail];
              return (
                <div key={locGroup.userEmail} style={{ background: "#ffffff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  <div 
                    onClick={() => toggleLocUser(locGroup.userEmail)}
                    style={{ padding: "16px 24px", background: "#f8fafc", borderBottom: isLocExpanded ? "1px solid #e2e8f0" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ background: "#10b981", color: "#ffffff", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.875rem" }}>
                        {locGroup.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700", color: "#0f172a" }}>{locGroup.userName}</h3>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{locGroup.userEmail}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <span style={{ background: "#ecfdf5", color: "#047857", padding: "4px 10px", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "600" }}>
                        {locGroup.logs.length} movements tracked
                      </span>
                      {isLocExpanded ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
                    </div>
                  </div>

                  {isLocExpanded && (
                    <div style={{ padding: "20px 24px" }}>
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                            <thead>
                              <tr style={{ background: "#fafafa", borderBottom: "1px solid #e2e8f0" }}>
                                <th style={{ padding: "12px 20px", color: "#64748b", fontWeight: "600" }}>Movement Log Time</th>
                                <th style={{ padding: "12px 20px", color: "#64748b", fontWeight: "600" }}>Coordinates</th>
                                <th style={{ padding: "12px 20px", color: "#64748b", fontWeight: "600" }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {locGroup.logs.map((log) => (
                                <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "12px 20px", color: "#1e293b", fontWeight: "500" }}>
                                    {formatTime(log.recorded_at)}
                                  </td>
                                  <td style={{ padding: "12px 20px", color: "#475569" }}>
                                    Latitude: <strong style={{ color: "#334155" }}>{log.latitude.toFixed(6)}</strong>, Longitude: <strong style={{ color: "#334155" }}>{log.longitude.toFixed(6)}</strong>
                                  </td>
                                  <td style={{ padding: "12px 20px" }}>
                                    <a
                                      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        padding: "6px 12px",
                                        borderRadius: "6px",
                                        background: "#eff6ff",
                                        color: "#1e40af",
                                        fontSize: "0.75rem",
                                        fontWeight: "700",
                                        textDecoration: "none",
                                        border: "1px solid #bfdbfe",
                                        cursor: "pointer",
                                        transition: "all 0.15s"
                                      }}
                                      onMouseOver={(e) => e.currentTarget.style.background = "#dbeafe"}
                                      onMouseOut={(e) => e.currentTarget.style.background = "#eff6ff"}
                                    >
                                      <MapPin size={12} /> View Location on Google Maps
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
