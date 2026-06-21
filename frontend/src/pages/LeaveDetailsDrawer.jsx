import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Clock, Paperclip } from "lucide-react";
import { api, assetUrl } from "../api";

export function LeaveDetailsDrawer({ leaveId, onClose, onRefresh, currentUser }) {
  const [leave, setLeave] = React.useState(null);
  const [loading, setLoading] = useState(true);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (!leaveId) return;
    setLoading(true);
    api.leaveDetails(leaveId)
      .then((data) => {
        setLeave(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [leaveId]);

  const handleAction = async (status) => {
    setSubmitting(true);
    try {
      await api.actionLeaveApproval(leaveId, { status, remark });
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: `Leave request successfully ${status.toLowerCase()}!`, type: "success" }
      }));
      onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!leaveId) return null;

  const currentApproval = leave?.approvals?.find(
    (a) => a.approver_id === currentUser?.id && a.status === "Pending"
  );

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>Leave Request Details</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="drawer-loader">Loading details...</div>
        ) : leave ? (
          <div className="drawer-body">
            {/* Status Banner */}
            <div className={`status-banner ${leave.status.toLowerCase()}`}>
              <div className="banner-info">
                <span className="status-badge">{leave.status}</span>
                <p>
                  <strong>{leave.total_days} Day(s)</strong> of {leave.title}
                </p>
              </div>
            </div>

            {/* Request Info */}
            <div className="info-section">
              <h4>Employee Information</h4>
              <div className="grid-2">
                <div>
                  <label>Name</label>
                  <p>{leave.employee_name || "N/A"}</p>
                </div>
                <div>
                  <label>Designation</label>
                  <p>{leave.designation || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="info-section">
              <h4>Leave Duration</h4>
              <div className="grid-2">
                <div>
                  <label>From Date</label>
                  <p>{new Date(leave.from_date).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                </div>
                <div>
                  <label>To Date</label>
                  <p>{new Date(leave.to_date).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                </div>
                <div>
                  <label>Type</label>
                  <p>
                    {leave.leave_type} {leave.half_day_type ? `(${leave.half_day_type})` : ""}
                    {leave.start_half_day && " (First day half-day)"}
                    {leave.end_half_day && " (Last day half-day)"}
                  </p>
                </div>
                <div>
                  <label>Requested On</label>
                  <p>{new Date(leave.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                </div>
                {leave.half_day_details && (
                  <div style={{ gridColumn: "span 2", marginTop: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontWeight: "700", color: "#475569" }}>Daily Config Details</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {Object.entries(JSON.parse(leave.half_day_details)).sort().map(([dateStr, type]) => {
                        const dateObj = new Date(dateStr);
                        const formatted = dateObj.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric"
                        });
                        return (
                          <span key={dateStr} style={{
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            color: "#334155"
                          }}>
                            {formatted}: <strong style={{ marginLeft: "4px", color: type === "Full Day" ? "#0f766e" : "#b45309" }}>{type}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="info-section">
              <h4>Reason / Description</h4>
              <p className="description-text">{leave.description}</p>
              {leave.attachment && (
                <div className="attachment-box">
                  <Paperclip size={16} />
                  <a href={assetUrl(leave.attachment)} target="_blank" rel="noopener noreferrer">
                    View Attached File
                  </a>
                </div>
              )}
            </div>

            {leave.cancel_reason && (
              <div className="info-section" style={{ borderLeft: "4px solid #ef4444", paddingLeft: "12px", background: "#fef2f2", padding: "12px", borderRadius: "6px" }}>
                <h4 style={{ color: "#991b1b", margin: "0 0 6px 0" }}>Reason for Cancellation</h4>
                <p className="description-text" style={{ color: "#b91c1c", fontWeight: "600", margin: 0 }}>{leave.cancel_reason}</p>
              </div>
            )}

            {/* Approvals Workflow */}
            <div className="info-section">
              <h4>Approval Progression ({leave.approved_count}/{leave.required_approvals} required)</h4>
              <div className="approvals-timeline">
                {leave.approvals?.map((app) => (
                  <div className={`timeline-item ${app.status.toLowerCase()}`} key={app.id}>
                    <div className="timeline-icon">
                      {app.status === "Approved" ? (
                        <CheckCircle2 size={16} />
                      ) : app.status === "Rejected" ? (
                        <AlertTriangle size={16} />
                      ) : (
                        <Clock size={16} />
                      )}
                    </div>
                    <div className="timeline-details">
                      <div className="timeline-header">
                        <strong>{app.approver_name}</strong>
                        <span className="role-tag">{app.approver_role || "Approver"}</span>
                      </div>
                      <p className="vote-status">Status: {app.status}</p>
                      {app.remark && <p className="remark-text">"{app.remark}"</p>}
                      {app.action_date && (
                        <span className="timestamp">
                          {new Date(app.action_date).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approver Action Panel */}
            {currentApproval && (
              <div className="approver-action-card">
                <h4>Take Action</h4>
                <p className="helper-text">You are assigned as an approver. Please choose to approve or reject this leave request.</p>
                <div className="form-group">
                  <label>Remark / Comments</label>
                  <textarea
                    placeholder="Enter approval or rejection comments..."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="action-buttons">
                  <button
                    className="approve-btn"
                    onClick={() => handleAction("Approved")}
                    disabled={submitting}
                  >
                    Approve Leave
                  </button>
                  <button
                    className="reject-btn"
                    onClick={() => handleAction("Rejected")}
                    disabled={submitting}
                  >
                    Reject Leave
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="drawer-error">Failed to load request details.</div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .drawer-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: flex-end;
        }
        .drawer-content {
          width: min(520px, 100vw);
          height: 100%;
          background: #ffffff;
          box-shadow: -10px 0 30px rgba(15, 23, 42, 0.15);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.25s ease-out;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .drawer-header {
          padding: 16px 24px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .drawer-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        .close-btn {
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          transition: background 0.2s;
        }
        .close-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .drawer-loader, .drawer-error {
          padding: 40px;
          text-align: center;
          color: #64748b;
        }
        .status-banner {
          padding: 16px;
          border-radius: 10px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .status-banner.pending { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; }
        .status-banner.approved { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
        .status-banner.rejected { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
        .status-banner.cancelled { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
        .status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 8px;
          border-radius: 20px;
          background: currentColor;
          color: #ffffff;
          margin-bottom: 6px;
        }
        .banner-info p {
          margin: 0;
          font-size: 16px;
        }
        .info-section {
          margin-bottom: 24px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 20px;
        }
        .info-section h4 {
          margin: 0 0 14px 0;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .grid-2 label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
        }
        .grid-2 p {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }
        .description-text {
          font-size: 14px;
          color: #334155;
          line-height: 1.5;
          margin: 0;
        }
        .attachment-box {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 8px 12px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
        }
        .attachment-box a {
          color: #0f766e;
          font-weight: 600;
          text-decoration: none;
        }
        .attachment-box a:hover {
          text-decoration: underline;
        }
        .approvals-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .timeline-item {
          display: flex;
          gap: 12px;
        }
        .timeline-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #f1f5f9;
          color: #64748b;
        }
        .timeline-item.approved .timeline-icon { background: #dcfce7; color: #166534; }
        .timeline-item.rejected .timeline-icon { background: #fee2e2; color: #991b1b; }
        .timeline-item.pending .timeline-icon { background: #fef3c7; color: #92400e; }
        .timeline-details {
          flex: 1;
        }
        .timeline-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }
        .timeline-header strong { font-size: 14px; color: #0f172a; }
        .role-tag { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
        .vote-status { margin: 0; font-size: 12px; color: #64748b; }
        .remark-text { margin: 4px 0 0 0; font-size: 13px; font-style: italic; color: #475569; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #cbd5e1; }
        .timestamp { display: block; font-size: 11px; color: #94a3b8; margin-top: 4px; }
        
        .approver-action-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-top: 10px;
        }
        .approver-action-card h4 { margin: 0 0 6px 0; color: #0f172a; }
        .helper-text { font-size: 13px; color: #64748b; margin: 0 0 16px 0; }
        .approver-action-card textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px;
          font-family: inherit;
          font-size: 13px;
          resize: vertical;
        }
        .approver-action-card textarea:focus {
          outline: none;
          border-color: #0f766e;
        }
        .action-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        .approve-btn, .reject-btn {
          border: none;
          padding: 10px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s;
        }
        .approve-btn { background: #0f766e; color: #ffffff; }
        .approve-btn:hover { background: #0d615a; }
        .reject-btn { background: #ef4444; color: #ffffff; }
        .reject-btn:hover { background: #dc2626; }
        ` }} />
    </div>
  );
}
