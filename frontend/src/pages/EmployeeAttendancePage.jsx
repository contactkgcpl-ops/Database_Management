import React, { useEffect, useState, useMemo } from "react";
import { 
  Calendar, 
  User, 
  Clock, 
  Filter, 
  Coffee, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Info,
  TrendingUp,
  Users,
  Search,
  ChevronDown
} from "lucide-react";
import { api } from "../api";

export function EmployeeAttendancePage() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ logs: [], summary: [] });
  const [activeTab, setActiveTab] = useState("logs"); // logs, summary

  // Initial Date Setup: starting from 2026-06-21 onwards
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    
    const minDateStr = "2026-06-21";
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    setFromDate(startStr < minDateStr ? minDateStr : startStr);
    setToDate(endStr < minDateStr ? minDateStr : endStr);
  }, []);

  // Fetch active users list
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const uList = await api.users();
        setUsers(uList || []);
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    fetchUsers();
  }, []);

  // Fetch attendance report
  const fetchReport = async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    try {
      const res = await api.attendanceReport({
        start: fromDate,
        end: toDate,
        user_id: selectedUserId || undefined
      });
      setData(res || { logs: [], summary: [] });
    } catch (err) {
      console.error("Failed to fetch attendance report", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedUserId, fromDate, toDate]);

  // Quick Date Selectors
  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    const minDateStr = "2026-06-21";
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    setFromDate(startStr < minDateStr ? minDateStr : startStr);
    setToDate(endStr < minDateStr ? minDateStr : endStr);
  };

  const handleFromDateChange = (val) => {
    const minDateStr = "2026-06-21";
    if (val && val < minDateStr) {
      setFromDate(minDateStr);
    } else {
      setFromDate(val);
    }
  };

  const handleToDateChange = (val) => {
    const minDateStr = "2026-06-21";
    if (val && val < minDateStr) {
      setToDate(minDateStr);
    } else {
      setToDate(val);
    }
  };

  // Helper: Format Time
  const formatTime = (isoString) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return "-";
    }
  };

  // Helper: Format Date
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  // Helper: Format Duration (seconds to hours & minutes)
  const formatDuration = (seconds) => {
    if (!seconds) return "0h 0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    const totalRecords = data.logs.length;
    if (selectedUserId) {
      // Find summary for the selected user
      const userSummary = data.summary.find(s => s.user_id === Number(selectedUserId));
      return {
        present: userSummary?.present_days || 0,
        leave: userSummary?.leave_days || 0,
        absent: userSummary?.absent_days || 0,
        sunday: userSummary?.sunday_days || 0,
        totalHours: userSummary?.total_work_hours || 0,
        avgHours: userSummary?.average_work_hours || 0,
      };
    } else {
      // Aggregate summary metrics across all users
      const totalUsers = data.summary.length;
      const totalPresent = data.summary.reduce((acc, s) => acc + s.present_days, 0);
      const totalLeave = data.summary.reduce((acc, s) => acc + s.leave_days, 0);
      const totalAbsent = data.summary.reduce((acc, s) => acc + s.absent_days, 0);
      const totalHours = data.summary.reduce((acc, s) => acc + s.total_work_hours, 0);
      const avgHours = totalUsers > 0 ? (totalHours / totalPresent || 0) : 0;
      
      return {
        totalUsers,
        present: totalPresent,
        leave: totalLeave,
        absent: totalAbsent,
        totalHours: Math.round(totalHours * 100) / 100,
        avgHours: Math.round(avgHours * 100) / 100,
      };
    }
  }, [data, selectedUserId]);

  const groupedLogs = useMemo(() => {
    const groups = {};
    data.logs.forEach(log => {
      if (!groups[log.work_date]) {
        groups[log.work_date] = [];
      }
      groups[log.work_date].push(log);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data.logs]);

  const renderStatusBadge = (status, leaveTitle) => {
    switch (status) {
      case "Present":
        return (
          <span className="badge badge-present">
            <CheckCircle2 size={13} className="mr-1" /> Present
          </span>
        );
      case "Leave":
        return (
          <span className="badge badge-leave" title={leaveTitle || "On Leave"}>
            <Calendar size={13} className="mr-1" /> On Leave
          </span>
        );
      case "Leave (Worked)":
        return (
          <span className="badge badge-leave-worked" title={leaveTitle || "Applied leave but logged in"}>
            <Clock size={13} className="mr-1" /> Leave (Worked)
          </span>
        );
      case "Sunday":
        return (
          <span className="badge badge-sunday">
            <Coffee size={13} className="mr-1" /> Sunday
          </span>
        );
      case "Unavailable":
      default:
        return (
          <span className="badge badge-unavailable">
            <XCircle size={13} className="mr-1" /> Unavailable
          </span>
        );
    }
  };

  return (
    <div className="attendance-page-container">
      {/* Title Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Attendance Grid</h1>
        </div>
      </div>

      {/* Modern Glassmorphic Filter Box */}
      <div className="filter-card">
        <div className="filter-grid">
          {/* User selector dropdown */}
          <div className="filter-group">
            <label className="filter-label">Employee</label>
            <div className="select-wrapper">
              <select 
                value={selectedUserId} 
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="filter-select"
              >
                <option value="">All Employees</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
              <ChevronDown className="select-icon" size={16} />
            </div>
          </div>

          {/* Date Picker From */}
          <div className="filter-group">
            <label className="filter-label">From Date</label>
            <div className="date-input-wrapper">
              <input 
                type="date" 
                value={fromDate}
                min="2026-06-21"
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="filter-date-input"
              />
            </div>
          </div>

          {/* Date Picker To */}
          <div className="filter-group">
            <label className="filter-label">To Date</label>
            <div className="date-input-wrapper">
              <input 
                type="date" 
                value={toDate}
                min="2026-06-21"
                onChange={(e) => handleToDateChange(e.target.value)}
                className="filter-date-input"
              />
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="filter-group">
            <label className="filter-label">Quick Presets</label>
            <div className="presets-row">
              <button onClick={() => setQuickRange(15)} className="preset-btn">Last 15d</button>
              <button onClick={() => setQuickRange(30)} className="preset-btn active">Last 30d</button>
              <button onClick={() => setQuickRange(60)} className="preset-btn">Last 60d</button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-header">
        <button 
          onClick={() => setActiveTab("logs")}
          className={`tab-btn ${activeTab === "logs" ? "active" : ""}`}
        >
          Daily Logs Grid
        </button>
        <button 
          onClick={() => setActiveTab("summary")}
          className={`tab-btn ${activeTab === "summary" ? "active" : ""}`}
        >
          Employee summaries
        </button>
      </div>

      {/* Table view */}
      {loading ? (
        <div className="loading-card">
          <div className="spinner"></div>
          <p className="loading-text">Generating attendance matrix...</p>
        </div>
      ) : activeTab === "logs" ? (
        <div className="table-card">
          <div className="table-responsive">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Login Time</th>
                  <th>Logout Time</th>
                  <th>Total Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {groupedLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-6 text-gray-500">
                      <AlertCircle className="mx-auto mb-2 text-gray-400" size={36} />
                      No attendance logs found in this period.
                    </td>
                  </tr>
                ) : (
                  groupedLogs.map(([dateStr, logs]) => (
                    logs.map((log, idx) => (
                      <tr key={`${log.user_id}-${log.work_date}-${idx}`}>
                        {idx === 0 && (
                          <td 
                            rowSpan={logs.length} 
                            className="font-semibold text-gray-900"
                            style={{ 
                              verticalAlign: 'middle', 
                              backgroundColor: '#f8fafc',
                              borderRight: '1px solid #e2e8f0',
                              fontWeight: 600
                            }}
                          >
                            {formatDate(dateStr)}
                          </td>
                        )}
                        <td className="font-semibold text-gray-900">{log.user_name}</td>
                        <td>{formatTime(log.login_at)}</td>
                        <td>
                          {log.login_at && !log.logout_at ? (
                            <span className="text-emerald font-semibold">Active</span>
                          ) : (
                            formatTime(log.logout_at)
                          )}
                        </td>
                        <td className="font-mono text-gray-700">{formatDuration(log.total_work_seconds)}</td>
                        <td>{renderStatusBadge(log.status, log.leave_title)}</td>
                      </tr>
                    ))
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="attendance-table text-center">
              <thead>
                <tr>
                  <th className="text-left">Employee Name</th>
                  <th>Total Days</th>
                  <th>Present Days</th>
                  <th>Leaves</th>
                  <th>Unavailable</th>
                  <th>Sundays</th>
                  <th>Total Worked Hours</th>
                  <th>Avg Hours/Day</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-6 text-gray-500">
                      <AlertCircle className="mx-auto mb-2 text-gray-400" size={36} />
                      No summary data found.
                    </td>
                  </tr>
                ) : (
                  data.summary.map((sum) => (
                    <tr key={sum.user_id}>
                      <td className="text-left font-semibold text-gray-900">{sum.user_name}</td>
                      <td className="font-mono">{sum.total_days}</td>
                      <td>
                        <span className="summary-val-badge badge-present-soft">
                          {sum.present_days}
                        </span>
                      </td>
                      <td>
                        <span className="summary-val-badge badge-leave-soft">
                          {sum.leave_days}
                        </span>
                      </td>
                      <td>
                        <span className="summary-val-badge badge-unavailable-soft">
                          {sum.absent_days}
                        </span>
                      </td>
                      <td className="font-mono text-gray-500">{sum.sunday_days}</td>
                      <td className="font-mono font-semibold text-gray-800">{sum.total_work_hours} hrs</td>
                      <td className="font-mono text-emerald font-semibold">{sum.average_work_hours} hrs</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Styled styles inside JSX to strictly respect design parameters and prevent CSS issues */}
      <style dangerouslySetInnerHTML={{__html: `
        .attendance-page-container {
          padding: 1rem 0;
          width: 100%;
          max-width: 100%;
          font-family: 'Outfit', 'Inter', sans-serif;
          color: #1e293b;
        }
        
        .page-header {
          margin-bottom: 1.25rem;
        }
        
        .page-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f172a;
          background: linear-gradient(135deg, #1e3a8a, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .filter-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(226, 232, 240, 0.8);
          border-radius: 1rem;
          padding: 1rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 20px -2px rgba(148, 163, 184, 0.08);
        }

        .filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.25rem;
          align-items: flex-end;
        }
        
        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .filter-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .select-wrapper {
          position: relative;
        }
        
        .filter-select, .filter-date-input {
          width: 100%;
          padding: 0.625rem 2.5rem 0.625rem 1rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          background: #ffffff;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.2s;
          appearance: none;
          color: #334155;
        }
        
        .filter-date-input {
          padding-right: 1rem;
        }
        
        .filter-select:focus, .filter-date-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        
        .select-icon {
          position: absolute;
          right: 0.875rem;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          pointer-events: none;
        }
        
        .presets-row {
          display: flex;
          gap: 0.375rem;
        }
        
        .preset-btn {
          flex: 1;
          padding: 0.625rem 0.5rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        
        .preset-btn:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        
        .preset-btn.active {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #2563eb;
          font-weight: 600;
        }

        .tabs-header {
          display: flex;
          gap: 1rem;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 1.5rem;
        }
        
        .tab-btn {
          padding: 0.75rem 1.25rem;
          background: transparent;
          border: none;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }
        
        .tab-btn:hover {
          color: #1e293b;
        }
        
        .tab-btn.active {
          color: #2563eb;
        }
        
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 2px;
          background: #3b82f6;
        }
        
        .table-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          box-shadow: 0 4px 20px -2px rgba(148, 163, 184, 0.04);
          overflow: hidden;
        }
        
        .table-responsive {
          overflow-x: auto;
          width: 100%;
        }
        
        .attendance-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        
        .attendance-table th {
          background: #f8fafc;
          padding: 1rem 1.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .attendance-table td {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.875rem;
          color: #334155;
          vertical-align: middle;
        }
        
        .attendance-table tbody tr:hover {
          background: #f8fafc;
        }
        
        .attendance-table tr:last-child td {
          border-bottom: none;
        }
        
        /* Badges styles */
        .badge {
          display: inline-flex;
          align-items: center;
          padding: 0.375rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1;
        }
        
        .badge-present {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        
        .badge-leave {
          background: #eff6ff;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }
        
        .badge-leave-worked {
          background: #faf5ff;
          color: #5b21b6;
          border: 1px solid #e9d5ff;
        }
        
        .badge-sunday {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        
        .badge-unavailable {
          background: #fee2e2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
          font-weight: 700;
        }
        
        /* Summary value Soft Badges */
        .summary-val-badge {
          display: inline-block;
          min-width: 1.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
          font-family: monospace;
          font-weight: 700;
          font-size: 0.8125rem;
        }
        
        .badge-present-soft { background: #d1fae5; color: #065f46; }
        .badge-leave-soft { background: #dbeafe; color: #1e40af; }
        .badge-unavailable-soft { background: #fee2e2; color: #b91c1c; }
        
        .text-center { text-align: center !important; }
        .text-left { text-align: left !important; }
        .py-6 { padding-top: 1.5rem; padding-bottom: 1.5rem; }
        .mr-1 { margin-right: 0.25rem; }
        .mb-2 { margin-bottom: 0.5rem; }
        
        .font-mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        
        .loading-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 5rem 2rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
        }
        
        .spinner {
          width: 2.5rem;
          height: 2.5rem;
          border: 3px solid #e2e8f0;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .loading-text {
          margin-top: 1rem;
          color: #64748b;
          font-size: 0.875rem;
        }
      `}} />
    </div>
  );
}
