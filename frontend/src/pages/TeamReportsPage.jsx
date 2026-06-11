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
  const [expandedReportIds, setExpandedReportIds] = useState({});

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

  const toggleExpandReport = (id) => {
    setExpandedReportIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getWorkTypeBadgeStyle = (workType) => {
    const wt = workType?.toLowerCase() || "general";
    if (wt === "calling" || wt === "marketing") {
      return { background: "#dcfce7", color: "#166534" };
    }
    if (wt === "purchase") {
      return { background: "#fef3c7", color: "#d97706" };
    }
    if (wt === "brochure/design" || wt === "brochure" || wt === "design") {
      return { background: "#e0f2fe", color: "#0369a1" };
    }
    if (wt === "back office") {
      return { background: "#f3e8ff", color: "#6b21a8" };
    }
    return { background: "#f1f5f9", color: "#475569" };
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
                  const expandedCount = userReports.filter(r => expandedReportIds[r.id]).length;
                  return (
                    <React.Fragment key={`user-${firstRow.user_id}`}>
                      {userReports.map((row, index) => {
                        const callsCount = row.calls?.length || 0;
                        const isExpanded = !!expandedReportIds[row.id];
                        const badgeStyle = getWorkTypeBadgeStyle(row.work_type);
                        
                        return (
                          <React.Fragment key={row.id}>
                            <tr className={row.status === "Submitted" ? "order-placed-row" : ""}>
                              {index === 0 && (
                                <td rowSpan={userReports.length + expandedCount} style={{ verticalAlign: 'top', borderRight: '1px solid #edf2f7', background: '#fff' }}>
                                  <span className="cell-text"><strong>{user ? user.name : `User ${row.user_id}`}</strong></span>
                                </td>
                              )}
                              <td><span className="cell-text">{row.start_time}</span></td>
                              <td><span className="cell-text">{row.end_time}</span></td>
                              <td>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span
                                      className="status-badge"
                                      style={{
                                        ...badgeStyle,
                                        textTransform: "none",
                                        fontWeight: "700",
                                        fontSize: "11px",
                                        padding: "3px 8px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {row.work_type || "General"}
                                    </span>
                                    <span className="cell-text">{row.description}</span>
                                  </div>
                                  {callsCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandReport(row.id)}
                                      style={{
                                        alignSelf: "flex-start",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        border: "none",
                                        background: "transparent",
                                        color: "#176b5b",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        cursor: "pointer",
                                        padding: 0,
                                        marginTop: "2px",
                                      }}
                                    >
                                      {isExpanded ? "Hide Call Details ▲" : `View Call Details (${callsCount}) ▼`}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className={`status-badge ${row.status.toLowerCase()}`}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && callsCount > 0 && (
                              <tr>
                                <td colSpan={4} style={{ background: "#f8fafc", padding: "10px 15px 15px 15px" }}>
                                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", maxWidth: "700px" }}>
                                    <table className="company-table" style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ padding: "8px 12px", background: "#f1f5f9", fontSize: "11px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: "160px" }}>Contact Number</th>
                                          <th style={{ padding: "8px 12px", background: "#f1f5f9", fontSize: "11px", color: "#475569", borderBottom: "1px solid #e2e8f0", width: "180px" }}>Contact Person</th>
                                          <th style={{ padding: "8px 12px", background: "#f1f5f9", fontSize: "11px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Contact Purpose / Details</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.calls.map((call, cIdx) => (
                                          <tr key={cIdx} style={{ borderBottom: cIdx === row.calls.length - 1 ? "none" : "1px solid #f1f5f9" }}>
                                            <td style={{ padding: "8px 12px", fontSize: "12px", color: "#0f172a" }}>{call.contact_number}</td>
                                            <td style={{ padding: "8px 12px", fontSize: "12px", color: "#0f172a" }}>{call.contact_person}</td>
                                            <td style={{ padding: "8px 12px", fontSize: "12px", color: "#334155" }}>{call.contact_for}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
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
