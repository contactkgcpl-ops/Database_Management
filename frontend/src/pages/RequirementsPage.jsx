import React, { useMemo, useState } from "react";
import { Search, X, Plus, CheckCircle, RefreshCcw, ClipboardList, Clock, Pencil, Download } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { GridFilterDropdown } from "../components/GridFilterDropdown";

const columns = [
  { key: "id", label: "Req ID", width: 80 },
  { key: "title", label: "Title", width: 260 },
  { key: "priority", label: "Priority", width: 120 },
  { key: "status", label: "Status", width: 140 },
  { key: "added_by", label: "Added By", width: 150 },
  { key: "assigned_to", label: "Assigned To", width: 150 },
  { key: "due_date", label: "Due Date", width: 130 }
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const STATUSES = ["Open", "In Progress", "Done", "Closed"];

const PRIORITY_STYLE = {
  Low:    { background: "#eff6ff", color: "#1d4ed8" },
  Medium: { background: "#fffbeb", color: "#b45309" },
  High:   { background: "#fef2f2", color: "#b91c1c" },
  Urgent: { background: "#f5f3ff", color: "#6d28d9" },
};

const STATUS_STYLE = {
  Open:         { background: "#eff6ff", color: "#1d4ed8" },
  "In Progress":{ background: "#fffbeb", color: "#b45309" },
  Done:         { background: "#f0fdf4", color: "#166534" },
  Closed:       { background: "#f1f5f9", color: "#475569" },
};

function formatDate(val) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function RequirementModal({ open, onClose, onSaved, editData, users, notify }) {
  const emptyForm = { title: "", description: "", priority: "Medium", due_date: "", assigned_to_id: "", status: "Open" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          title: editData.title || "",
          description: editData.description || "",
          priority: editData.priority || "Medium",
          status: editData.status || "Open",
          due_date: editData.due_date ? editData.due_date.split("T")[0] : "",
          assigned_to_id: editData.assigned_to?.id ? String(editData.assigned_to.id) : "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, editData]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { notify("Title is required", "error"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        due_date: form.due_date || null,
        assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : null,
      };
      if (editData) {
        await api.updateRequirement(editData.id, { ...payload, status: form.status });
        notify("Requirement updated successfully", "success");
      } else {
        await api.createRequirement(payload);
        notify("Requirement added successfully", "success");
      }
      onSaved();
      onClose();
    } catch {
      /* api.js already shows error toast */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
      <div className="modal" style={{ maxWidth: "560px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
        {/* Modal Header */}
        <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "16px", margin: 0, fontWeight: "700" }}>
            {editData ? "Edit Requirement" : "Add New Requirement"}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px", maxHeight: "80vh", overflowY: "auto" }}>

          <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px", fontWeight: "800" }}>
            Requirement Details
          </h3>

          {/* Title */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Title *</label>
            <input
              required
              value={form.title}
              onChange={set("title")}
              style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
              placeholder="e.g. Need quotation for ABC item"
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Description</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
              placeholder="Describe the requirement in detail..."
            />
          </div>

          {/* Priority + Due Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Priority</label>
              <select value={form.priority} onChange={set("priority")} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={set("due_date")} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Status — only in edit mode */}
          {editData && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Status</label>
              <select value={form.status} onChange={set("status")} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Assign To */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Assign To</label>
            <select value={form.assigned_to_id} onChange={set("assigned_to_id")} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}>
              <option value="">— Unassigned —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" className="secondary" onClick={onClose} disabled={saving} style={{ padding: "8px 16px", borderRadius: "6px" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ backgroundColor: "#176b5b", color: "#fff", padding: "8px 18px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
              {editData ? "Save Changes" : "Add Requirement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail View Modal ────────────────────────────────────────────────────────
function DetailModal({ open, onClose, req, onComplete, onEdit, currentUserId, notify, onReload }) {
  const [completing, setCompleting] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = React.useRef(null);

  // Auto-scroll chat to bottom when opened or when history changes
  React.useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [req?.history, open]);

  if (!open || !req) return null;

  const isAssignee = req.assigned_to?.id === currentUserId;
  const isCreator = req.added_by?.id === currentUserId;
  const isAdmin = currentUserId === 1; // Assuming Admin or we can pass user.role.name
  const isDone = req.status === "Done" || req.status === "Closed";

  async function handleComplete() {
    setCompleting(true);
    try {
      await onComplete(req.id);
      onClose();
    } finally {
      setCompleting(false);
    }
  }

  async function handleSendComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSending(true);
    try {
      await api.addRequirementComment(req.id, { remark: comment });
      setComment("");
      onReload(); // Refresh the requirement list to get the new history
    } catch {
      // api.js handles error
    } finally {
      setSending(false);
    }
  }

  const ps = PRIORITY_STYLE[req.priority] || {};
  const ss = STATUS_STYLE[req.status] || {};

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
      <div className="modal" style={{ display: "flex", flexDirection: "column", maxWidth: "900px", width: "95%", height: "85vh", backgroundColor: "#f8fafc", borderRadius: "8px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>

        <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h2 style={{ fontSize: "16px", margin: 0, fontWeight: "700" }}>Requirement Details & History</h2>
          <button onClick={onClose} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left Side: Details */}
          <div style={{ width: "45%", borderRight: "1px solid #e2e8f0", backgroundColor: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px", flex: 1 }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>{req.title}</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ ...ps, padding: "2px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: "700" }}>{req.priority}</span>
                  <span style={{ ...ss, padding: "2px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: "700" }}>{req.status}</span>
                </div>
              </div>

              {req.description && (
                <div style={{ marginBottom: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}>Description</div>
                  <div style={{ color: "#334155", fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{req.description}</div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                {[
                  { label: "Added By", value: req.added_by?.name || "—" },
                  { label: "Assigned To", value: req.assigned_to?.name || "Unassigned" },
                  { label: "Due Date", value: formatDate(req.due_date) },
                  { label: "Created", value: formatDate(req.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#0f172a" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer actions for Details side */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc", display: "flex", gap: "10px", justifyContent: "flex-start", flexWrap: "wrap", flexShrink: 0 }}>
              <button type="button" className="secondary" onClick={onClose} style={{ padding: "8px 14px", borderRadius: "6px" }}>Close</button>
              
              {(isCreator || isAssignee || isAdmin) && (
                <button type="button" className="secondary" onClick={() => { onClose(); onEdit(req); }} style={{ padding: "8px 14px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Pencil size={13} /> Edit
                </button>
              )}

              {isAssignee && !isDone && (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={completing}
                  style={{ backgroundColor: "#16a34a", color: "#fff", padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <CheckCircle size={14} />
                  {completing ? "Marking..." : "Mark as Complete"}
                </button>
              )}
            </div>
          </div>

          {/* Right Side: Chat / History Section */}
          <div style={{ width: "55%", display: "flex", flexDirection: "column", backgroundColor: "#f1f5f9" }}>
            <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {(req.history || []).map((h, i) => {
                const isMe = h.user?.id === currentUserId;
                
                if (h.type !== "comment") {
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                      <div style={{ background: "#e2e8f0", padding: "4px 12px", borderRadius: "12px", fontSize: "11px", color: "#475569", fontWeight: "600" }}>
                        {h.user?.name || "System"} {h.remark} • {formatDate(h.created_at)}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px", fontWeight: "600", padding: "0 4px" }}>
                      {isMe ? "You" : h.user?.name} • {new Date(h.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    <div style={{
                      background: isMe ? "#176b5b" : "#fff",
                      color: isMe ? "#fff" : "#0f172a",
                      padding: "10px 14px",
                      borderRadius: "14px",
                      borderBottomRightRadius: isMe ? "4px" : "14px",
                      borderBottomLeftRadius: !isMe ? "4px" : "14px",
                      border: isMe ? "none" : "1px solid #e2e8f0",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      maxWidth: "85%",
                      fontSize: "14px",
                      lineHeight: "1.4",
                      whiteSpace: "pre-wrap"
                    }}>
                      {h.remark}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div style={{ padding: "14px 20px", backgroundColor: "#fff", borderTop: "1px solid #e2e8f0", flexShrink: 0 }}>
              <form onSubmit={handleSendComment} style={{ display: "flex", gap: "10px" }}>
                <input 
                  type="text" 
                  placeholder="Type a comment..." 
                  value={comment} 
                  onChange={e => setComment(e.target.value)}
                  style={{ flex: 1, padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: "20px", outline: "none", fontSize: "14px" }}
                />
                <button 
                  type="submit" 
                  disabled={sending || !comment.trim()}
                  style={{ backgroundColor: "#176b5b", color: "#fff", padding: "0 18px", borderRadius: "20px", border: "none", cursor: comment.trim() && !sending ? "pointer" : "not-allowed", fontWeight: "600", opacity: (comment.trim() && !sending) ? 1 : 0.6 }}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function RequirementsPage() {
  const notify = useNotify();
  const { user } = useAuth();

  const [q, setQ] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: "id", direction: "desc" });
  const [statusFilter, setStatusFilter] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editReq, setEditReq] = useState(null);
  const [viewReq, setViewReq] = useState(null);

  const requirements = useLoad(() => api.requirements(), []);
  const users = useLoad(() => api.users(), []);
  const activeUsers = (users.data || []).filter(u => u.is_active);

  // Sync viewReq when requirements data updates (e.g. after a comment is added)
  React.useEffect(() => {
    if (viewReq && requirements.data) {
      const updated = requirements.data.find(r => r.id === viewReq.id);
      if (updated && JSON.stringify(updated.history) !== JSON.stringify(viewReq.history)) {
        setViewReq(updated);
      }
    }
  }, [requirements.data, viewReq]);

  async function handleComplete(id) {
    try {
      await api.completeRequirement(id);
      notify("Requirement marked as complete!", "success");
      requirements.reload();
    } catch {/* ignore */}
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this requirement?")) return;
    try {
      await api.deleteRequirement(id);
      notify("Requirement deleted", "success");
      requirements.reload();
    } catch {/* ignore */}
  }

  // Filter & Sort
  const filtered = useMemo(() => {
    let list = requirements.data || [];
    
    // Status Tab Filter
    if (statusFilter !== "all") {
      list = list.filter(r => r.status.toLowerCase().replace(/ /g, "_") === statusFilter);
    }
    
    // Search Box Filter
    if (q) {
      const qLower = q.toLowerCase();
      list = list.filter(r => 
        r.title.toLowerCase().includes(qLower) ||
        (r.description || "").toLowerCase().includes(qLower) ||
        (r.added_by?.name || "").toLowerCase().includes(qLower) ||
        (r.assigned_to?.name || "").toLowerCase().includes(qLower)
      );
    }

    // Column Filters
    return list.filter(r => {
      return columns.every(col => {
        const filter = columnFilters[col.key];
        if (!filter || (Array.isArray(filter) && filter.length === 0)) return true;
        
        let val = "";
        if (col.key === "id") val = `REQ-${r.id}`;
        else if (col.key === "title") val = r.title;
        else if (col.key === "priority") val = r.priority;
        else if (col.key === "status") val = r.status;
        else if (col.key === "added_by") val = r.added_by?.name || "";
        else if (col.key === "assigned_to") val = r.assigned_to?.name || "Unassigned";
        else if (col.key === "due_date") val = r.due_date ? formatDate(r.due_date) : "";
        
        val = val.toLowerCase();
        
        if (Array.isArray(filter)) {
          const valueAtoms = val.split(",").map(s => s.trim());
          return filter.some(f => valueAtoms.includes(String(f).toLowerCase()) || val.includes(String(f).toLowerCase()));
        }
        return val.includes(String(filter).toLowerCase());
      });
    });
  }, [requirements.data, q, statusFilter, columnFilters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA, valB;
      if (sort.key === "id") { valA = a.id; valB = b.id; }
      else if (sort.key === "title") { valA = a.title; valB = b.title; }
      else if (sort.key === "priority") { valA = a.priority; valB = b.priority; }
      else if (sort.key === "status") { valA = a.status; valB = b.status; }
      else if (sort.key === "added_by") { valA = a.added_by?.name || ""; valB = b.added_by?.name || ""; }
      else if (sort.key === "assigned_to") { valA = a.assigned_to?.name || "Unassigned"; valB = b.assigned_to?.name || "Unassigned"; }
      else if (sort.key === "due_date") { valA = a.due_date ? new Date(a.due_date).getTime() : 0; valB = b.due_date ? new Date(b.due_date).getTime() : 0; }
      
      const res = typeof valA === "number" && typeof valB === "number" ? valA - valB : String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sort.direction === "asc" ? res : -res;
    });
  }, [filtered, sort]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  const exportRequirements = () => {
    const headers = columns.map((col) => col.label);
    const rows = sorted.map((req) => columns.map((col) => {
      if (col.key === "id") return `REQ-${req.id}`;
      if (col.key === "assigned_to") return req.assigned_to?.name || "Unassigned";
      if (col.key === "added_by") return req.added_by?.name || "Unassigned";
      if (col.key === "due_date") return req.due_date ? formatDate(req.due_date) : "";
      return req[col.key] || "";
    }));
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "requirements.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (requirements.loading) return <div className="muted" style={{ padding: "20px" }}>Loading requirements...</div>;

  return (
    <div className="stack requirements-page" style={{ padding: "0px 10px" }}>
      
      {/* ── Command Bar ── */}
      <div className="inquiry-command-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <label className="crm-search small inquiry-search" style={{ flex: 1, maxWidth: "360px" }}>
            <Search size={15} />
            <input
              placeholder="Search requirements..."
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
            />
          </label>
          <span className="user-debug-info" style={{ fontSize: '11px', color: '#94a3b8' }}>
            Logged in as: <strong>{user?.name} (ID: {user?.id})</strong>
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary icon-button small-action" onClick={() => requirements.reload()}>
            <RefreshCcw size={15} /> Refresh
          </button>
          <button type="button" className="secondary icon-button small-action" onClick={exportRequirements}>
            <Download size={15} /> Export
          </button>
          <button
            id="add-requirement-btn"
            className="primary icon-button"
            onClick={() => { setEditReq(null); setShowAddModal(true); }}
            style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", borderRadius: "6px" }}
          >
            <Plus size={16} /> Add Requirement
          </button>
        </div>
      </div>

      {/* ── Status Filter Tabs ── */}
      <div className="toolbar split-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <div className="followup-filter-tabs" role="tablist">
          <button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => { setStatusFilter("all"); setPage(1); }}>All</button>
          <button type="button" className={statusFilter === "open" ? "active" : ""} onClick={() => { setStatusFilter("open"); setPage(1); }}>Open</button>
          <button type="button" className={statusFilter === "in_progress" ? "active" : ""} onClick={() => { setStatusFilter("in_progress"); setPage(1); }}>In Progress</button>
          <button type="button" className={statusFilter === "done" ? "active" : ""} onClick={() => { setStatusFilter("done"); setPage(1); }}>Done</button>
          <button type="button" className={statusFilter === "closed" ? "active" : ""} onClick={() => { setStatusFilter("closed"); setPage(1); }}>Closed</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="data-grid">
        {!requirements.data.length ? (
          <div className="muted" style={{ padding: "30px", textAlign: "center", background: "#fff" }}>
            No requirements found.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} style={{ width: `${col.width}px` }}>
                        <button
                          type="button"
                          className="sort-header"
                          onClick={() => setSort({ key: col.key, direction: sort.key === col.key && sort.direction === "asc" ? "desc" : "asc" })}
                        >
                          {col.label} <span>{sort.key === col.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    ))}
                    <th style={{ width: "100px" }}>Action</th>
                  </tr>
                  
                  {/* Header Filter Row */}
                  <tr className="filter-row">
                    {columns.map(col => {
                      const dataValues = (requirements.data || []).map(r => {
                        if (col.key === "id") return `REQ-${r.id}`;
                        if (col.key === "title") return r.title;
                        if (col.key === "priority") return r.priority;
                        if (col.key === "status") return r.status;
                        if (col.key === "added_by") return r.added_by?.name || "";
                        if (col.key === "assigned_to") return r.assigned_to?.name || "Unassigned";
                        if (col.key === "due_date") return r.due_date ? formatDate(r.due_date) : "";
                        return "";
                      }).filter(Boolean);
                      
                      const uniqueValues = Array.from(new Set(dataValues)).sort();
                      
                      return (
                        <th key={`${col.key}-f`} style={{ padding: "6px 8px" }}>
                          {["priority", "status", "assigned_to"].includes(col.key) ? (
                            <GridFilterDropdown
                              label={col.label}
                              options={uniqueValues}
                              value={columnFilters[col.key] || []}
                              onChange={(val) => { setColumnFilters({ ...columnFilters, [col.key]: val }); setPage(1); }}
                              isMulti={true}
                            />
                          ) : (
                            <input
                              className="filter-input"
                              placeholder="Filter..."
                              value={columnFilters[col.key] || ""}
                              onChange={(e) => { setColumnFilters({ ...columnFilters, [col.key]: e.target.value }); setPage(1); }}
                              style={{ width: "100%", padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px", boxSizing: "border-box" }}
                            />
                          )}
                        </th>
                      );
                    })}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
                        No matching requirements found.
                      </td>
                    </tr>
                  ) : (
                    visible.map((req, idx) => {
                      const ps = PRIORITY_STYLE[req.priority] || {};
                      const ss = STATUS_STYLE[req.status] || {};
                      const isAssignee = req.assigned_to?.id === user?.id;
                      const isDone = req.status === "Done" || req.status === "Closed";

                      return (
                        <tr
                          key={req.id}
                          style={{ cursor: "pointer" }}
                          className={req.status === "Done" ? "order-placed-row" : ""}
                          onClick={() => setViewReq(req)}
                        >
                          <td><span className="cell-text" style={{ color: "#94a3b8", fontSize: "12px" }}>REQ-{req.id}</span></td>
                          <td>
                            <span className="cell-text"><strong>{req.title}</strong></span>
                            {req.description && (
                              <span className="cell-subtext" style={{ fontSize: "11px", color: "#94a3b8", display: "block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {req.description}
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ ...ps, padding: "2px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: "700", display: "inline-block" }}>
                              {req.priority}
                            </span>
                          </td>
                          <td>
                            <span style={{ ...ss, padding: "2px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: "700", display: "inline-block" }}>
                              {req.status}
                            </span>
                          </td>
                          <td><span className="cell-text">{req.added_by?.name || "—"}</span></td>
                          <td>
                            <span className="cell-text" style={{ color: req.assigned_to ? "#0f172a" : "#94a3b8" }}>
                              {req.assigned_to?.name || "Unassigned"}
                            </span>
                          </td>
                          <td>
                            {req.due_date ? (
                              <span className="cell-text" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                                <Clock size={12} style={{ color: "#94a3b8" }} />
                                {formatDate(req.due_date)}
                              </span>
                            ) : (
                              <span className="cell-text" style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: "5px" }}>
                              {isAssignee && !isDone && (
                                <button
                                  type="button"
                                  className="cell-icon-button"
                                  title="Mark as Complete"
                                  style={{ background: "#16a34a" }}
                                  onClick={() => handleComplete(req.id)}
                                >
                                  <CheckCircle size={13} />
                                </button>
                              )}
                              {(req.added_by?.id === user?.id || req.assigned_to?.id === user?.id || user?.role?.name === "Admin") && (
                                <button
                                  type="button"
                                  className="cell-icon-button"
                                  title="Edit"
                                  style={{ background: "#475569" }}
                                  onClick={() => { setEditReq(req); setShowAddModal(true); }}
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                              {(req.added_by?.id === user?.id || user?.role?.name === "Admin") && (
                                <button
                                  type="button"
                                  className="cell-icon-button"
                                  title="Delete"
                                  style={{ background: "#dc2626" }}
                                  onClick={() => handleDelete(req.id)}
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalRows={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <RequirementModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => requirements.reload()}
        editData={editReq}
        users={activeUsers}
        notify={notify}
      />
      <DetailModal
        open={!!viewReq}
        onClose={() => setViewReq(null)}
        req={viewReq}
        onComplete={async (id) => { await handleComplete(id); requirements.reload(); }}
        onEdit={req => { setEditReq(req); setShowAddModal(true); }}
        currentUserId={user?.id}
        notify={notify}
        onReload={() => requirements.reload()}
      />
    {/* Styled tokens tailored to base theme */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .requirements-page { gap: 0px; }
        .inquiry-command-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          margin-bottom: 12px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .inquiry-search {
          width: min(360px, 100%);
        }
        @media (max-width: 760px) {
          .inquiry-command-bar {
            align-items: stretch;
            flex-direction: column;
          }
          .inquiry-search {
            width: 100%;
          }
        }

        .requirements-page .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
        .requirements-page .company-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: max-content; }
        .requirements-page .company-table th,
        .requirements-page .company-table td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left; }
        .requirements-page .company-table thead th { background: #f8fafc; font-weight: 700; position: sticky; top: 0; z-index: 20; color: #475569; }
        .requirements-page .filter-row th { background: #f8fafc; position: sticky; top: 38px; z-index: 15; padding: 4px 8px; }
        .requirements-page .filter-input { width: 100%; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
        .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .sort-header span { color: #94a3b8; font-size: 10px; }
        .cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cell-subtext { display: block; color: #64748b; font-size: 10px; margin-top: 2px; }
        .small-action { height: 30px; padding: 0 12px; font-size: 12px; }
        .split-toolbar { gap: 12px; align-items: center; flex-wrap: wrap; }
        .followup-filter-tabs { display: inline-flex; align-items: center; gap: 6px; padding: 4px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; }
        .followup-filter-tabs button { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; color: #475569; font-size: 12px; font-weight: 700; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
        .followup-filter-tabs button.active { color: #176b5b; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
        
        .cell-icon-button {
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 5px;
          color: #fff;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .cell-icon-button:hover { transform: scale(1.1); }
      `}} />
    </div>
  );
}
