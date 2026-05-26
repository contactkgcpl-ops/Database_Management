import React, { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw } from "lucide-react";
import { api } from "../api";

export function TeamReportsPage() {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [userId, setUserId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ workDate: new Date().toISOString().split("T")[0], userId: "" });
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadReports();
  }, [appliedFilters]);

  const loadUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      let query = `work_date=${appliedFilters.workDate}`;
      if (appliedFilters.userId) {
        query += `&user_id=${appliedFilters.userId}`;
      }
      const data = await api.allHourlyReports(query);
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const groupedReports = useMemo(() => {
    const groups = {};
    for (const report of reports) {
      if (!groups[report.user_id]) {
        groups[report.user_id] = [];
      }
      groups[report.user_id].push(report);
    }
    return Object.values(groups).map(userReports => {
      return userReports.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
  }, [reports]);

  return (
    <div className="stack inquiries-page" style={{ padding: "0px 10px" }}>
      <div className="inquiry-command-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
            Work Date
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="filter-input"
              style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
            User
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="filter-input" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }}>
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary icon-button" onClick={() => setAppliedFilters({ workDate, userId })} style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            <Search size={14} /> Search
          </button>
          <button type="button" className="secondary icon-button small-action" onClick={loadReports} style={{ height: "30px", width: "30px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="data-grid">
        <div className="table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th style={{ width: "200px" }}>User</th>
                <th style={{ width: "120px" }}>Start Time</th>
                <th style={{ width: "120px" }}>End Time</th>
                <th>Work Description</th>
                <th style={{ width: "100px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading reports...</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>No reports found for this date.</td></tr>
              ) : (
                groupedReports.map((userReports) => {
                  const firstRow = userReports[0];
                  const user = users.find(u => u.id === firstRow.user_id);
                  return (
                    <React.Fragment key={`user-${firstRow.user_id}`}>
                      {userReports.map((row, index) => (
                        <tr key={row.id} className={row.status === "Submitted" ? "order-placed-row" : ""}>
                          {index === 0 && (
                            <td rowSpan={userReports.length} style={{ verticalAlign: 'top', borderRight: '1px solid #edf2f7', background: '#fff' }}>
                              <span className="cell-text"><strong>{user ? user.name : `User ${row.user_id}`}</strong></span>
                            </td>
                          )}
                          <td><span className="cell-text">{row.start_time}</span></td>
                          <td><span className="cell-text">{row.end_time}</span></td>
                          <td><span className="cell-text">{row.description}</span></td>
                          <td>
                            <span className={`status-badge ${row.status.toLowerCase()}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .inquiry-command-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .row-actions { display: flex; align-items: center; gap: 8px; }

        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .status-badge.draft { background: #f1f5f9; color: #64748b; }
        .status-badge.saved { background: #fef3c7; color: #d97706; }
        .status-badge.submitted { background: #dcfce7; color: #166534; }
      ` }} />
    </div>
  );
}
