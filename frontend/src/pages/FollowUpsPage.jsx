import React, { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock3, Download, Filter, Grid3X3, History, List, Plus, RotateCcw, Search, Settings, UserCheck, X } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";
import { Pagination } from "../components/Pagination";

const columns = [
  { key: "company_name", label: "Lead Details", width: 260 },
  { key: "scheduled_date", label: "Scheduled Date", width: 180 },
  { key: "followup_type", label: "Follow Up", width: 170 },
  { key: "assigned_to", label: "Assigned To", width: 170 },
  { key: "lead_status", label: "Current Status", width: 180 },
  { key: "remark", label: "Previous Remark", width: 260 },
];

const followUpFilters = [
  { key: "all", label: "All Follow-ups" },
  { key: "today", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "re_follow_up", label: "Re Follow Up" },
  { key: "missed", label: "Overdue" },
];

function localDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFollowUpType(row) {
  if (row.status === "Re Follow Up") {
    return { key: "re_follow_up", label: "Re Follow Up", className: "re-follow-up" };
  }

  const scheduled = localDateKey(row.scheduled_date);
  const today = localDateKey(new Date());

  if (!scheduled || scheduled > today) {
    return { key: "upcoming", label: "Upcoming", className: "upcoming" };
  }
  if (scheduled < today) {
    return { key: "missed", label: "Missed", className: "missed" };
  }
  return { key: "today", label: "Follow up Today", className: "today" };
}

function cellValue(row, key) {
  if (key === "scheduled_date") {
    return row.scheduled_date ? new Date(row.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "";
  }
  if (key === "scheduled_time") return formatTime(row.scheduled_date);
  if (key === "followup_type") return getFollowUpType(row).label;
  if (key === "assigned_to") return row.assigned_to_name || "";
  return row[key] || "";
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function assignedUserName(users, assignedToId) {
  return users.find((user) => user.id === assignedToId)?.name || "Unassigned";
}

function followupAssigneeName(row, users) {
  return row.assigned_to_name || assignedUserName(users, row.assigned_to_id);
}

export function FollowUpsPage() {
  const notify = useNotify();
  const followups = useLoad(() => api.myPendingFollowups(), []);
  const users = useLoad(() => api.users(), []);
  const properties = useLoad(() => api.properties(), []);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "scheduled_date", direction: "asc" });
  const [columnFilters, setColumnFilters] = useState({});
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [companyDetails, setCompanyDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [actionModal, setActionModal] = useState(null);
  const [formData, setFormData] = useState({
    remark: "",
    lead_status: "",
    assigned_to_id: "",
    next_follow_up_date: "",
  });

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCompanyName, setHistoryCompanyName] = useState("");

  const openHistory = async (companyId, companyName) => {
    setHistoryCompanyName(companyName);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api.getCompanyFollowups(companyId);
      setHistoryData(data);
    } catch (err) {
      notify("Failed to load follow-up history", "error");
    }
    setHistoryLoading(false);
  };

  const statusProperty = properties.data?.find((p) => p.field_key === "status");

  const groupedFollowups = useMemo(() => {
    if (!followups.data) return [];
    const groups = {};
    for (const f of followups.data) {
      if (!groups[f.company_id]) {
        groups[f.company_id] = [];
      }
      groups[f.company_id].push(f);
    }
    return Object.values(groups).map((group) => {
      // Sort so that the active/Pending one, or the one with the latest scheduled date is first
      const sortedGroup = [...group].sort((a, b) => {
        if (a.status === "Pending" && b.status !== "Pending") return -1;
        if (a.status !== "Pending" && b.status === "Pending") return 1;
        return new Date(b.scheduled_date) - new Date(a.scheduled_date);
      });
      
      const primary = sortedGroup[0];
      return {
        ...primary,
        all_followups: sortedGroup
      };
    });
  }, [followups.data]);

  const filteredData = useMemo(() => {
    const term = q.trim().toLowerCase();
    return groupedFollowups.filter((row) => {
      const followUpType = getFollowUpType(row);
      if (followUpFilter !== "all" && followUpType.key !== followUpFilter) return false;
      if (statusFilter && String(row.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (typeFilter && followUpType.key !== typeFilter) return false;
      if (assignedFilter && String(row.assigned_to_id || "") !== assignedFilter) return false;

      const scheduled = localDateKey(row.scheduled_date);
      if (fromDate && scheduled < fromDate) return false;
      if (toDate && scheduled > toDate) return false;

      const assignedName = followupAssigneeName(row, users.data || []);
      const matchesSearch = !term || columns.some((column) => String(cellValue(row, column.key)).toLowerCase().includes(term)) ||
        String(row.contact_number || "").toLowerCase().includes(term) ||
        assignedName.toLowerCase().includes(term);
      if (!matchesSearch) return false;
      return columns.every((column) => {
        const filter = columnFilters[column.key];
        if (!filter) return true;
        if (column.key === "scheduled_date") return true;
        if (column.key === "assigned_to") return followupAssigneeName(row, users.data || []).toLowerCase().includes(String(filter).toLowerCase());
        return String(cellValue(row, column.key)).toLowerCase().includes(String(filter).toLowerCase());
      });
    });
  }, [groupedFollowups, q, users.data, columnFilters, followUpFilter, statusFilter, typeFilter, assignedFilter, fromDate, toDate]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const typeOrder = { missed: 0, today: 1, re_follow_up: 2, upcoming: 3 };
      const valA = sort.key === "scheduled_date"
        ? new Date(a.scheduled_date || 0).getTime()
        : sort.key === "followup_type"
          ? typeOrder[getFollowUpType(a).key]
          : String(cellValue(a, sort.key));
      const valB = sort.key === "scheduled_date"
        ? new Date(b.scheduled_date || 0).getTime()
        : sort.key === "followup_type"
          ? typeOrder[getFollowUpType(b).key]
          : String(cellValue(b, sort.key));
      const result = typeof valA === "number" && typeof valB === "number" ? valA - valB : String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [filteredData, sort]);

  const followUpCounts = useMemo(() => {
    return groupedFollowups.reduce((acc, row) => {
      const key = getFollowUpType(row).key;
      acc.all += 1;
      acc[key] += 1;
      return acc;
    }, { all: 0, missed: 0, today: 0, re_follow_up: 0, upcoming: 0 });
  }, [groupedFollowups]);

  const summary = useMemo(() => {
    return groupedFollowups.reduce((acc, row) => {
      const type = getFollowUpType(row).key;
      acc.total += 1;
      if (row.status === "Completed") acc.completed += 1;
      else if (type === "missed") acc.overdue += 1;
      else acc.pending += 1;
      return acc;
    }, { total: 0, pending: 0, completed: 0, overdue: 0 });
  }, [groupedFollowups]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const visibleData = sortedData.slice((page - 1) * pageSize, page * pageSize);

  const handleTakeAction = async (f) => {
    setActionModal(f);
    setCompanyDetails(null);
    setLoadingDetails(true);
    setFormData({
      remark: "",
      lead_status: f.lead_status || "",
      assigned_to_id: f.assigned_to_id || "",
      next_follow_up_date: "",
    });
    try {
      const details = await api.company(f.company_id);
      setCompanyDetails(details);
    } catch (err) {
      notify("Failed to load lead details", "error");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!actionModal) return;

    try {
      await api.completeFollowup(actionModal.id, {
        remark: formData.remark,
        lead_status: formData.lead_status,
        assigned_to_id: formData.assigned_to_id ? parseInt(formData.assigned_to_id, 10) : null,
        next_follow_up_date: formData.next_follow_up_date || null
      });
      notify("Action logged successfully", "success");
      setActionModal(null);
      followups.reload();
    } catch (error) {
      notify("Failed to log action", "error");
    }
  };

  const handleAssign = async (companyId, userId) => {
    try {
      await api.assignCompany(companyId, userId ? parseInt(userId, 10) : null);
      notify("Lead assigned successfully", "success");
      followups.reload();
    } catch (err) {
      notify("Failed to assign lead", "error");
    }
  };

  const resetFilters = () => {
    setQ("");
    setStatusFilter("");
    setTypeFilter("");
    setAssignedFilter("");
    setFromDate("");
    setToDate("");
    setColumnFilters({});
    setFollowUpFilter("all");
    setPage(1);
  };

  const exportFollowups = () => {
    const headers = ["Company", "Contact", "Scheduled Date", "Time", "Follow Up", "Assigned To", "Status", "Remark"];
    const rows = sortedData.map((row) => [
      row.company_name || "",
      row.contact_number || "",
      cellValue(row, "scheduled_date"),
      formatTime(row.scheduled_date),
      getFollowUpType(row).label,
      followupAssigneeName(row, users.data || []),
      row.status || "",
      row.remark || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "follow-ups.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (followups.loading) return <div className="muted" style={{ padding: "20px" }}>Loading follow ups...</div>;

  return (
    <div className="stack followups-page">
      <div className="toolbar split-toolbar">
        <div className="crm-search small" style={{ maxWidth: "320px" }}>
          <Search size={16} />
          <input
            placeholder="Search follow ups..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className="followup-filter-tabs" role="tablist" aria-label="Follow up filters">
          {followUpFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={followUpFilter === filter.key ? "active" : ""}
              onClick={() => { setFollowUpFilter(filter.key); setPage(1); }}
            >
              {filter.label}
              <span>{followUpCounts[filter.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="data-grid">
        {groupedFollowups.length === 0 ? (
          <div className="muted" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={18} />
            No pending follow-ups.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} style={{ width: `${column.width}px` }}>
                        <button
                          type="button"
                          className="sort-header"
                          onClick={() => setSort({ key: column.key, direction: sort.key === column.key && sort.direction === "asc" ? "desc" : "asc" })}
                        >
                          {column.label} <span>{sort.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    ))}
                    <th style={{ width: "150px" }}>Action</th>
                  </tr>
                  <tr className="filter-row">
                    {columns.map((column) => (
                      <th key={`${column.key}-filter`} style={{ width: `${column.width}px` }}>
                        {column.key === "scheduled_date" ? (
                          <div style={{ position: "relative" }}>
                            <button
                              type="button"
                              onClick={() => setDateFilterOpen(!dateFilterOpen)}
                              style={{
                                width: "100%",
                                padding: "6px 8px",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                fontSize: "11px",
                                background: fromDate || toDate ? "#e8f2f0" : "#fff",
                                color: fromDate || toDate ? "#176b5b" : "#64748b",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                fontWeight: "600",
                                height: "30px",
                                boxSizing: "border-box"
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fromDate || toDate
                                  ? `${fromDate ? fromDate.substring(5) : ".."} to ${toDate ? toDate.substring(5) : ".."}`
                                  : "Filter Date"}
                              </span>
                              <span>📅</span>
                            </button>
                            {dateFilterOpen && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  zIndex: 100,
                                  background: "#fff",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "6px",
                                  boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                                  padding: "10px",
                                  display: "grid",
                                  gap: "8px",
                                  minWidth: "260px",
                                  marginTop: "4px"
                                }}
                              >
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                                  <div>
                                    <label style={{ fontSize: "10px", color: "#64748b", fontWeight: "700", display: "block", marginBottom: "4px" }}>From Date</label>
                                    <input
                                      type="date"
                                      value={fromDate}
                                      onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                      style={{ width: "100%", padding: "4px 6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: "10px", color: "#64748b", fontWeight: "700", display: "block", marginBottom: "4px" }}>To Date</label>
                                    <input
                                      type="date"
                                      value={toDate}
                                      onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                      style={{ width: "100%", padding: "4px 6px", fontSize: "11px", border: "1px solid #cbd5e1", borderRadius: "4px" }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", gap: "10px" }}>
                                  <button
                                    type="button"
                                    onClick={() => { setFromDate(""); setToDate(""); setPage(1); setDateFilterOpen(false); }}
                                    className="secondary"
                                    style={{ fontSize: "11px", padding: "4px 10px", height: "26px", display: "inline-flex", alignItems: "center" }}
                                  >
                                    Clear
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDateFilterOpen(false)}
                                    className="primary"
                                    style={{ fontSize: "11px", padding: "4px 10px", height: "26px", display: "inline-flex", alignItems: "center", background: "#176b5b", color: "#fff" }}
                                  >
                                    Apply
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : column.key === "assigned_to" ? (
                          <select
                            className="filter-input"
                            value={assignedFilter}
                            onChange={(e) => { setAssignedFilter(e.target.value); setPage(1); }}
                          >
                            <option value="">All Assigned</option>
                            {users.data?.map((user) => (
                              <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                          </select>
                        ) : column.key === "followup_type" ? (
                          <select
                            className="filter-input"
                            value={typeFilter}
                            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                          >
                            <option value="">All Type</option>
                            {followUpFilters.filter((filter) => filter.key !== "all").map((filter) => (
                              <option key={filter.key} value={filter.key}>{filter.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="filter-input"
                            placeholder={`Filter ${column.label}`}
                            value={columnFilters[column.key] || ""}
                            onChange={(e) => { setColumnFilters({ ...columnFilters, [column.key]: e.target.value }); setPage(1); }}
                          />
                        )}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleData.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="followup-empty-cell">
                        No follow-ups match this filter.
                      </td>
                    </tr>
                  ) : visibleData.map((f) => (
                    <tr key={f.id} className={`followup-row ${getFollowUpType(f).className}`}>
                      <td>
                        <span className="cell-text"><strong>{f.company_name || "-"}</strong></span>
                        {f.contact_number && <span className="cell-subtext">{f.contact_number}</span>}
                      </td>
                      <td>
                        <span className="date-cell"><Calendar size={15} /> {cellValue(f, "scheduled_date") || "N/A"}</span>
                      </td>
                      <td>
                        <span className="cell-text">
                          {getFollowUpType(f).label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <select
                            className="compact-select"
                            value={f.assigned_to_id || ""}
                            onChange={(e) => handleAssign(f.company_id, e.target.value)}
                            style={{
                              flex: 1,
                              height: "28px",
                              fontSize: "12px",
                              padding: "0 8px",
                              borderRadius: "6px",
                              border: "1px solid #d9e2ee",
                              background: f.assigned_to_id ? "#f0fdf4" : "#fff",
                              color: f.assigned_to_id ? "#176b5b" : "#475569",
                              fontWeight: f.assigned_to_id ? "600" : "400",
                              boxSizing: "border-box",
                              minWidth: "120px"
                            }}
                          >
                            <option value="">Not Assigned</option>
                            {users.data?.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <span className="cell-text">
                          {f.lead_status || "Unassigned"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="cell-text" title={f.remark || ""} style={{ flex: 1 }}>
                            {f.remark || "-"}
                          </span>
                          <button
                            type="button"
                            onClick={() => openHistory(f.company_id, f.company_name)}
                            title="View Follow-up History"
                            style={{
                              width: "24px",
                              height: "24px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: 0,
                              borderRadius: "4px",
                              background: "#0f766e",
                              color: "#fff",
                              cursor: "pointer",
                              padding: 0
                            }}
                          >
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <button type="button" className="primary small-action" onClick={() => handleTakeAction(f)}>Take Action</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={filteredData.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      </div>

      {actionModal && (
        <div className="followup-action-backdrop">
          <div className="followup-action-modal">
            <div className="followup-action-head">
              <div>
                <h2>Take Action</h2>
                <p>
                  {actionModal.company_name || "Lead follow-up"}
                  <span className={`followup-head-badge ${getFollowUpType(actionModal).className}`}>
                    {getFollowUpType(actionModal).label}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="followup-modal-close"
                aria-label="Close action popup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="followup-action-body">
              <section className="followup-detail-panel">
                <div className="followup-panel-title">Lead Details</div>
                {loadingDetails ? (
                  <div className="followup-detail-empty">Loading lead details...</div>
                ) : companyDetails ? (
                  <div className="followup-detail-grid">
                    <div className="followup-detail-item full">
                      <span>Company Name</span>
                      <strong>{companyDetails.company_name || "-"}</strong>
                    </div>
                    {companyDetails.property_values?.filter(pv => pv.value).map((pv) => (
                      <div key={pv.id || pv.property_id} className="followup-detail-item">
                        <span>{pv.property_name || pv.field_key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                        <strong>{pv.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="followup-detail-empty">Lead details unavailable.</div>
                )}
              </section>

              <form onSubmit={handleSubmit} className="followup-action-form">
                <div>
                  <label>
                    Follow Up Remark <span>*</span>
                  </label>
                  <textarea
                    required
                    value={formData.remark}
                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                    placeholder="What happened during this call or meeting?"
                  />
                </div>

                <div className="followup-form-row">
                  <div>
                    <label>Update Status</label>
                    <select
                      value={formData.lead_status}
                      onChange={(e) => setFormData({ ...formData, lead_status: e.target.value })}
                    >
                      <option value="">No Change</option>
                      {statusProperty?.options?.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="followup-icon-label">
                      <UserCheck size={14} /> Re-Assign To
                    </label>
                    <select
                      value={formData.assigned_to_id}
                      onChange={(e) => setFormData({ ...formData, assigned_to_id: e.target.value })}
                    >
                      <option value="">-- Keep Same --</option>
                      {users.data?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label>
                    Next Follow Up Date / Meeting Date
                  </label>
                  <input
                    type="date"
                    value={formData.next_follow_up_date}
                    min={localDateKey(new Date())}
                    onChange={(e) => setFormData({ ...formData, next_follow_up_date: e.target.value })}
                  />
                  <p>If selected, this will create a new follow-up task automatically.</p>
                </div>

                <div className="followup-action-footer">
                  <button
                    type="button"
                    onClick={() => setActionModal(null)}
                    className="secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary">
                    Complete & Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {historyModalOpen && (
        <div className="followup-action-backdrop">
          <div className="followup-action-modal" style={{ maxWidth: "640px" }}>
            <div className="followup-action-head">
              <div>
                <h2>Follow Up History</h2>
                <p>{historyCompanyName || "Lead History"}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="followup-modal-close"
                aria-label="Close history popup"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px", maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", background: "#f8fafc" }}>
              {historyLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>Loading follow-up history...</div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No follow-up records found.</div>
              ) : (
                historyData.map((h) => {
                  const isScheduled = h.scheduled_date;
                  const isActual = h.actual_date;
                  return (
                    <div
                      key={h.id}
                      style={{
                        padding: "14px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        background: "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                          fontSize: "11px",
                          color: "#64748b",
                          fontWeight: "700"
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          📅 Scheduled: {isScheduled ? new Date(h.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "N/A"}
                        </span>
                        {isActual && (
                          <span style={{ color: "#166534", background: "#dcfce7", padding: "2px 6px", borderRadius: "4px" }}>
                            Done: {new Date(h.actual_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                          </span>
                        )}
                        {!isActual && (
                          <span style={{ color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>
                            {h.status}
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                        Assigned To: <strong style={{ color: "#334155" }}>{h.assigned_to_name || "Unassigned"}</strong>
                      </div>

                      {h.remark ? (
                        <div
                          style={{
                            padding: "10px",
                            background: "#f1f5f9",
                            borderRadius: "6px",
                            fontSize: "13px",
                            color: "#334155",
                            lineHeight: "1.4",
                            borderLeft: "3px solid #176b5b",
                            whiteSpace: "pre-wrap"
                          }}
                        >
                          {h.remark}
                        </div>
                      ) : (
                        <div style={{ fontStyle: "italic", color: "#94a3b8", fontSize: "12px" }}>
                          No remark provided.
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="followup-action-footer" style={{ padding: "12px 20px", background: "#fff", borderTop: "1px solid #e2e8f0" }}>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="primary"
                style={{ background: "#176b5b", color: "#fff" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .followups-page .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
        .followups-page .company-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: max-content; }
        .followups-page .company-table th,
        .followups-page .company-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left; }
        .followups-page .company-table thead th { background: #f8fafc; font-weight: 700; position: sticky; top: 0; z-index: 20; color: #475569; }
        .followups-page .filter-row th { background: #f8fafc; position: sticky; top: 41px; z-index: 15; padding: 6px 12px; }
        .followups-page .filter-input { width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
        .followups-page .date-range-filter {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .followups-page .date-range-filter input {
          min-width: 118px;
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 12px;
          box-sizing: border-box;
        }
        .followups-page .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .followups-page .sort-header span { color: #94a3b8; font-size: 10px; }
        .followups-page .cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .followups-page .cell-subtext { display: block; color: #64748b; font-size: 11px; margin-top: 3px; }
        .followups-page .date-cell { display: flex; align-items: center; gap: 6px; color: #334155; }
        .followups-page .small-action { height: 30px; padding: 0 12px; font-size: 12px; }
        .followups-page .followup-empty-cell {
          padding: 24px;
          color: #64748b;
          text-align: center;
          background: #fff;
        }
        .followups-page .split-toolbar {
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .followup-filter-tabs {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .followup-filter-tabs button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 30px;
          padding: 0 10px;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          border: 0;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
        }
        .followup-filter-tabs button.active {
          color: #176b5b;
          background: #fff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
        }
        .followup-filter-tabs span {
          min-width: 20px;
          height: 20px;
          display: inline-grid;
          place-items: center;
          padding: 0 6px;
          color: #64748b;
          background: #e2e8f0;
          border-radius: 999px;
          font-size: 11px;
        }
        .followup-filter-tabs button.active span {
          color: #fff;
          background: #176b5b;
        }
        .followups-page .followup-row.missed td {
          background: #fff5f5;
        }
        .followups-page .followup-row.missed td:first-child {
          box-shadow: inset 4px 0 0 #dc2626;
        }
        .followups-page .followup-row.today td {
          background: #f0fdf4;
        }
        .followups-page .followup-row.today td:first-child {
          box-shadow: inset 4px 0 0 #16a34a;
        }
        .followup-type-badge,
        .followup-head-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.2;
          white-space: nowrap;
        }
        .followup-type-badge.missed,
        .followup-head-badge.missed {
          color: #991b1b;
          background: #fee2e2;
          border: 1px solid #fecaca;
        }
        .followup-type-badge.today,
        .followup-head-badge.today {
          color: #166534;
          background: #dcfce7;
          border: 1px solid #bbf7d0;
        }
        .followup-type-badge.upcoming,
        .followup-head-badge.upcoming {
          color: #92400e;
          background: #fef3c7;
          border: 1px solid #fde68a;
        }
        .followup-head-badge {
          margin-left: 10px;
          vertical-align: middle;
        }
        .followup-action-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.55);
        }
        .followup-action-modal {
          width: min(1040px, 96vw);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.32);
        }
        .followup-action-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px;
          color: #fff;
          background: #176b5b;
        }
        .followup-action-head h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
        }
        .followup-action-head p {
          margin: 3px 0 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
        }
        .followup-modal-close {
          width: 32px;
          height: 32px;
          display: inline-grid;
          place-items: center;
          border: 0;
          border-radius: 6px;
          color: #fff;
          background: rgba(255, 255, 255, 0.12);
          cursor: pointer;
        }
        .followup-modal-close:hover { background: rgba(255, 255, 255, 0.2); }
        .followup-action-body {
          display: grid;
          grid-template-columns: minmax(320px, 1.05fr) minmax(360px, 0.95fr);
          min-height: 0;
        }
        .followup-detail-panel {
          min-height: 0;
          max-height: calc(92vh - 66px);
          padding: 18px 20px;
          overflow-y: auto;
          background: #f8fafc;
          border-right: 1px solid #e2e8f0;
        }
        .followup-panel-title {
          margin-bottom: 12px;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .followup-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .followup-detail-item {
          min-width: 0;
          padding: 10px 12px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .followup-detail-item.full { grid-column: 1 / -1; }
        .followup-detail-item span {
          display: block;
          margin-bottom: 4px;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .followup-detail-item strong {
          display: block;
          color: #1e293b;
          font-size: 13px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }
        .followup-detail-empty {
          padding: 16px;
          color: #64748b;
          font-size: 13px;
          text-align: center;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .followup-action-form {
          min-height: 0;
          max-height: calc(92vh - 66px);
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px 20px;
          overflow-y: auto;
        }
        .followup-action-form label {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 6px;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }
        .followup-action-form label span { color: #dc2626; }
        .followup-action-form textarea,
        .followup-action-form select,
        .followup-action-form input {
          width: 100%;
          box-sizing: border-box;
          padding: 9px 10px;
          color: #1e293b;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          font: inherit;
          font-size: 13px;
        }
        .followup-action-form textarea {
          min-height: 112px;
          resize: vertical;
        }
        .followup-action-form textarea:focus,
        .followup-action-form select:focus,
        .followup-action-form input:focus {
          outline: none;
          border-color: #176b5b;
          box-shadow: 0 0 0 3px rgba(23, 107, 91, 0.12);
        }
        .followup-action-form p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 11px;
        }
        .followup-form-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .followup-action-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 820px) {
          .followup-action-body { grid-template-columns: 1fr; }
          .followup-detail-panel {
            max-height: 34vh;
            border-right: 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .followup-action-form { max-height: calc(92vh - 34vh - 66px); }
          .followup-form-row,
          .followup-detail-grid { grid-template-columns: 1fr; }
        }
      `}} />
    </div>
  );
}
