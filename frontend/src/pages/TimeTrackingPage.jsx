import React, { useMemo, useState } from "react";
import { Clock, RefreshCw, Search } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";

function secondsToLabel(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function dateTimeLabel(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateLabel(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.user_id) params.set("user_id", filters.user_id);
  return params.toString();
}

export function TimeTrackingPage({ mode = "my" }) {
  const isManage = mode === "users";
  const todayStr = new Date().toISOString().split("T")[0];
  const [filters, setFilters] = useState({ start: todayStr, end: todayStr, user_id: "" });
  const [appliedFilters, setAppliedFilters] = useState({ start: todayStr, end: todayStr, user_id: "" });
  const query = useMemo(() => buildQuery(appliedFilters), [appliedFilters]);
  const logs = useLoad(() => (isManage ? api.userTimeLogs(query) : api.myTimeLogs(query)), [isManage, query]);
  const users = useLoad(() => (isManage ? api.users() : Promise.resolve([])), [isManage]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="stack inquiries-page" style={{ padding: "0px 10px" }}>
      <div className="inquiry-command-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
            From
            <input type="date" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }} value={filters.start} onChange={(event) => setFilter("start", event.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
            To
            <input type="date" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }} value={filters.end} onChange={(event) => setFilter("end", event.target.value)} />
          </label>
          {isManage && (
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
              User
              <select style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }} value={filters.user_id} onChange={(event) => setFilter("user_id", event.target.value)}>
                <option value="">All users</option>
                {users.data.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="primary icon-button" onClick={() => setAppliedFilters(filters)} style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            <Search size={14} /> Search
          </button>
          <button type="button" className="secondary icon-button small-action" onClick={logs.reload} style={{ height: "30px", width: "30px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="data-grid">
        <div className="table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th>Date</th>
                {isManage && <th>User</th>}
                <th>In Time</th>
                <th>Out Time</th>
                <th>Break Time</th>
                <th>Work Time</th>
                <th>Status</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {logs.loading ? (
                <tr><td colSpan={isManage ? 8 : 7} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}><Clock size={20} /> Loading time logs...</td></tr>
              ) : logs.error ? (
                <tr><td colSpan={isManage ? 8 : 7} style={{ padding: "30px", textAlign: "center", color: "#dc2626" }}><Search size={20} /> {logs.error}</td></tr>
              ) : logs.data.length === 0 ? (
                <tr><td colSpan={isManage ? 8 : 7} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>No time logs found.</td></tr>
              ) : (
                logs.data.map((row) => (
                  <tr key={row.id}>
                    <td><span className="cell-text"><strong>{dateLabel(row.work_date)}</strong></span></td>
                    {isManage && <td><span className="cell-text">{row.user_name || `User #${row.user_id}`}</span></td>}
                    <td><span className="cell-text">{dateTimeLabel(row.login_at)}</span></td>
                    <td><span className="cell-text">{dateTimeLabel(row.logout_at)}</span></td>
                    <td><span className="cell-text">{secondsToLabel(row.total_break_seconds)}</span></td>
                    <td><span className="cell-text" style={{ fontWeight: "700" }}>{secondsToLabel(row.total_work_seconds)}</span></td>
                    <td><span className={`time-status ${row.status}`}>{row.status.replace("_", " ")}</span></td>
                    <td>
                      <span className="cell-text">
                        {row.login_latitude && row.login_longitude ? (
                          <a 
                            href={`https://www.google.com/maps?q=${row.login_latitude},${row.login_longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: "#176b5b", textDecoration: "underline", fontWeight: "700" }}
                          >
                            📍 View Map
                          </a>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .inquiry-command-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .row-actions { display: flex; align-items: center; gap: 8px; }

        .time-status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #e2e8f0; color: #334155; }
        .time-status.active { background: #dcfce7; color: #166534; }
        .time-status.on_break { background: #fef3c7; color: #92400e; }
        .time-status.completed { background: #dbeafe; color: #1d4ed8; }
      ` }} />
    </div>
  );
}
