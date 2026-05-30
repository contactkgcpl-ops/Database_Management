import React, { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardList, Clock, Users, ArrowLeft, Calendar, ChevronDown, Check, RefreshCw, Activity, Heart, Shield } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function StaffReportPage({ setPage, setTaskDetailId }) {
  const { user: currentUser } = useAuth();
  const hasTasksView = useMemo(() => currentUser?.permissions?.includes("tasks.view"), [currentUser]);
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const handleTaskClick = (taskId) => {
    if (setTaskDetailId && setPage) {
      setTaskDetailId(taskId);
      setPage("tasks");
    }
  };

  const getLocalDateStr = (d = new Date()) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().split("T")[0];
  };

  const formatLocalTime = (isoStr) => {
    if (!isoStr) return "-";
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatHoursToDuration = (hours) => {
    if (!hours || isNaN(hours) || hours <= 0) return "0m";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const [startDate, setStartDate] = useState(getLocalDateStr);
  const [endDate, setEndDate] = useState(getLocalDateStr);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadUsers();

    // Close dropdown on click outside
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadReport();
  }, [selectedUserIds, startDate, endDate]);

  const loadUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users", err);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {
        start_date: startDate,
        end_date: endDate,
      };
      if (selectedUserIds.length > 0) {
        params.user_ids = selectedUserIds.join(",");
      }
      const data = await api.staffReport(params);
      setReportData(data);
    } catch (err) {
      console.error("Failed to load staff report", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAllUsers = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map((u) => u.id));
    }
  };

  const handleSetToday = () => {
    const todayStr = getLocalDateStr();
    setStartDate(todayStr);
    setEndDate(todayStr);
  };

  const handleSetThisWeek = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    setStartDate(getLocalDateStr(sevenDaysAgo));
    setEndDate(getLocalDateStr(today));
  };

  const handleSetThisMonth = () => {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(getLocalDateStr(firstOfMonth));
    setEndDate(getLocalDateStr(today));
  };

  // Custom User Filter dropdown display text
  const userFilterLabel = useMemo(() => {
    if (selectedUserIds.length === 0 || selectedUserIds.length === users.length) {
      return "All Staff";
    }
    if (selectedUserIds.length === 1) {
      const u = users.find((u) => u.id === selectedUserIds[0]);
      return u ? u.name : "1 Selected";
    }
    return `${selectedUserIds.length} Staff Selected`;
  }, [selectedUserIds, users]);

  // Analytics Calculations
  const teamMetrics = useMemo(() => {
    let totalHours = 0;
    let totalEffSum = 0;
    let effCount = 0;

    reportData.forEach((u) => {
      totalHours += u.total_worked_hours;

      if (u.total_worked_hours > 0) {
        totalEffSum += u.daily_efficiency;
        effCount += 1;
      }
    });

    const avgEfficiency = effCount > 0 ? round(totalEffSum / effCount, 1) : 100.0;

    return {
      totalHours: round(totalHours, 2),
      avgEfficiency
    };
  }, [reportData]);

  function round(val, precision) {
    const multiplier = Math.pow(10, precision || 0);
    return Math.round(val * multiplier) / multiplier;
  }

  function getEfficiencyColor(eff) {
    if (eff >= 100) return "#059669"; // green
    if (eff >= 70) return "#d97706"; // amber
    return "#dc2626"; // red
  }

  function getWorkloadBadgeClass(status) {
    switch (status) {
      case "Healthy":
        return "badge-workload workload-healthy";
      case "Overworked":
        return "badge-workload workload-overworked";
      case "Critical Overtime":
        return "badge-workload workload-critical";
      case "Idle":
        return "badge-workload workload-idle";
      default:
        return "badge-workload";
    }
  }

  return (
    <div className="staff-report-wrapper">
      {/* Filter Toolbar */}
      <div className="report-filter-bar">
        <div className="filters-left">
          {/* Multi-select User Dropdown */}
          <div className="user-multiselect-container" ref={dropdownRef}>
            <span className="filter-label">Filter Staff</span>
            <button
              type="button"
              className="multiselect-trigger-btn"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <Users size={14} className="text-muted" />
              <span>{userFilterLabel}</span>
              <ChevronDown size={14} className="dropdown-chevron" />
            </button>
            {showUserDropdown && (
              <div className="multiselect-dropdown-menu">
                <label className="dropdown-item select-all-item">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.length === users.length && users.length > 0}
                    onChange={handleSelectAllUsers}
                  />
                  <strong>Select All</strong>
                </label>
                <div className="dropdown-items-list">
                  {users.map((u) => (
                    <label key={u.id} className="dropdown-item">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => handleToggleUser(u.id)}
                      />
                      <span>{u.name}</span>
                      {selectedUserIds.includes(u.id) && <Check size={14} className="check-indicator" />}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date Picker Range */}
          <div className="date-picker-range-wrapper">
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div>
                <span className="filter-label">Start Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="filter-date-input"
                />
              </div>
              <div>
                <span className="filter-label">End Date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="filter-date-input"
                />
              </div>
            </div>
          </div>

          {/* Quick Ranges */}
          <div className="quick-ranges-group">
            <span className="filter-label">Quick Select</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" onClick={handleSetToday} className="btn-today-step">
                Today
              </button>
              <button type="button" onClick={handleSetThisWeek} className="btn-today-step">
                7 Days
              </button>
              <button type="button" onClick={handleSetThisMonth} className="btn-today-step">
                This Month
              </button>
            </div>
          </div>
        </div>

        <button type="button" onClick={loadReport} className="btn-refresh-report" title="Refresh Data">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Analytics Summary Panels */}
      <div className="report-summary-cards-grid">
        <div className="summary-analytics-card">
          <div className="card-left bg-teal-soft">
            <Clock size={20} className="text-teal" />
          </div>
          <div className="card-right">
            <span className="metric-label">Team Hours Worked</span>
            <h2 className="metric-value">{formatHoursToDuration(teamMetrics.totalHours)}</h2>
            <p className="metric-footer-text">Total hours logged across filtered staff</p>
          </div>
        </div>

        <div className="summary-analytics-card">
          <div className="card-left bg-blue-soft">
            <Activity size={20} className="text-blue" />
          </div>
          <div className="card-right">
            <span className="metric-label">Average Team Efficiency</span>
            <h2 className="metric-value" style={{ color: getEfficiencyColor(teamMetrics.avgEfficiency) }}>
              {teamMetrics.avgEfficiency}%
            </h2>
            <p className="metric-footer-text">ETA vs total actual hours tracked</p>
          </div>
        </div>
      </div>

      {/* Report Staff List */}
      <div className="staff-report-cards-list">
        {loading ? (
          <div className="report-loader-panel">
            <RefreshCw size={24} className="spinner-icon" />
            <span>Loading staff reports...</span>
          </div>
        ) : reportData.length === 0 ? (
          <div className="report-empty-panel">
            <span>No active staff members found matching selected filters.</span>
          </div>
        ) : (
          reportData.map((user) => (
            <div key={user.user_id} className="staff-report-card">
              {/* Card Header Bar */}
              <div className="staff-card-header">
                <div className="header-meta-left">
                  <div className="avatar-dummy-circle">
                    {user.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="staff-name-text">{user.user_name}</h3>
                    <div className="staff-header-badges-row">
                      <span className="badge-task-count completed">
                        Completed: {user.completed_count}
                      </span>
                      <span className="badge-task-count ongoing">
                        In Progress: {user.inprogress_count}
                      </span>
                      <span className="badge-task-count pending">
                        Pending: {user.pending_count}
                      </span>
                      <span className={getWorkloadBadgeClass(user.workload_health)}>
                        {user.workload_health}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="header-metrics-right">
                  <div className="header-metric-widget">
                    <span className="widget-metric-label">System Login</span>
                    <span className="widget-metric-value">{formatHoursToDuration(user.total_login_hours)}</span>
                  </div>
                  <div className="header-metric-widget border-left">
                    <span className="widget-metric-label">Working Hours</span>
                    <span className="widget-metric-value">{formatHoursToDuration(user.total_worked_hours)}</span>
                  </div>
                  <div className="header-metric-widget border-left">
                    <span className="widget-metric-label">Break Time</span>
                    <span className="widget-metric-value">{formatHoursToDuration(user.total_break_hours)}</span>
                  </div>
                  <div
                    className="header-metric-widget border-left"
                    style={{ cursor: "help" }}
                    title={`Efficiency Breakdown:\n• Time Utilization (30% weight): ${user.eff_time_utilization || 0}%\n• Completion Rate (30% weight): ${user.eff_completion_rate || 0}%\n• Task Speed (40% weight): ${user.eff_task_efficiency || 0}%`}
                  >
                    <span className="widget-metric-label">Avg Efficiency</span>
                    <span
                      className="widget-metric-value"
                      style={{ color: getEfficiencyColor(user.daily_efficiency) }}
                    >
                      {user.daily_efficiency}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Task Breakdown Table */}
              <div className="staff-card-body">
                {!hasTasksView ? (
                  <div className="no-tasks-logged-row" style={{ color: "#dc2626", border: "1px dashed #fee2e2", backgroundColor: "#fff5f5" }}>
                    <Shield size={16} style={{ marginRight: "6px" }} />
                    You do not have permission to view detailed task breakdown.
                  </div>
                ) : !user.days || user.days.length === 0 ? (
                  <div className="no-tasks-logged-row">
                    <Clock size={16} className="text-muted" style={{ marginRight: "6px" }} />
                    No work hours logged by this staff member in this date range.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {user.days.map((day) => (
                      <div key={day.date} className="staff-report-day-block">
                        <div className="staff-report-day-header">
                          <div className="day-header-left">
                            <Calendar size={13} style={{ color: "#64748b" }} />
                            <span>
                              {new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {day.login_time && (
                              <span className="day-attendance-badge">
                                <Clock size={11} style={{ marginRight: "2px" }} />
                                {formatLocalTime(day.login_time)} - {day.logout_time ? formatLocalTime(day.logout_time) : "Active"}
                              </span>
                            )}
                          </div>
                          <div className="day-header-right">
                            <span>System Login: <strong>{formatHoursToDuration(day.total_login_hours)}</strong></span>
                            <span style={{ marginLeft: "12px" }}>Break Time: <strong>{formatHoursToDuration(day.total_break_hours)}</strong></span>
                            <span style={{ marginLeft: "12px" }}>Task Worked: <strong>{formatHoursToDuration(day.worked_hours)}</strong></span>
                            <span
                              style={{ color: getEfficiencyColor(day.daily_efficiency), marginLeft: "12px", cursor: "help" }}
                              title={`Daily Efficiency Breakdown:\n• Time Utilization (30% weight): ${day.eff_time_utilization || 0}%\n• Completion Rate (30% weight): ${day.eff_completion_rate || 0}%\n• Task Speed (40% weight): ${day.eff_task_efficiency || 0}%`}
                            >
                              Efficiency: <strong>{day.daily_efficiency}%</strong>
                            </span>
                          </div>
                        </div>
                        <div className="day-tasks-container">
                          {day.tasks.length === 0 ? (
                            <div style={{ padding: "8px", fontSize: "12px", fontStyle: "italic", color: "#64748b", textAlign: "center" }}>
                              No active tasks logged on this day.
                            </div>
                          ) : (
                            <table className="staff-report-tasks-table">
                              <thead>
                                <tr>
                                  <th>Task Details</th>
                                  <th style={{ width: "100px" }}>Status</th>
                                  <th style={{ width: "120px" }}>Hours Worked</th>
                                  <th style={{ width: "100px" }}>Task ETA</th>
                                  <th style={{ width: "110px" }}>Task Efficiency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {day.tasks.map((task) => (
                                  <tr
                                    key={task.task_id}
                                    className={`clickable-task-row ${task.is_running ? "task-running-row" : ""}`}
                                    onClick={() => handleTaskClick(task.task_id)}
                                    title="Click to view task details"
                                  >
                                    <td>
                                      <div className="task-title-cell">
                                        <span className="task-badge-pill">SAL-{task.task_id}</span>
                                        <span className="task-title-name">
                                          {task.task_title}
                                          {task.is_running && (
                                            <span className="active-now-badge" style={{ marginLeft: "8px" }}>
                                              <span className="pulse-dot"></span>
                                              Active Now
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </td>
                                    <td>
                                      <span className={`task-status-text-pill ${task.status.toLowerCase()}`}>
                                        {task.status === "Ongoing" ? "In Progress" : task.status === "Hold" ? "On Hold" : task.status}
                                      </span>
                                    </td>
                                    <td className="font-bold">{formatHoursToDuration(task.time_worked_today_hours)}</td>
                                    <td>{task.eta_hours ? formatHoursToDuration(task.eta_hours) : "-"}</td>
                                    <td>
                                      <span
                                        className="task-efficiency-badge"
                                        style={{
                                          backgroundColor: `${getEfficiencyColor(task.efficiency_percent)}15`,
                                          color: getEfficiencyColor(task.efficiency_percent),
                                          border: `1px solid ${getEfficiencyColor(task.efficiency_percent)}30`
                                        }}
                                      >
                                        {task.efficiency_percent}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Styled definitions */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .staff-report-wrapper {
          padding: 10px 15px;
          background-color: #f8fafc;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #334155;
        }
 
        /* Title Header */
        .report-title-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .title-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .title-icon {
          color: #176b5b;
        }
        .report-title {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
 
        /* Filter Toolbar */
        .report-filter-bar {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 12px;
        }
        .filters-left {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .filter-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
          display: block;
        }
 
        /* User multi-select */
        .user-multiselect-container {
          position: relative;
          min-width: 180px;
        }
        .multiselect-trigger-btn {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0 10px;
          height: 34px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .multiselect-trigger-btn:hover {
          border-color: #94a3b8;
        }
        .dropdown-chevron {
          color: #64748b;
        }
        .multiselect-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          z-index: 100;
          width: 220px;
          max-height: 250px;
          display: flex;
          flex-direction: column;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          font-size: 12px;
          color: #334155;
          cursor: pointer;
          transition: background-color 0.15s;
          user-select: none;
        }
        .dropdown-item:hover {
          background-color: #f1f5f9;
        }
        .select-all-item {
          border-bottom: 1px solid #f1f5f9;
          background-color: #f8fafc;
          padding: 8px 12px;
        }
        .dropdown-items-list {
          overflow-y: auto;
          flex: 1;
        }
        .dropdown-item input[type="checkbox"] {
          width: 14px;
          height: 14px;
          accent-color: #176b5b;
        }
        .check-indicator {
          margin-left: auto;
          color: #176b5b;
        }
 
        /* Date Inputs */
        .filter-date-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          outline: none;
          height: 34px;
          box-sizing: border-box;
          background-color: #ffffff;
          cursor: pointer;
        }
        .btn-today-step {
          height: 34px;
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          color: #176b5b;
          cursor: pointer;
          transition: background-color 0.15s;
        }
        .btn-today-step:hover {
          background-color: #e2f0ed;
        }
 
        .btn-refresh-report {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          color: #334155;
          padding: 0 14px;
          height: 34px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .btn-refresh-report:hover {
          background-color: #f8fafc;
        }
 
        /* Summary cards */
        .report-summary-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }
        .summary-analytics-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .card-left {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bg-teal-soft { background-color: #e2f0ed; }
        .text-teal { color: #176b5b; }
        .bg-blue-soft { background-color: #e0f2fe; }
        .text-blue { color: #0284c7; }
        
        .card-right {
          flex: 1;
        }
        .metric-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .metric-value {
          font-size: 20px;
          font-weight: 800;
          color: #1e293b;
          margin: 2px 0;
        }
        .value-unit {
          font-size: 13px;
          font-weight: 500;
          color: #64748b;
        }
        .metric-footer-text {
          font-size: 11px;
          color: #94a3b8;
          margin: 0;
        }
 
        /* Report loader and empty states */
        .report-loader-panel {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
        }
        .spinner-icon {
          animation: spin 1s linear infinite;
          color: #176b5b;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .report-empty-panel {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
        }
 
        /* Staff Report Cards List */
        .staff-report-cards-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .staff-report-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          overflow: hidden;
        }
        .staff-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #fafbfd;
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 15px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .header-meta-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .avatar-dummy-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: #176b5b;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .staff-name-text {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 2px 0;
        }
        .staff-header-badges-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .badge-task-count {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 4px;
        }
        .badge-task-count.completed { background-color: #eff6ff; color: #1e40af; }
        .badge-task-count.ongoing { background-color: #ecfdf5; color: #065f46; }
        .badge-task-count.pending { background-color: #f1f5f9; color: #475569; }
        
        .badge-workload {
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 12px;
          text-transform: uppercase;
        }
        .workload-healthy { background-color: #d1fae5; color: #065f46; }
        .workload-overworked { background-color: #fef3c7; color: #92400e; }
        .workload-critical { background-color: #fee2e2; color: #991b1b; }
        .workload-idle { background-color: #f1f5f9; color: #475569; }
 
        .header-metrics-right {
          display: flex;
          align-items: center;
        }
        .header-metric-widget {
          display: flex;
          flex-direction: column;
          padding: 0 12px;
        }
        .header-metric-widget.border-left {
          border-left: 1px solid #e2e8f0;
        }
        .widget-metric-label {
          font-size: 9px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: right;
        }
        .widget-metric-value {
          font-size: 16px;
          font-weight: 800;
          color: #1e293b;
          text-align: right;
          margin-top: 2px;
        }
        .widget-metric-value .unit {
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
        }
 
        .staff-card-body {
          padding: 12px 15px;
        }
        .no-tasks-logged-row {
          padding: 12px;
          text-align: center;
          font-size: 12px;
          font-style: italic;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f8fafc;
          border-radius: 6px;
          border: 1px dashed #e2e8f0;
        }
 
        /* Day block container */
        .staff-report-day-block {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          background-color: #ffffff;
        }
        .staff-report-day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f8fafc;
          padding: 6px 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .day-header-left {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .day-attendance-badge {
          display: inline-flex;
          align-items: center;
          background-color: #e2f0ed;
          color: #176b5b;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 10px;
          border: 1px solid #c3e2dc;
        }
        .day-header-right {
          font-size: 11px;
          color: #475569;
        }
        .day-tasks-container {
          padding: 6px 12px;
        }
 
        /* Tasks breakdown table */
        .staff-report-tasks-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: left;
        }
        .staff-report-tasks-table th {
          color: #64748b;
          font-weight: 600;
          padding: 6px 8px;
          border-bottom: 1px solid #cbd5e1;
          background-color: #f8fafc;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .staff-report-tasks-table td {
          padding: 6px 8px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .staff-report-tasks-table tr:last-child td {
          border-bottom: none;
        }
        .task-title-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .task-badge-pill {
          background-color: #f1f5f9;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #cbd5e1;
        }
        .task-title-name {
          font-weight: 600;
          color: #1e293b;
        }
        
        .task-status-text-pill {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 10px;
        }
        .task-status-text-pill.todo { background-color: #f1f5f9; color: #475569; }
        .task-status-text-pill.ongoing { background-color: #d1fae5; color: #065f46; }
        .task-status-text-pill.hold { background-color: #fef3c7; color: #92400e; }
        .task-status-text-pill.completed { background-color: #dbeafe; color: #1e40af; }
 
        .task-efficiency-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
        }
        
        .font-bold {
          font-weight: 700;
        }
        
        .task-running-row {
          border-left: 3px solid #10b981;
        }
        .task-running-row td {
          background-color: #e6f7f3 !important;
        }
        .clickable-task-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .clickable-task-row:hover td {
          background-color: #f1f5f9 !important;
        }
        .clickable-task-row.task-running-row:hover td {
          background-color: #d1fae5 !important;
        }
        
        .active-now-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background-color: #d1fae5;
          color: #065f46;
          font-size: 9px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          vertical-align: middle;
        }
        
        .pulse-dot {
          width: 5px;
          height: 5px;
          background-color: #10b981;
          border-radius: 50%;
          display: inline-block;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse 1.2s infinite;
        }
        
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      ` }} />
    </div>
  );
} // End of StaffReportPage component

