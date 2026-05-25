import React, { useState, useEffect } from "react";
import { api } from "../api";

export function TeamReportsPage() {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [userId, setUserId] = useState("");
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadReports();
  }, [workDate, userId]);

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
      let query = `work_date=${workDate}`;
      if (userId) {
        query += `&user_id=${userId}`;
      }
      const data = await api.allHourlyReports(query);
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="crm-page reports-page">
      <div className="page-header">
        <div>
          <h1>Team Hourly Reports</h1>
          <p>View what your team worked on by date and user.</p>
        </div>
        <div className="reports-actions">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="date-picker">
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="date-picker"
          />
        </div>
      </div>

      <div className="sheet-container">
        {loading ? (
          <div className="loading">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="loading">No reports found for this date.</div>
        ) : (
          <table className="sheet-table">
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
              {reports.map((row) => {
                const user = users.find(u => u.id === row.user_id);
                return (
                  <tr key={row.id}>
                    <td><strong>{user ? user.name : `User ${row.user_id}`}</strong></td>
                    <td>{row.start_time}</td>
                    <td>{row.end_time}</td>
                    <td>{row.description}</td>
                    <td>
                      <span className={`status-badge ${row.status.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .reports-page { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .page-header h1 { margin: 0; font-size: 24px; color: #0f172a; }
        .page-header p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
        .reports-actions { display: flex; gap: 12px; align-items: center; }
        .date-picker { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; background: #fff; }
        
        .sheet-container { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .sheet-table { width: 100%; border-collapse: collapse; text-align: left; }
        .sheet-table th { background: #f8fafc; padding: 12px 16px; font-size: 13px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
        .sheet-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; color: #0f172a; }
        
        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .status-badge.draft { background: #f1f5f9; color: #64748b; }
        .status-badge.saved { background: #fef3c7; color: #d97706; }
        .status-badge.submitted { background: #dcfce7; color: #166534; }
        
        .loading { padding: 40px; text-align: center; color: #64748b; }
      ` }} />
    </div>
  );
}
