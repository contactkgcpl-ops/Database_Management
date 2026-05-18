import React, { useState, useMemo } from "react";
import { Search, X, MoreVertical, Ruler, Columns3, Save, Pencil, Trash2, Tag, Building2, UserCheck } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";
import { Pagination } from "../components/Pagination";
import { GridFilterDropdown } from "../components/GridFilterDropdown";

function splitMultiValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function propertyOptions(property) {
  return (property?.options || [])
    .filter((option) => option.is_active !== false)
    .map((option) => ({ label: option.label, value: option.value }));
}

function formatPropertyValue(property, value) {
  const labelsByValue = new Map(propertyOptions(property).map((option) => [String(option.value), option.label]));
  const parts = splitMultiValue(value);
  if (!parts.length) return "";
  return parts.map((part) => labelsByValue.get(String(part)) || part).join(", ");
}

export function AssignLeadsPage() {
  const notify = useNotify();
  const [q, setQ] = useState("");
  const companies = useLoad(() => api.companies(q), [q]);
  const users = useLoad(() => api.users(), []);
  const properties = useLoad(() => api.properties(), []);
  const propertyGrids = useLoad(() => api.propertyGrids(), []);

  // UI States
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnWidthEdit, setColumnWidthEdit] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [draftColumns, setDraftColumns] = useState([]);
  const [columnWidths, setColumnWidths] = useState({});

  // Pagination & Filtering (Simplified local version for now)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columnFilters, setColumnFilters] = useState({});
  const [sort, setSort] = useState({ key: "id", direction: "desc" });

  const assignLeadsGrid = propertyGrids.data?.find(g => g.key === "assign_leads");

  const gridProperties = useMemo(() => {
    if (!assignLeadsGrid || !properties.data) return [];

    const dynamic = properties.data
      .filter(p => p.grids?.some(g => g.grid_id === assignLeadsGrid.id))
      .sort((a, b) => {
        const orderA = a.grids.find(g => g.grid_id === assignLeadsGrid.id)?.grid_order || 0;
        const orderB = b.grids.find(g => g.grid_id === assignLeadsGrid.id)?.grid_order || 0;
        return orderA - orderB;
      });

    // Always include Company Name at the start
    if (!dynamic.some(p => p.field_key === "company_name")) {
      return [
        {
          id: 0,
          name: "Company Name",
          field_key: "company_name",
          grids: [{ grid_id: assignLeadsGrid.id, grid_order: -100, grid_width: 200 }]
        },
        ...dynamic
      ];
    }
    return dynamic;
  }, [assignLeadsGrid, properties.data]);

  const getColumnWidth = (p) => {
    if (columnWidths[p.field_key] !== undefined) return columnWidths[p.field_key];
    return p.grids?.find(g => g.grid_id === assignLeadsGrid?.id)?.grid_width || 160;
  };

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyFilterKey, setHistoryFilterKey] = useState(null);

  const openHistory = async (companyId, filterKey = null) => {
    setHistoryFilterKey(filterKey);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api.getCompanyHistory(companyId);
      setHistoryData(data);
    } catch (err) {}
    setHistoryLoading(false);
  };

  const [statusModal, setStatusModal] = useState(null);
  const [statusForm, setStatusForm] = useState({ remark: "", followUpDate: "", status: "" });

  const handleInlineEdit = async (companyId, prop, value) => {
    if (prop.field_key === "status") {
      setStatusModal({ companyId, property: prop, value });
      setStatusForm({ remark: "", followUpDate: "", status: value });
      return;
    }
    try {
      await api.updateCompanyInline(companyId, { property_id: prop.id, value });
      notify("Status updated", "success");
      companies.reload();
    } catch (err) {}
  };

  const submitStatusChange = async (e) => {
    e.preventDefault();
    if (!statusModal) return;
    try {
      await api.updateCompanyInline(statusModal.companyId, {
        property_id: statusModal.property.id,
        value: statusForm.status,
        remark: statusForm.remark,
        follow_up_date: statusForm.followUpDate || null
      });
      notify("Status updated", "success");
      setStatusModal(null);
      companies.reload();
    } catch (err) {}
  };

  const setColumnWidth = (fieldKey, width) => {
    setColumnWidths(prev => ({ ...prev, [fieldKey]: parseInt(width) || 80 }));
  };

  const saveColumnWidths = async () => {
    const updates = Object.entries(columnWidths).map(([fieldKey, width]) => {
      const prop = properties.data.find(p => p.field_key === fieldKey);
      const gridMapping = prop?.grids?.find(g => g.grid_id === assignLeadsGrid?.id);
      return gridMapping ? { id: prop.id, grid_id: assignLeadsGrid.id, grid_width: width, grid_order: gridMapping.grid_order, show_on_grid: true } : null;
    }).filter(Boolean);

    if (updates.length) {
      try {
        await api.updatePropertyGridColumns(updates);
        notify("Column widths saved", "success");
      } catch (err) {
        notify("Failed to save column widths", "error");
      }
    }
    setColumnWidthEdit(false);
    properties.reload();
  };

  const openColumnChooser = () => {
    setDraftColumns(gridProperties.map(p => p.field_key));
    setColumnChooserOpen(true);
  };

  const saveColumnOrder = async () => {
    const updates = properties.data.map(p => {
      const isSelected = draftColumns.includes(p.field_key);
      const gridMapping = p.grids?.find(g => g.grid_id === assignLeadsGrid?.id);

      if (isSelected) {
        return {
          id: p.id,
          grid_id: assignLeadsGrid.id,
          show_on_grid: true,
          grid_order: draftColumns.indexOf(p.field_key),
          grid_width: gridMapping?.grid_width || 160
        };
      } else if (gridMapping) {
        return { id: p.id, grid_id: assignLeadsGrid.id, show_on_grid: false, grid_order: 0, grid_width: gridMapping.grid_width };
      }
      return null;
    }).filter(Boolean);

    try {
      await api.updatePropertyGridColumns(updates);
      notify("Columns updated", "success");
      setColumnChooserOpen(false);
      properties.reload();
    } catch (err) {
      notify("Failed to update columns", "error");
    }
  };

  const handleAssign = async (companyId, userId) => {
    try {
      await api.assignCompany(companyId, userId || null);
      notify("Lead assigned successfully", "success");
      companies.reload();
    } catch (err) {
      notify("Failed to assign lead", "error");
    }
  };

  const getVal = (company, prop) => {
    if (prop.field_key === "company_name") return company.company_name;
    const pv = company.property_values?.find(v => v.property_id === prop.id);
    return pv ? pv.value : "";
  };

  // Filter & Sort Logic
  const filteredData = useMemo(() => {
    let data = companies.data || [];

    // Column Filters
    Object.entries(columnFilters).forEach(([key, val]) => {
      if (!val) return;
      const prop = properties.data?.find(p => p.field_key === key);
      if (!prop) return;

      data = data.filter(c => {
        const cellVal = String(getVal(c, prop)).toLowerCase();
        if (Array.isArray(val)) {
          return val.length === 0 || val.some(v => cellVal.includes(String(v).toLowerCase()));
        }
        return cellVal.includes(String(val).toLowerCase());
      });
    });

    // Sort
    if (sort.key) {
      const prop = properties.data?.find(p => p.field_key === sort.key);
      data = [...data].sort((a, b) => {
        const valA = prop ? getVal(a, prop) : (a[sort.key] || "");
        const valB = prop ? getVal(b, prop) : (b[sort.key] || "");
        return sort.direction === "asc"
          ? String(valA).localeCompare(String(valB), undefined, { numeric: true })
          : String(valB).localeCompare(String(valA), undefined, { numeric: true });
      });
    }

    return data;
  }, [companies.data, columnFilters, sort, properties.data]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const visibleData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="stack assign-leads-page">
      <div className="toolbar split-toolbar">
        <div className="crm-search small" style={{ maxWidth: "300px" }}>
          <Search size={16} />
          <input
            placeholder="Search leads..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="toolbar-menu-wrap">
          {columnWidthEdit ? (
            <div className="row-actions">
              <button type="button" className="secondary icon-button" onClick={() => setColumnWidthEdit(false)}><X size={18} /> Cancel</button>
              <button type="button" className="icon-button" onClick={saveColumnWidths}><Save size={18} /> Save Widths</button>
            </div>
          ) : (
            <div className="row-actions">
              <button type="button" className="secondary icon-only menu-trigger" onClick={() => setActionsMenuOpen(!actionsMenuOpen)}><MoreVertical size={18} /></button>
              {actionsMenuOpen && (
                <div className="action-menu">
                  <button type="button" onClick={() => { setColumnWidthEdit(true); setActionsMenuOpen(false); }}><Ruler size={17} /> Edit Widths</button>
                  <button type="button" onClick={() => { openColumnChooser(); setActionsMenuOpen(false); }}><Columns3 size={17} /> Choose Columns</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="data-grid">
        {!companies.data.length ? (
          <div className="muted">No leads found</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    {gridProperties.map((p) => (
                      <th key={p.field_key} style={{ width: `${getColumnWidth(p)}px` }}>
                        <button type="button" className="sort-header" onClick={() => setSort({ key: p.field_key, direction: sort.key === p.field_key && sort.direction === "asc" ? "desc" : "asc" })}>
                          {p.name} <span>{sort.key === p.field_key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        {columnWidthEdit && (
                          <input type="number" value={getColumnWidth(p)} onChange={(e) => setColumnWidth(p.field_key, e.target.value)} className="width-input" />
                        )}
                      </th>
                    ))}
                    <th style={{ width: "160px" }}>Assigned To</th>
                    <th style={{ width: "160px" }}>Assigned By</th>
                  </tr>
                  <tr className="filter-row">
                    {gridProperties.map((p) => {
                      const dataValues = companies.data.map(c => getVal(c, p))
                        .flatMap(v => String(v).split(",").map(s => s.trim()))
                        .filter(Boolean);
                      const propOptions = p.options?.map(o => o.value) || [];
                      const uniqueValues = Array.from(new Set([...propOptions, ...dataValues])).sort();

                      return (
                        <th key={`${p.field_key}-f`} style={{ width: `${getColumnWidth(p)}px`, padding: "4px 8px" }}>
                          {p.filter_type === "dropdown" || p.filter_type === "multiselect" ? (
                            <GridFilterDropdown
                              label={p.name}
                              options={uniqueValues}
                              value={columnFilters[p.field_key] || (p.filter_type === "multiselect" ? [] : "")}
                              onChange={(val) => setColumnFilters(prev => ({ ...prev, [p.field_key]: val }))}
                              isMulti={p.filter_type === "multiselect"}
                            />
                          ) : (
                            <input
                              className="filter-input"
                              placeholder={`Filter ${p.name}`}
                              value={columnFilters[p.field_key] || ""}
                              onChange={(e) => setColumnFilters(prev => ({ ...prev, [p.field_key]: e.target.value }))}
                            />
                          )}
                        </th>
                      );
                    })}
                    <th style={{ width: "160px" }} />
                    <th style={{ width: "160px" }} />
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((c) => (
                    <tr key={c.id}>
                      {gridProperties.map((p) => (
                        <td key={p.field_key}>
                          {p.field_key === "status" ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className="cell-text" title={formatPropertyValue(p, getVal(c, p))} style={{ flex: 1, fontWeight: "600", fontSize: "12px" }}>
                                {formatPropertyValue(p, getVal(c, p)) || "-"}
                              </span>
                              <button className="icon-button small" onClick={() => {
                                setStatusModal({ companyId: c.id, property: p, value: getVal(c, p) || "" });
                                setStatusForm({ remark: "", followUpDate: "", status: getVal(c, p) || "" });
                              }} title="Update Status" style={{ padding: "4px", flexShrink: 0 }}>
                                <span style={{ fontSize: "14px" }}>✏️</span>
                              </button>
                              <button className="icon-button small" onClick={() => openHistory(c.id, "status")} title="View Status History" style={{ padding: "4px", flexShrink: 0 }}>
                                <span style={{ fontSize: "14px" }}>🕒</span>
                              </button>
                            </div>
                          ) : p.filter_type === "dropdown" ? (
                            <select 
                              className="inline-select"
                              style={{ width: "100%", padding: "4px", border: "1px solid #e2e8f0", borderRadius: "4px", background: "transparent", fontSize: "12px", color: "#334155" }}
                              value={getVal(c, p) || ""}
                              onChange={(e) => handleInlineEdit(c.id, p, e.target.value)}
                            >
                              <option value="">-</option>
                              {p.options?.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="cell-text" title={getVal(c, p)}>
                              {p.field_key === "company_name" ? <strong>{getVal(c, p)}</strong> : getVal(c, p)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <select
                            className="compact-select"
                            value={c.assigned_to || ""}
                            onChange={(e) => handleAssign(c.id, e.target.value)}
                            style={{
                              flex: 1,
                              height: "28px",
                              fontSize: "12px",
                              padding: "0 8px",
                              borderRadius: "6px",
                              border: "1px solid #d9e2ee",
                              background: c.assigned_to ? "#f0fdf4" : "#fff",
                              color: c.assigned_to ? "#176b5b" : "#475569",
                              fontWeight: c.assigned_to ? "600" : "400",
                              boxSizing: "border-box"
                            }}
                          >
                            <option value="">Not Assigned</option>
                            {users.data?.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                          <button className="icon-button small" onClick={() => openHistory(c.id, "assigned_to")} title="View Assignment History" style={{ padding: "4px" }}>
                            <span style={{ fontSize: "14px" }}>🕒</span>
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="cell-text" style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                          {c.assigned_by_name || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalRows={filteredData.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </>
        )}
      </div>

      {columnChooserOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal column-modal" style={{ maxWidth: "880px", width: "95%", backgroundColor: "#fff", borderRadius: "4px", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Choose Columns (Assign Leads)</h2>
              <button onClick={() => setColumnChooserOpen(false)} style={{ background: "transparent", color: "#fff", cursor: "pointer", border: 'none' }}><X size={18} /></button>
            </div>

            <div className="column-chooser-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "480px" }}>
              <div className="column-pool-side stack" style={{ padding: "16px 20px", borderRight: "1px solid #e2e8f0", backgroundColor: "#fff", gap: "12px" }}>
                <div className="crm-search small">
                  <input placeholder="Search columns..." value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} />
                </div>
                <div className="scroll-area" style={{ flex: 1, overflowY: "auto" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "4px" }}>Company Properties</p>
                  {[
                    ...properties.data.filter(p => 
                      p.field_key !== "company_name" && p.entity_type !== 'lead'
                    )
                  ]
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id || p.field_key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                          <span style={{ fontSize: "12px" }}>{p.name}</span>
                        </label>
                      );
                    })}

                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "16px" }}>Lead Group</p>
                  {[
                    ...properties.data.filter(p => 
                      p.field_key !== "company_name" && p.entity_type === 'lead'
                    )
                  ]
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id || p.field_key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                          <span style={{ fontSize: "12px" }}>{p.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="column-order-side stack" style={{ padding: "16px 20px", backgroundColor: "#fff", gap: "12px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700" }}>SELECTED ({draftColumns.length})</p>
                <div className="scroll-area" style={{ flex: 1, overflowY: "auto" }}>
                  {draftColumns.map((key, idx) => {
                    const prop = [{ id: 0, name: "Company Name", field_key: "company_name" }, ...properties.data].find(p => p.field_key === key);
                    if (!prop) return null;
                    return (
                      <div key={key} draggable onDragStart={(e) => e.dataTransfer.setData("index", idx)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                        const fromIdx = Number(e.dataTransfer.getData("index"));
                        const next = [...draftColumns];
                        const [moved] = next.splice(fromIdx, 1);
                        next.splice(idx, 0, moved);
                        setDraftColumns(next);
                      }} style={{ padding: "8px", background: "#f0f4f7", border: "1px solid #e2e8f0", marginBottom: "4px", borderRadius: "4px", fontSize: "12px", cursor: "grab" }}>
                        {prop.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button className="secondary" onClick={() => setColumnChooserOpen(false)}>Cancel</button>
              <button className="primary" onClick={saveColumnOrder}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "400px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", margin: 0 }}>Update Status</h2>
              <button onClick={() => setStatusModal(null)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <form onSubmit={submitStatusChange} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Status</label>
                <select
                  value={statusForm.status}
                  onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                >
                  <option value="">-</option>
                  {statusModal.property?.options?.filter(o => o.is_active !== false).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Status Remark</label>
                <textarea 
                  value={statusForm.remark} 
                  onChange={e => setStatusForm({ ...statusForm, remark: e.target.value })} 
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", minHeight: "80px", fontFamily: "inherit" }} 
                  placeholder="Enter remark (optional)"
                />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Follow Up Date</label>
                <input 
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={statusForm.followUpDate} 
                  onChange={e => setStatusForm({ ...statusForm, followUpDate: e.target.value })} 
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} 
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="secondary" onClick={() => setStatusModal(null)}>Cancel</button>
                <button type="submit" className="primary" style={{ backgroundColor: "#176b5b", color: "#fff" }}>Update Status</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyModalOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "4px", overflow: "hidden" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "14px" }}>Lead History</h2>
              <button onClick={() => setHistoryModalOpen(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: "20px", maxHeight: "60vh", overflowY: "auto" }}>
              {historyLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>Loading history...</div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No history found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {historyData.filter(h => !historyFilterKey || h.property_key === historyFilterKey).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No history found for this field.</div>
                  ) : historyData.filter(h => !historyFilterKey || h.property_key === historyFilterKey).map(h => (
                    <div key={h.id} style={{ padding: "10px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#f8fafc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                        <span>{new Date(h.created_at).toLocaleString()}</span>
                        <span>{h.user_name || "System"}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155" }}>
                        Changed <strong>{h.property_name}</strong> from <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>{h.old_value || "(empty)"}</span> to <span style={{ color: "#176b5b", fontWeight: "600" }}>{h.new_value || "(empty)"}</span>
                      </div>
                      {h.remark && (
                        <div style={{ marginTop: "6px", padding: "8px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "4px", fontSize: "12px", color: "#475569" }}>
                          <strong>Remark:</strong> {h.remark}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .assign-leads-page .table-wrap { overflow: auto; width: 100%; border: 1px solid #e3e8f0; border-radius: 8px; }
        .company-table { border-collapse: collapse; border-spacing: 0; width: max-content; min-width: 100%; background: #fff; }
        .company-table thead tr th { 
          background: #f7f8fa; 
          border: none;
          padding: 9px 10px;
          box-sizing: border-box;
          height: 42px;
          vertical-align: middle;
          font-weight: 700;
          color: #0f2530;
          position: relative;
        }
        .company-table thead tr:first-child th { padding-bottom: 0; }
        .filter-row th { padding: 2px 10px 10px 10px; border-bottom: 1px solid #c7ced6; }
        .width-input { width: 100%; margin-top: 5px; padding: 2px 5px; font-size: 11px; }
        .assign-leads-page .action-menu { right: 0; top: 100%; }
        .filter-input {
          width: 100%;
          height: 32px;
          margin: 0;
          padding: 0 8px;
          border: 1px solid #d9e2ee;
          border-radius: 4px;
          font-size: 12px;
          color: #172033;
          background: #fff;
          box-sizing: border-box;
        }
        .compact-select {
          height: 32px;
          padding: 0 8px;
          border-radius: 6px;
          border: 1px solid #d9e2ee;
          font-size: 12px;
          background: #fff;
          color: #172033;
          cursor: pointer;
        }
      `}} />
    </div>
  );
}
