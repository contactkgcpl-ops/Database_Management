import React, { useEffect, useState } from "react";
import { ArrowLeft, Eye, Calendar, Ban, Pencil, Plus } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { LeaveDetailsDrawer } from "./LeaveDetailsDrawer";

export function MyLeavesPage({ setPage, setEditingId }) {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeaveId, setSelectedLeaveId] = useState(null);

  const todayStr = (() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().split("T")[0];
  })();

  const fetchMyLeaves = async () => {
    setLoading(true);
    try {
      const data = await api.myLeaves();
      setLeaves(data);
    } catch (err) {
      console.error("Failed to fetch my leaves", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLeaves();
  }, []);

  const handleCancel = async (leaveId) => {
    const reason = window.prompt("Please enter the reason for cancelling this leave request:");
    if (reason === null) {
      return; // User clicked Cancel in the prompt dialog
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert("Cancellation reason is required.");
      return;
    }

    try {
      await api.cancelLeave(leaveId, trimmedReason);
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: "Leave request cancelled successfully.", type: "success" }
      }));
      fetchMyLeaves();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="my-leaves-container">
      {/* Header and Back navigation */}
      <div className="my-leaves-header">
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "800", color: "#0f172a" }}>Leave Applications</h2>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {user.permissions.includes("leave.calendar") && (
            <button
              className="secondary-btn"
              onClick={() => setPage("leave-calendar")}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "40px" }}
            >
              <Calendar size={16} /> Show Calendar
            </button>
          )}
          {user.permissions.includes("leave.apply") && (
            <button 
              className="primary-btn" 
              onClick={() => { setEditingId(null); setPage("leave-apply"); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "40px" }}
            >
              <Plus size={16} /> Apply Leave
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loader">Loading leaves history...</div>
      ) : (
        <div className="history-card">
          {leaves.length === 0 ? (
            <div className="empty-state">
              <Calendar size={48} className="icon-empty" />
              <h3>No Applications Found</h3>
              <p>You have not submitted any leave applications.</p>
              {user.permissions.includes("leave.apply") && (
                <button className="primary-btn" onClick={() => { setEditingId(null); setPage("leave-apply"); }}>
                  Apply for Leave
                </button>
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Requested On</th>
                    <th>Subject</th>
                    <th>Date Range</th>
                    <th>Type</th>
                    <th>Total Days</th>
                    <th>Status</th>
                    <th>Approvals</th>
                    <th style={{ textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((req) => (
                    <tr key={req.id}>
                      <td>{new Date(req.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                      <td>
                        <strong>{req.title}</strong>
                        {(req.start_half_day || req.end_half_day) && (
                          <span className="half-day-indicator">
                            {req.start_half_day && "Start: Half-day "}
                            {req.end_half_day && "End: Half-day"}
                          </span>
                        )}
                      </td>
                      <td>
                        {new Date(req.from_date).toLocaleDateString("en-US", { dateStyle: "short" })} to {new Date(req.to_date).toLocaleDateString("en-US", { dateStyle: "short" })}
                      </td>
                      <td>{req.leave_type} {req.half_day_type ? `(${req.half_day_type})` : ""}</td>
                      <td>{req.total_days} Day(s)</td>
                      <td>
                        <span className={`status-badge-inline ${req.status.toLowerCase()}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span className="approvals-ratio">
                            {req.approved_count} / {req.total_approvers} Approved
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
                            {req.approvals && req.approvals.map((app) => (
                              <span 
                                key={app.id} 
                                className={`approver-status-tag ${app.status.toLowerCase()}`}
                                style={{
                                  fontSize: "10px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontWeight: "700",
                                  background: app.status === "Approved" ? "#f0fdf4" : app.status === "Rejected" ? "#fef2f2" : "#f1f5f9",
                                  color: app.status === "Approved" ? "#16a34a" : app.status === "Rejected" ? "#dc2626" : "#475569",
                                  border: app.status === "Approved" ? "1px solid #bbf7d0" : app.status === "Rejected" ? "1px solid #fecaca" : "1px solid #cbd5e1"
                                }}
                              >
                                {app.approver_name}: {app.status}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div className="table-actions">
                          <button
                            className="icon-action-btn view"
                            title="View Details"
                            onClick={() => setSelectedLeaveId(req.id)}
                          >
                            <Eye size={15} />
                          </button>
                          {req.status === "Pending" && req.approved_count === 0 && req.from_date >= todayStr && (
                            <>
                              <button
                                className="icon-action-btn edit"
                                title="Edit Request"
                                onClick={() => {
                                  setEditingId(req.id);
                                  setPage("leave-apply");
                                }}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-action-btn cancel"
                                title="Cancel Request"
                                onClick={() => handleCancel(req.id)}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              >
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drawer overlay */}
      {selectedLeaveId && (
        <LeaveDetailsDrawer
          leaveId={selectedLeaveId}
          currentUser={user}
          onClose={() => setSelectedLeaveId(null)}
          onRefresh={fetchMyLeaves}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .my-leaves-container {
          padding: 16px;
        }
        .my-leaves-header {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          width: 100%;
        }
        
        .history-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        
        .loader {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
        }
        .icon-empty {
          color: #cbd5e1;
          margin-bottom: 16px;
        }
        .empty-state h3 {
          margin: 0 0 6px 0;
          color: #334155;
          font-size: 16px;
        }
        .empty-state p {
          margin: 0 0 16px 0;
          font-size: 14px;
        }
        .primary-btn {
          border: none;
          background: #0f766e;
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .primary-btn:hover { background: #0d615a; }
        
        .secondary-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .secondary-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #0f172a;
        }
        
        .table-responsive {
          overflow-x: auto;
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .custom-table th, .custom-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13px;
        }
        .custom-table th {
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
        }
        .custom-table tr:hover td {
          background: #f8fafc;
        }
        
        .half-day-indicator {
          display: block;
          font-size: 11px;
          color: #0f766e;
          font-weight: 700;
          margin-top: 2px;
        }
        
        .status-badge-inline {
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 20px;
          text-transform: uppercase;
        }
        .status-badge-inline.pending { background: #fffbeb; color: #b45309; }
        .status-badge-inline.approved { background: #f0fdf4; color: #15803d; }
        .status-badge-inline.rejected { background: #fef2f2; color: #b91c1c; }
        .status-badge-inline.cancelled { background: #f1f5f9; color: #475569; }
        
        .approvals-ratio {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }
        
        .table-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .icon-action-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .icon-action-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
          border-color: #94a3b8;
        }
        .icon-action-btn.cancel:hover {
          color: #d97706;
          border-color: #fcd34d;
          background: #fffbeb;
        }
        .icon-action-btn.delete:hover {
          color: #ef4444;
          border-color: #fca5a5;
          background: #fef2f2;
        }
        ` }} />
    </div>
  );
}
