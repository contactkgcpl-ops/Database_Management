import React, { useState, useEffect, useMemo, useRef } from "react";
import { ClipboardList, Clock, Users, ArrowLeft, Calendar, ChevronDown, Check, RefreshCw, Activity, Heart, Shield } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function StaffReportPage() {
  const { user: currentUser } = useAuth();
  const hasTasksView = useMemo(() => currentUser?.permissions?.includes("tasks.view"), [currentUser]);
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [workDate, setWorkDate] = useState(() => {
    const today = new Date();
    // Return YYYY-MM-DD in local time zone
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - offset * 60 * 1000);
    return localToday.toISOString().split("T")[0];
  });
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
  }, [selectedUserIds, workDate]);

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
        work_date: workDate,
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
      setSelectedUserIds([]); // Deselect all
    } else {
      setSelectedUserIds(users.map((u) => u.id)); // Select all
    }
  };

  const handlePrevDay = () => {
    const current = new Date(workDate);
    current.setDate(current.getDate() - 1);
    setWorkDate(current.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const current = new Date(workDate);
    current.setDate(current.getDate() + 1);
    setWorkDate(current.toISOString().split("T")[0]);
  };

  const handleSetToday = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - offset * 60 * 1000);
    setWorkDate(localToday.toISOString().split("T")[0]);
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
    let healthy = 0;
    let overworked = 0;
    let idle = 0;

    reportData.forEach((u) => {
      totalHours += u.total_worked_hours;
      
      // Only count average efficiency for active users who worked hours today
      if (u.total_worked_hours > 0) {
        totalEffSum += u.daily_efficiency;
        effCount += 1;
      }
      
      if (u.workload_health === "Healthy") healthy += 1;
      else if (u.workload_health === "Overworked" || u.workload_health === "Critical Overtime") overworked += 1;
      else if (u.workload_health === "Idle") idle += 1;
    });

    const avgEfficiency = effCount > 0 ? round(totalEffSum / effCount, 1) : 100.0;

    return {
      totalHours: round(totalHours, 2),
      avgEfficiency,
      healthy,
      overworked,
      idle
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
      {/* Title Header */}
      <div className="report-title-header">
        <div className="title-left">
          <ClipboardList className="title-icon" size={28} />
          <div>
            <h1 className="report-title">Staff Daily Report</h1>
            <p className="report-subtitle">Overview of daily tasks worked, hours logged, and efficiency</p>
          </div>
        </div>
        <button type="button" onClick={loadReport} className="btn-refresh-report" title="Refresh Data">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

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
              <Users size={16} className="text-muted" />
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

          {/* Date Picker and Prev/Next Navigation */}
          <div className="date-picker-group-wrapper">
            <span className="filter-label">Work Date</span>
            <div className="date-navigation-controls">
              <button type="button" onClick={handlePrevDay} className="btn-date-step" title="Previous Day">
                &larr;
              </button>
              <div className="relative-date-input-wrapper">
                <input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="filter-date-input"
                />
                <Calendar size={15} className="date-picker-icon-label" />
              </div>
              <button type="button" onClick={handleNextDay} className="btn-date-step" title="Next Day">
                &rarr;
              </button>
              <button type="button" onClick={handleSetToday} className="btn-today-step">
                Today
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Summary Panels */}
      <div className="report-summary-cards-grid">
        <div className="summary-analytics-card">
          <div className="card-left bg-teal-soft">
            <Clock size={24} className="text-teal" />
          </div>
          <div className="card-right">
            <span className="metric-label">Team Hours Worked</span>
            <h2 className="metric-value">{teamMetrics.totalHours} <span className="value-unit">hrs</span></h2>
            <p className="metric-footer-text">Total hours logged across filtered staff</p>
          </div>
        </div>

        <div className="summary-analytics-card">
          <div className="card-left bg-blue-soft">
            <Activity size={24} className="text-blue" />
          </div>
          <div className="card-right">
            <span className="metric-label">Average Team Efficiency</span>
            <h2 className="metric-value" style={{ color: getEfficiencyColor(teamMetrics.avgEfficiency) }}>
              {teamMetrics.avgEfficiency}%
            </h2>
            <p className="metric-footer-text">ETA vs total actual hours tracked</p>
          </div>
        </div>

        <div className="summary-analytics-card">
          <div className="card-left bg-heart-soft">
            <Heart size={24} className="text-heart" />
          </div>
          <div className="card-right">
            <span className="metric-label">Workload Health Summary</span>
            <div className="workload-summary-footer-list">
              <span className="status-item-text text-green">Healthy: {teamMetrics.healthy}</span>
              <span className="status-item-text text-amber">Overworked: {teamMetrics.overworked}</span>
              <span className="status-item-text text-grey">Idle: {teamMetrics.idle}</span>
            </div>
            <p className="metric-footer-text">Classification of staff workload balance</p>
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
                    <span className="widget-metric-label">Working Hours</span>
                    <span className="widget-metric-value">{user.total_worked_hours} <span className="unit">hrs</span></span>
                  </div>
                  <div className="header-metric-widget border-left">
                    <span className="widget-metric-label">Daily Efficiency</span>
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
                ) : user.tasks.length === 0 ? (
                  <div className="no-tasks-logged-row">
                    <Clock size={16} className="text-muted" style={{ marginRight: "6px" }} />
                    No work hours logged by this staff member on this day.
                  </div>
                ) : (
                  <table className="staff-report-tasks-table">
                    <thead>
                      <tr>
                        <th>Task Details</th>
                        <th style={{ width: "120px" }}>Status</th>
                        <th style={{ width: "150px" }}>Hours Worked (Today)</th>
                        <th style={{ width: "120px" }}>Task ETA (Total)</th>
                        <th style={{ width: "120px" }}>Task Efficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.tasks.map((task) => (
                        <tr key={task.task_id} className={task.is_running ? "task-running-row" : ""}>
                          <td>
                            <div className="task-title-cell">
                              <span className="task-badge-pill">SB-{task.task_id}</span>
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
                          <td className="font-bold">{task.time_worked_today_hours} hrs</td>
                          <td>{task.eta_hours ? `${task.eta_hours} hrs` : "-"}</td>
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
          ))
        )}
      </div>

      {/* Styled definitions */}
      <style dangerouslySetInnerHTML={{ __html: `
        .staff-report-wrapper {
          padding: 24px;
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
          margin-bottom: 24px;
        }
        .title-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .title-icon {
          color: #176b5b;
        }
        .report-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .report-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
        .btn-refresh-report {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          color: #334155;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background-color 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .btn-refresh-report:hover {
          background-color: #f8fafc;
        }

        /* Filter Toolbar */
        .report-filter-bar {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .filters-left {
          display: flex;
          align-items: center;
          gap: 30px;
          flex-wrap: wrap;
        }
        .filter-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
          display: block;
        }

        /* User multi-select */
        .user-multiselect-container {
          position: relative;
          min-width: 200px;
        }
        .multiselect-trigger-btn {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
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
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
          z-index: 100;
          min-width: 250px;
          max-height: 280px;
          display: flex;
          flex-direction: column;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          font-size: 13px;
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
        }
        .dropdown-items-list {
          overflow-y: auto;
          flex: 1;
        }
        .dropdown-item input[type="checkbox"] {
          width: 15px;
          height: 15px;
          accent-color: #176b5b;
        }
        .check-indicator {
          margin-left: auto;
          color: #176b5b;
        }

        /* Date Navigation controls */
        .date-navigation-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-date-step {
          width: 32px;
          height: 32px;
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.15s;
        }
        .btn-date-step:hover {
          background-color: #f8fafc;
        }
        .relative-date-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .filter-date-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 30px 6px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          outline: none;
          height: 32px;
          box-sizing: border-box;
          background-color: #ffffff;
          cursor: pointer;
        }
        .date-picker-icon-label {
          position: absolute;
          right: 10px;
          color: #64748b;
          pointer-events: none;
        }
        .btn-today-step {
          height: 32px;
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

        /* Summary cards */
        .report-summary-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        .summary-analytics-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .card-left {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bg-teal-soft { background-color: #e2f0ed; }
        .text-teal { color: #176b5b; }
        .bg-blue-soft { background-color: #e0f2fe; }
        .text-blue { color: #0284c7; }
        .bg-heart-soft { background-color: #ffe4e6; }
        .text-heart { color: #e11d48; }
        
        .card-right {
          flex: 1;
        }
        .metric-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .metric-value {
          font-size: 24px;
          font-weight: 800;
          color: #1e293b;
          margin: 4px 0;
        }
        .value-unit {
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
        }
        .metric-footer-text {
          font-size: 11px;
          color: #94a3b8;
          margin: 0;
        }
        .workload-summary-footer-list {
          display: flex;
          gap: 8px;
          margin: 4px 0;
          flex-wrap: wrap;
        }
        .status-item-text {
          font-size: 12px;
          font-weight: 700;
          border-radius: 4px;
        }
        .text-green { color: #059669; }
        .text-amber { color: #d97706; }
        .text-grey { color: #64748b; }

        /* Report loader and empty states */
        .report-loader-panel {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 60px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          font-size: 15px;
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
          padding: 60px;
          text-align: center;
          font-size: 15px;
          font-weight: 600;
          color: #64748b;
        }

        /* Staff Report Cards List */
        .staff-report-cards-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .staff-report-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          overflow: hidden;
        }
        .staff-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #fafbfd;
          border-bottom: 1px solid #e2e8f0;
          padding: 16px 20px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .header-meta-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .avatar-dummy-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background-color: #176b5b;
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .staff-name-text {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 6px 0;
        }
        .staff-header-badges-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .badge-task-count {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .badge-task-count.completed { background-color: #eff6ff; color: #1e40af; }
        .badge-task-count.ongoing { background-color: #ecfdf5; color: #065f46; }
        .badge-task-count.pending { background-color: #f1f5f9; color: #475569; }
        
        .badge-workload {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
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
          padding: 0 16px;
        }
        .header-metric-widget.border-left {
          border-left: 1px solid #e2e8f0;
        }
        .widget-metric-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: right;
        }
        .widget-metric-value {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          text-align: right;
          margin-top: 4px;
        }
        .widget-metric-value .unit {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }

        .staff-card-body {
          padding: 20px;
        }
        .no-tasks-logged-row {
          padding: 16px;
          text-align: center;
          font-size: 13px;
          font-style: italic;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f8fafc;
          border-radius: 8px;
          border: 1px dashed #e2e8f0;
        }

        /* Tasks breakdown table */
        .staff-report-tasks-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
        }
        .staff-report-tasks-table th {
          color: #64748b;
          font-weight: 600;
          padding: 8px 12px;
          border-bottom: 1px solid #cbd5e1;
          background-color: #f8fafc;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .staff-report-tasks-table td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        .staff-report-tasks-table tr:last-child td {
          border-bottom: none;
        }
        .task-title-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .task-badge-pill {
          background-color: #f1f5f9;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
        }
        .task-title-name {
          font-weight: 600;
          color: #1e293b;
        }
        
        .task-status-text-pill {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 12px;
        }
        .task-status-text-pill.todo { background-color: #f1f5f9; color: #475569; }
        .task-status-text-pill.ongoing { background-color: #d1fae5; color: #065f46; }
        .task-status-text-pill.hold { background-color: #fef3c7; color: #92400e; }
        .task-status-text-pill.completed { background-color: #dbeafe; color: #1e40af; }

        .task-efficiency-badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
        }
        
        .font-bold {
          font-weight: 700;
        }
        
        .task-running-row {
          background-color: #f0fdf4 !important;
          border-left: 3px solid #10b981;
        }
        
        .active-now-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #d1fae5;
          color: #065f46;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          vertical-align: middle;
        }
        
        .pulse-dot {
          width: 6px;
          height: 6px;
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
            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      ` }} />
    </div>
  );
}
