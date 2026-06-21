import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, X, Eye, ShieldAlert, Ban } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { LeaveDetailsDrawer } from "./LeaveDetailsDrawer";

export function LeaveApprovalsPage({ setPage }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeaveId, setSelectedLeaveId] = useState(null);
  
  const [remarkInputId, setRemarkInputId] = useState(null);
  const [remark, setRemark] = useState("");
  const [actioning, setActioning] = useState(false);
  const todayStr = (() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().split("T")[0];
  })();

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const data = await api.leaveApprovals();
      setRequests(data);
    } catch (err) {
      console.error("Failed to fetch approvals", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleQuickAction = async (leaveId, status) => {
    setActioning(true);
    try {
      await api.actionLeaveApproval(leaveId, { status, remark });
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: `Leave request successfully ${status.toLowerCase()}!`, type: "success" }
      }));
      setRemarkInputId(null);
      setRemark("");
      fetchApprovals();
    } catch (err) {
      console.error(err);
    } finally {
      setActioning(false);
    }
  };

  const handleCancelRequest = async (leaveId) => {
    const reason = window.prompt("Enter cancellation reason:");
    if (reason === null) return; // User clicked cancel
    
    setActioning(true);
    try {
      await api.cancelLeave(leaveId, reason.trim());
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: "Leave request cancelled successfully!", type: "success" }
      }));
      fetchApprovals();
    } catch (err) {
      console.error(err);
    } finally {
      setActioning(false);
    }
  };

  // Filter requests into Pending vs Completed
  const pendingRequests = requests.filter((r) => {
    // Check if the current user's specific approval row is Pending
    const userApp = r.approvals?.find((a) => a.approver_id === user.id);
    return userApp?.status === "Pending" && r.status === "Pending";
  });

  const completedRequests = requests.filter((r) => {
    const userApp = r.approvals?.find((a) => a.approver_id === user.id);
    return userApp?.status !== "Pending" || r.status !== "Pending";
  });

  return (
    <div className="approvals-container">
      {/* Header */}
      <div className="page-header">
        <button className="back-btn" onClick={() => setPage("leave-my")}>
          <ArrowLeft size={16} /> My Leaves
        </button>
        <h2>Leave Approval Requests</h2>
      </div>

      {loading ? (
        <div className="loader">Loading approvals...</div>
      ) : (
        <div className="tabs-container">
          {/* Pending Approval Section */}
          <div className="section-card">
            <div className="section-header">
              <h3>Awaiting Your Approval ({pendingRequests.length})</h3>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="empty-state">
                <Check size={48} className="icon-empty text-success" />
                <h3>All Caught Up!</h3>
                <p>There are no leave requests pending your review.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Category</th>
                      <th>Date Range</th>
                      <th>Type</th>
                      <th>Total Days</th>
                      <th>Approvals Prog</th>
                      <th>Quick Remark</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((req) => {
                      const showRemarkField = remarkInputId === req.id;
                      return (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.employee_name}</strong>
                            <span className="user-designation">{req.designation || "Staff"}</span>
                          </td>
                          <td><strong>{req.title}</strong></td>
                          <td>
                            {new Date(req.from_date).toLocaleDateString("en-US", { dateStyle: "short" })} to {new Date(req.to_date).toLocaleDateString("en-US", { dateStyle: "short" })}
                          </td>
                          <td>{req.leave_type}</td>
                          <td>{req.total_days} Day(s)</td>
                          <td>
                            <span className="prog-text">
                              {req.approved_count} of {req.required_approvals} approved
                            </span>
                          </td>
                          <td>
                            {showRemarkField ? (
                              <input
                                type="text"
                                className="quick-remark-input"
                                placeholder="Enter remark..."
                                value={remark}
                                onChange={(e) => setRemark(e.target.value)}
                                autoFocus
                              />
                            ) : (
                              <button
                                className="add-remark-btn"
                                onClick={() => { setRemarkInputId(req.id); setRemark(""); }}
                              >
                                + Add Remark
                              </button>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="action-btns-group">
                              <button
                                className="icon-action-btn view"
                                title="View Full Details"
                                onClick={() => setSelectedLeaveId(req.id)}
                              >
                                <Eye size={15} />
                              </button>
                              {(req.status === "Pending" || req.status === "Approved") && req.from_date >= todayStr && (
                                <button
                                  className="icon-action-btn reject"
                                  title="Cancel Leave Request"
                                  onClick={() => handleCancelRequest(req.id)}
                                  disabled={actioning}
                                  style={{ color: '#ef4444' }}
                                >
                                  <Ban size={15} />
                                </button>
                              )}
                              <button
                                className="icon-action-btn approve"
                                title="Quick Approve"
                                onClick={() => {
                                  if (showRemarkField) {
                                    handleQuickAction(req.id, "Approved");
                                  } else {
                                    setRemarkInputId(req.id);
                                    // Default click triggers prompt to write comment or direct approval
                                    handleQuickAction(req.id, "Approved");
                                  }
                                }}
                                disabled={actioning}
                              >
                                <Check size={15} />
                              </button>
                              <button
                                className="icon-action-btn reject"
                                title="Quick Reject"
                                onClick={() => {
                                  if (!remark && !showRemarkField) {
                                    setRemarkInputId(req.id);
                                    window.dispatchEvent(new CustomEvent("erp:notify", {
                                      detail: { message: "Please type a rejection remark first.", type: "error" }
                                    }));
                                    return;
                                  }
                                  handleQuickAction(req.id, "Rejected");
                                }}
                                disabled={actioning}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History Approval Section */}
          <div className="section-card history-section">
            <div className="section-header">
              <h3>My Past Decisions ({completedRequests.length})</h3>
            </div>

            {completedRequests.length === 0 ? (
              <div className="empty-state">
                <p>No past decisions found.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="custom-table table-subtle">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Category</th>
                      <th>Date Range</th>
                      <th>Total Days</th>
                      <th>Your Decision</th>
                      <th>Final Status</th>
                      <th style={{ textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRequests.map((req) => {
                      const userApp = req.approvals?.find((a) => a.approver_id === user.id);
                      return (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.employee_name}</strong>
                            <span className="user-designation">{req.designation || "Staff"}</span>
                          </td>
                          <td>{req.title}</td>
                          <td>
                            {new Date(req.from_date).toLocaleDateString("en-US", { dateStyle: "short" })} to {new Date(req.to_date).toLocaleDateString("en-US", { dateStyle: "short" })}
                          </td>
                          <td>{req.total_days} Day(s)</td>
                          <td>
                            <span className={`status-badge-inline ${userApp?.status.toLowerCase()}`}>
                              {userApp?.status}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge-inline ${req.status.toLowerCase()}`}>
                              {req.status}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="action-btns-group">
                              <button
                                className="icon-action-btn view"
                                onClick={() => setSelectedLeaveId(req.id)}
                                title="View Full Details"
                              >
                                <Eye size={15} />
                              </button>
                              {(req.status === "Pending" || req.status === "Approved") && req.from_date >= todayStr && (
                                <button
                                  className="icon-action-btn reject"
                                  title="Cancel Leave Request"
                                  onClick={() => handleCancelRequest(req.id)}
                                  disabled={actioning}
                                  style={{ color: '#ef4444' }}
                                >
                                  <Ban size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer */}
      {selectedLeaveId && (
        <LeaveDetailsDrawer
          leaveId={selectedLeaveId}
          currentUser={user}
          onClose={() => setSelectedLeaveId(null)}
          onRefresh={fetchApprovals}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .approvals-container {
          padding: 16px;
        }
        .page-header {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 24px;
        }
        .page-header h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }
        .back-btn {
          border: none;
          background: transparent;
          color: #64748b;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          align-self: flex-start;
        }
        .back-btn:hover {
          color: #0f172a;
        }
        
        .section-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          margin-bottom: 24px;
        }
        .history-section {
          background: #f8fafc;
        }
        .section-header {
          margin-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 10px;
        }
        .section-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        
        .loader {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
        .empty-state {
          text-align: center;
          padding: 30px;
          color: #64748b;
        }
        .icon-empty {
          margin-bottom: 12px;
        }
        .text-success { color: #16a34a; }
        
        .table-responsive {
          overflow-x: auto;
        }
        .custom-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .custom-table th, .custom-table td {
          padding: 12px 14px;
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
        .table-subtle td {
          color: #475569;
        }
        
        .user-designation {
          display: block;
          font-size: 11px;
          color: #64748b;
          font-weight: 400;
        }
        .prog-text {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }
        
        .quick-remark-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          width: 100%;
          outline: none;
        }
        .quick-remark-input:focus {
          border-color: #0f766e;
        }
        .add-remark-btn {
          border: none;
          background: transparent;
          color: #0f766e;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .add-remark-btn:hover {
          text-decoration: underline;
        }
        
        .action-btns-group {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
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
        .icon-action-btn.approve:hover {
          background: #f0fdf4;
          color: #16a34a;
          border-color: #bbf7d0;
        }
        .icon-action-btn.reject:hover {
          background: #fef2f2;
          color: #ef4444;
          border-color: #fca5a5;
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
        ` }} />
    </div>
  );
}
