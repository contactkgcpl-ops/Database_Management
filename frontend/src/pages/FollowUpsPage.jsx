import React, { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Search, UserCheck } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";
import { Pagination } from "../components/Pagination";

const columns = [
  { key: "company_name", label: "Lead Details", width: 260 },
  { key: "scheduled_date", label: "Scheduled Date", width: 180 },
  { key: "lead_status", label: "Current Status", width: 180 },
  { key: "remark", label: "Previous Remark", width: 260 },
];

function cellValue(row, key) {
  if (key === "scheduled_date") {
    return row.scheduled_date ? new Date(row.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "";
  }
  return row[key] || "";
}

export function FollowUpsPage() {
  const notify = useNotify();
  const followups = useLoad(() => api.myPendingFollowups(), []);
  const users = useLoad(() => api.users(), []);
  const properties = useLoad(() => api.properties(), []);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "scheduled_date", direction: "asc" });
  const [columnFilters, setColumnFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [actionModal, setActionModal] = useState(null);
  const [formData, setFormData] = useState({
    remark: "",
    lead_status: "",
    assigned_to_id: "",
    next_follow_up_date: "",
  });

  const statusProperty = properties.data?.find((p) => p.field_key === "status");

  const filteredData = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (followups.data || []).filter((row) => {
      const matchesSearch = !term || columns.some((column) => String(cellValue(row, column.key)).toLowerCase().includes(term));
      if (!matchesSearch) return false;
      return columns.every((column) => {
        const filter = columnFilters[column.key];
        if (!filter) return true;
        return String(cellValue(row, column.key)).toLowerCase().includes(String(filter).toLowerCase());
      });
    });
  }, [followups.data, q, columnFilters]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const valA = sort.key === "scheduled_date" ? new Date(a.scheduled_date || 0).getTime() : String(cellValue(a, sort.key));
      const valB = sort.key === "scheduled_date" ? new Date(b.scheduled_date || 0).getTime() : String(cellValue(b, sort.key));
      const result = typeof valA === "number" && typeof valB === "number" ? valA - valB : String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [filteredData, sort]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const visibleData = sortedData.slice((page - 1) * pageSize, page * pageSize);

  const handleTakeAction = (f) => {
    setActionModal(f);
    setFormData({
      remark: "",
      lead_status: f.lead_status || "",
      assigned_to_id: f.assigned_to_id || "",
      next_follow_up_date: "",
    });
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
      </div>

      <div className="data-grid">
        {followups.data?.length === 0 ? (
          <div className="muted" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={18} />
            No pending follow-ups today.
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
                        <input
                          className="filter-input"
                          placeholder={`Filter ${column.label}`}
                          value={columnFilters[column.key] || ""}
                          onChange={(e) => { setColumnFilters({ ...columnFilters, [column.key]: e.target.value }); setPage(1); }}
                        />
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="cell-text"><strong>{f.company_name || "-"}</strong></span>
                        {f.contact_number && <span className="cell-subtext">{f.contact_number}</span>}
                      </td>
                      <td>
                        <span className="date-cell"><Calendar size={15} /> {cellValue(f, "scheduled_date") || "N/A"}</span>
                      </td>
                      <td><span className="status-badge neutral">{f.lead_status || "Unassigned"}</span></td>
                      <td><span className="cell-text" title={f.remark || ""}>{f.remark || "-"}</span></td>
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
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                Action: {actionModal.company_name}
              </h2>
              <button
                onClick={() => setActionModal(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Follow Up Remark <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  placeholder="What happened during this call or meeting?"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Update Status
                  </label>
                  <select
                    value={formData.lead_status}
                    onChange={(e) => setFormData({ ...formData, lead_status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand-500"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" /> Re-Assign To
                  </label>
                  <select
                    value={formData.assigned_to_id}
                    onChange={(e) => setFormData({ ...formData, assigned_to_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand-500"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Next Follow Up Date / Meeting Date
                </label>
                <input
                  type="date"
                  value={formData.next_follow_up_date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setFormData({ ...formData, next_follow_up_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-500 mt-1">If selected, this will create a new follow-up task automatically.</p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-md hover:bg-brand-700 shadow-sm"
                >
                  Complete & Save
                </button>
              </div>
            </form>
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
        .followups-page .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .followups-page .sort-header span { color: #94a3b8; font-size: 10px; }
        .followups-page .cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .followups-page .cell-subtext { display: block; color: #64748b; font-size: 11px; margin-top: 3px; }
        .followups-page .date-cell { display: flex; align-items: center; gap: 6px; color: #334155; }
        .followups-page .small-action { height: 30px; padding: 0 12px; font-size: 12px; }
      `}} />
    </div>
  );
}
