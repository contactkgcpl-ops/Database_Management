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
  const [filters, setFilters] = useState({ start: "", end: "", user_id: "" });
  const query = useMemo(() => buildQuery(filters), [filters]);
  const logs = useLoad(() => (isManage ? api.userTimeLogs(query) : api.myTimeLogs(query)), [isManage, query]);
  const users = useLoad(() => (isManage ? api.users() : Promise.resolve([])), [isManage]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="crm-page time-tracking-page">
      <section className="time-head">
        <div>
          <h1>{isManage ? "User Time" : "My Time"}</h1>
          <p>Track in time, out time, break time, and productive work time.</p>
        </div>
        <button type="button" className="secondary icon-button" onClick={logs.reload}>
          <RefreshCw size={15} /> Refresh
        </button>
      </section>

      <section className="time-filters">
        <label>
          From
          <input type="date" value={filters.start} onChange={(event) => setFilter("start", event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.end} onChange={(event) => setFilter("end", event.target.value)} />
        </label>
        {isManage && (
          <label>
            User
            <select value={filters.user_id} onChange={(event) => setFilter("user_id", event.target.value)}>
              <option value="">All users</option>
              {users.data.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="time-table-wrap">
        {logs.loading ? (
          <div className="time-empty"><Clock size={20} /> Loading time logs...</div>
        ) : logs.error ? (
          <div className="time-empty error"><Search size={20} /> {logs.error}</div>
        ) : logs.data.length === 0 ? (
          <div className="time-empty"><Clock size={20} /> No time logs found.</div>
        ) : (
          <table className="time-table">
            <thead>
              <tr>
                <th>Date</th>
                {isManage && <th>User</th>}
                <th>In Time</th>
                <th>Out Time</th>
                <th>Break Time</th>
                <th>Work Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((row) => (
                <tr key={row.id}>
                  <td>{dateLabel(row.work_date)}</td>
                  {isManage && <td>{row.user_name || `User #${row.user_id}`}</td>}
                  <td>{dateTimeLabel(row.login_at)}</td>
                  <td>{dateTimeLabel(row.logout_at)}</td>
                  <td>{secondsToLabel(row.total_break_seconds)}</td>
                  <td>{secondsToLabel(row.total_work_seconds)}</td>
                  <td><span className={`time-status ${row.status}`}>{row.status.replace("_", " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        .time-tracking-page { padding: 22px; display: flex; flex-direction: column; gap: 18px; }
        .time-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .time-head h1 { margin: 0; font-size: 24px; color: #0f172a; }
        .time-head p { margin: 5px 0 0; color: #64748b; font-size: 13px; }
        .time-filters { display: grid; grid-template-columns: repeat(3, minmax(160px, 240px)); gap: 12px; align-items: end; }
        .time-filters label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; }
        .time-filters input, .time-filters select { border: 1px solid #d7dee8; border-radius: 8px; padding: 9px 10px; font: inherit; background: #fff; }
        .time-table-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .time-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .time-table th { text-align: left; padding: 12px 14px; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; }
        .time-table td { padding: 13px 14px; border-bottom: 1px solid #edf2f7; color: #1e293b; }
        .time-table tr:last-child td { border-bottom: 0; }
        .time-status { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 800; text-transform: capitalize; background: #e2e8f0; color: #334155; }
        .time-status.active { background: #dcfce7; color: #166534; }
        .time-status.on_break { background: #fef3c7; color: #92400e; }
        .time-status.completed { background: #dbeafe; color: #1d4ed8; }
        .time-empty { min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #64748b; font-weight: 700; }
        .time-empty.error { color: #dc2626; }
        @media (max-width: 760px) {
          .time-head { align-items: flex-start; flex-direction: column; }
          .time-filters { grid-template-columns: 1fr; }
          .time-table-wrap { overflow-x: auto; }
          .time-table { min-width: 760px; }
        }
      ` }} />
    </div>
  );
}
