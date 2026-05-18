
import React, { useMemo, useState } from "react";
import { Columns3, GripVertical, MoreVertical, Ruler, Save, Search, X, Plus } from "lucide-react";
import { GridFilterDropdown } from "../components/GridFilterDropdown";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";

function getPropertyValue(record, property) {
  if (property.field_key === "company_name") return record.company_name || "";
  if (property.field_key === "assigned_by_name") return record.assigned_by_name || "";
  const pv = record.property_values?.find((v) => v.field_key === property.field_key);
  return pv ? pv.value : "";
}

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

export function MyLeadsPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [draftColumns, setDraftColumns] = useState([]);
  const [columnWidthEdit, setColumnWidthEdit] = useState(false);
  const [draftColumnWidths, setDraftColumnWidths] = useState({});
  const [columnFilters, setColumnFilters] = useState({});
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [leadPage, setLeadPage] = useState(1);
  const [leadPageSize, setLeadPageSize] = useState(25);
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
    } catch (err) { }
    setHistoryLoading(false);
  };

  const [statusModal, setStatusModal] = useState(null);
  const [statusForm, setStatusForm] = useState({ remark: "", followUpDate: "", status: "", connectedSource: "" });

  const handleInlineEdit = async (companyId, prop, value) => {
    if (prop.field_key === "status") {
      setStatusModal({ companyId, property: prop, value });
      setStatusForm({ remark: "", followUpDate: "", status: value, connectedSource: "" });
      return;
    }
    try {
      await api.updateCompanyInline(companyId, { property_id: prop.id, value });
      notify("Updated successfully", "success");
      leads.reload();
    } catch (err) { }
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
      if (
        connectedSourceProperty &&
        statusModal.connectedSourceValue !== statusForm.connectedSource
      ) {
        await api.updateCompanyInline(statusModal.companyId, {
          property_id: connectedSourceProperty.id,
          value: statusForm.connectedSource
        });
      }
      notify("Status updated", "success");
      setStatusModal(null);
      leads.reload();
    } catch (err) {}
  };

  const [leadSort, setLeadSort] = useState({ key: "company_name", direction: "asc" });
  const [showAddModal, setShowAddModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ company_name: "", property_values: [] });

  const users = useLoad(() => api.users(), []);
  const leads = useLoad(() => api.myLeads(q), [q]);
  const properties = useLoad(() => api.properties(), []);
  const propertyGrids = useLoad(() => api.propertyGrids(), []);

  const handleAssign = async (companyId, userId) => {
    try {
      await api.assignCompany(companyId, userId || null);
      notify("Lead assigned successfully", "success");
      leads.reload();
    } catch (err) {
      notify("Failed to assign lead", "error");
    }
  };

  const gridKey = "my_leads";
  const myLeadsGrid = propertyGrids.data?.find(g => g.key === gridKey);

  const activeProperties = properties.data.filter((property) => property.is_active);
  const connectedSourceProperty = activeProperties.find((property) => property.field_key === "connected_source");

  const openStatusUpdate = (lead, property) => {
    const statusValue = getPropertyValue(lead, property) || "";
    const connectedSourceValue = connectedSourceProperty ? getPropertyValue(lead, connectedSourceProperty) || "" : "";
    setStatusModal({
      companyId: lead.id,
      property,
      value: statusValue,
      connectedSourceValue
    });
    setStatusForm({
      remark: "",
      followUpDate: "",
      status: statusValue,
      connectedSource: connectedSourceValue
    });
  };

  const gridProperties = useMemo(() => {
    if (!myLeadsGrid) return [{ id: 0, name: "Company Name", field_key: "company_name" }, { id: -1, name: "Assigned By", field_key: "assigned_by_name" }];

    const props = activeProperties
      .filter((property) => property.grids?.some((grid) => grid.grid_key === gridKey))
      .filter((property) => property.field_key !== "connected_source")
      .sort((a, b) => {
        const gridA = a.grids?.find((g) => g.grid_key === gridKey);
        const gridB = b.grids?.find((g) => g.grid_key === gridKey);
        return (gridA?.grid_order || 0) - (gridB?.grid_order || 0);
      });

    const defaultProps = [];
    if (!props.some(p => p.field_key === "company_name")) {
      defaultProps.push({ id: 0, name: "Company Name", field_key: "company_name" });
    }
    if (!props.some(p => p.field_key === "assigned_by_name")) {
      defaultProps.push({ id: -1, name: "Assigned By", field_key: "assigned_by_name" });
    }
    if (!props.some(p => p.field_key === "assigned_to")) {
      defaultProps.push({ id: -2, name: "Assigned To", field_key: "assigned_to" });
    }

    // Add Status as default if available in properties but not in grid
    const statusProp = activeProperties.find(p => p.field_key === "status");
    if (statusProp && !props.some(p => p.field_key === "status")) {
      defaultProps.push(statusProp);
    }

    return [...defaultProps, ...props];
  }, [activeProperties, myLeadsGrid]);

  const filteredLeads = useMemo(() => {
    return leads.data.filter((lead) =>
      gridProperties.every((property) => {
        const filter = columnFilters[property.field_key];
        if (!filter || (Array.isArray(filter) && filter.length === 0)) return true;
        const value = String(getPropertyValue(lead, property)).toLowerCase();
        if (Array.isArray(filter)) {
          const valueAtoms = value.split(",").map(s => s.trim());
          return filter.some(f => valueAtoms.includes(String(f).toLowerCase()));
        }
        return value.includes(String(filter).toLowerCase());
      })
    );
  }, [leads.data, gridProperties, columnFilters]);

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      const prop = gridProperties.find((p) => p.field_key === leadSort.key);
      const valA = prop ? getPropertyValue(a, prop) : a.company_name;
      const valB = prop ? getPropertyValue(b, prop) : b.company_name;
      const res = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return leadSort.direction === "asc" ? res : -res;
    });
  }, [filteredLeads, gridProperties, leadSort]);

  const totalPages = Math.ceil(sortedLeads.length / leadPageSize);
  const visibleLeads = sortedLeads.slice((leadPage - 1) * leadPageSize, leadPage * leadPageSize);
  const visibleHistory = historyData.filter((item) => {
    if (!historyFilterKey) return true;
    if (Array.isArray(historyFilterKey)) return historyFilterKey.includes(item.property_key);
    return item.property_key === historyFilterKey;
  });

  const getColumnWidth = (property) => {
    const grid = property.grids?.find(g => g.grid_key === gridKey);
    return Math.min(Math.max(draftColumnWidths[property.field_key] || grid?.grid_width || property.grid_width || 160, 80), 640);
  };

  const saveColumnWidths = async () => {
    const updates = Object.entries(draftColumnWidths).map(([key, width]) => {
      const prop = gridProperties.find(p => p.field_key === key);
      if (!prop || prop.id <= 0) return null;
      const gridMapping = prop.grids?.find(g => g.grid_key === gridKey);
      return { id: prop.id, grid_id: myLeadsGrid.id, grid_width: width, show_on_grid: true, grid_order: gridMapping?.grid_order || 0 };
    }).filter(Boolean);

    if (updates.length) {
      try {
        await api.updatePropertyGridColumns(updates);
        notify("Column widths saved", "success");
        properties.reload();
      } catch (err) {
        notify("Failed to save column widths", "error");
      }
    }
    setColumnWidthEdit(false);
  };

  const openColumnChooser = () => {
    setDraftColumns(gridProperties.map(p => p.field_key));
    setColumnChooserOpen(true);
  };

  const saveColumnOrder = async () => {
    const updates = properties.data.map(p => {
      if (p.id <= 0) return null;
      const isSelected = draftColumns.includes(p.field_key);
      const gridMapping = p.grids?.find(g => g.grid_key === gridKey);

      if (isSelected) {
        return {
          id: p.id,
          grid_id: myLeadsGrid.id,
          show_on_grid: true,
          grid_order: draftColumns.indexOf(p.field_key),
          grid_width: gridMapping?.grid_width || 160
        };
      } else if (gridMapping) {
        return { id: p.id, grid_id: myLeadsGrid.id, show_on_grid: false, grid_order: 0, grid_width: gridMapping.grid_width };
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

  const handleAddLead = async (e) => {
    e.preventDefault();
    try {
      await api.createLead(leadForm);
      notify("Lead added successfully", "success");
      setShowAddModal(false);
      setLeadForm({ company_name: "", property_values: [] });
      leads.reload();
    } catch (err) {
      notify("Failed to add lead", "error");
    }
  };

  const updateLeadProp = (propId, value) => {
    setLeadForm(prev => {
      const existing = prev.property_values.find(p => p.property_id === propId);
      if (existing) {
        return { ...prev, property_values: prev.property_values.map(p => p.property_id === propId ? { ...p, value } : p) };
      }
      return { ...prev, property_values: [...prev.property_values, { property_id: propId, value }] };
    });
  };

  const hasAddPermission = user?.permissions?.includes("leads.add") || user?.permissions?.includes("companies.manage");

  return (
    <div className="stack my-leads-page">
      <div className="toolbar split-toolbar">
        <div className="row-actions">
          <input className="search" placeholder="Search leads..." value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="user-debug-info" style={{ marginLeft: '10px', fontSize: '11px', color: '#94a3b8' }}>
            Logged in as: <strong>{user?.name} (ID: {user?.id})</strong>
          </span>
        </div>

        {hasAddPermission && (
          <button className="icon-button" onClick={() => { setLeadForm({ company_name: "", property_values: [] }); setShowAddModal(true); }}>
            <Plus size={16} /> Add Lead
          </button>
        )}

          <div className="toolbar-menu-wrap">
            {columnWidthEdit ? (
              <div className="row-actions">
                <button className="secondary icon-button" onClick={() => setColumnWidthEdit(false)}><X size={18} /> Cancel</button>
                <button className="icon-button" onClick={saveColumnWidths}><Save size={18} /> Save Widths</button>
              </div>
            ) : (
              <div className="row-actions">
                <button className="secondary icon-only menu-trigger" onClick={() => setActionsMenuOpen(!actionsMenuOpen)}><MoreVertical size={18} /></button>
                {actionsMenuOpen && (
                  <div className="action-menu">
                    <button onClick={() => { setColumnWidthEdit(true); setActionsMenuOpen(false); }}><Ruler size={17} /> Edit Widths</button>
                    <button onClick={() => { openColumnChooser(); setActionsMenuOpen(false); }}><Columns3 size={17} /> Choose Columns</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="data-grid">
          {!leads.data.length ? (
            <div className="muted">No leads assigned to you.</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="company-table">
                  <thead>
                    <tr>
                      {gridProperties.map((p) => (
                        <th key={p.field_key} style={{ width: `${getColumnWidth(p)}px` }}>
                          <button className="sort-header" onClick={() => setLeadSort({ key: p.field_key, direction: leadSort.key === p.field_key && leadSort.direction === "asc" ? "desc" : "asc" })}>
                            {p.name} <span>{leadSort.key === p.field_key ? (leadSort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                          </button>
                          {columnWidthEdit && p.id > 0 && (
                            <input type="number" value={getColumnWidth(p)} onChange={(e) => setDraftColumnWidths({ ...draftColumnWidths, [p.field_key]: parseInt(e.target.value) })} className="width-input" />
                          )}
                        </th>
                      ))}
                    </tr>
                    <tr className="filter-row">
                      {gridProperties.map((p) => {
                        const dataValues = leads.data.map(l => getPropertyValue(l, p))
                          .flatMap(v => String(v).split(",").map(s => s.trim()))
                          .filter(Boolean);
                        const propOptions = p.options?.map(o => o.value) || [];
                        const uniqueValues = Array.from(new Set([...propOptions, ...dataValues])).sort();
                        return (
                          <th key={`${p.field_key}-f`} style={{ width: `${getColumnWidth(p)}px`, padding: "4px 8px" }}>
                            {p.filter_type === "dropdown" || p.filter_type === "multiselect" ? (
                              <GridFilterDropdown label={p.name} options={uniqueValues} value={columnFilters[p.field_key] || []} onChange={(val) => setColumnFilters({ ...columnFilters, [p.field_key]: val })} isMulti={true} />
                            ) : (
                              <input className="filter-input" placeholder={`Filter ${p.name}`} value={columnFilters[p.field_key] || ""} onChange={(e) => setColumnFilters({ ...columnFilters, [p.field_key]: e.target.value })} />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead) => (
                      <tr key={lead.id}>
                        {gridProperties.map((p) => (
                          <td key={p.field_key}>
                            {p.field_key === "assigned_to" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  className="compact-select"
                                  value={lead.assigned_to || ""}
                                  onChange={(e) => handleAssign(lead.id, e.target.value)}
                                  style={{ flex: 1, height: "28px", fontSize: "12px", padding: "0 8px", borderRadius: "6px", border: "1px solid #d9e2ee", background: lead.assigned_to ? "#f0fdf4" : "#fff" }}
                                >
                                  <option value="">Not Assigned</option>
                                  {users.data?.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                                </select>
                                <button className="icon-button small" onClick={() => openHistory(lead.id, "assigned_to")} title="View Assignment History" style={{ padding: "4px" }}>
                                  <span style={{ fontSize: "14px" }}>🕒</span>
                                </button>
                              </div>
                            ) : p.field_key === "status" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span className="cell-text" title={formatPropertyValue(p, getPropertyValue(lead, p))} style={{ flex: 1, fontWeight: "600", fontSize: "12px" }}>
                                  {formatPropertyValue(p, getPropertyValue(lead, p)) || "-"}
                                </span>
                                <button className="icon-button small" onClick={() => openStatusUpdate(lead, p)} title="Update Status" style={{ padding: "4px", flexShrink: 0 }}>
                                  <span style={{ fontSize: "14px" }}>✏️</span>
                                </button>
                                <button className="icon-button small" onClick={() => openHistory(lead.id, ["status", "connected_source"])} title="View Status History" style={{ padding: "4px", flexShrink: 0 }}>
                                  <span style={{ fontSize: "14px" }}>🕒</span>
                                </button>
                              </div>
                            ) : p.filter_type === "dropdown" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  className="inline-select"
                                  style={{ flex: 1, padding: "4px", border: "1px solid #e2e8f0", borderRadius: "4px", background: "transparent", fontSize: "12px", color: "#334155" }}
                                  value={getPropertyValue(lead, p) || ""}
                                  onChange={(e) => handleInlineEdit(lead.id, p, e.target.value)}
                                >
                                  <option value="">-</option>
                                  {p.options?.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <span className="cell-text" title={getPropertyValue(lead, p)}>
                                {p.field_key === "company_name" ? <strong>{getPropertyValue(lead, p)}</strong> : getPropertyValue(lead, p)}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={leadPage} totalPages={totalPages} pageSize={leadPageSize} totalRows={filteredLeads.length} onPageChange={setLeadPage} onPageSizeChange={setLeadPageSize} />
            </>
          )}
        </div>

        {columnChooserOpen && (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
            <div className="modal column-modal" style={{ maxWidth: "880px", width: "95%", backgroundColor: "#fff", borderRadius: "4px", overflow: "hidden" }}>
              <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: "14px" }}>Choose Columns (My Leads)</h2>
                <button onClick={() => setColumnChooserOpen(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={18} /></button>
              </div>
              <div className="column-chooser-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "480px" }}>
                <div className="column-pool-side stack" style={{ padding: "16px 20px", borderRight: "1px solid #e2e8f0" }}>
                  <input placeholder="Search columns..." value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px" }} />
                  <div className="scroll-area" style={{ flex: 1, overflowY: "auto" }}>
                    <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "4px" }}>Company Properties</p>
                    {activeProperties.filter(p => p.field_key !== "company_name" && p.field_key !== "assigned_by_name" && p.entity_type !== 'lead').filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase())).map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                          <span style={{ fontSize: "12px" }}>{p.name}</span>
                        </label>
                      );
                    })}
                    <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "16px" }}>Lead Group</p>
                    {activeProperties.filter(p => p.field_key !== "company_name" && p.field_key !== "assigned_by_name" && p.field_key !== "connected_source" && p.entity_type === 'lead').filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase())).map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                          <span style={{ fontSize: "12px" }}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="column-order-side stack" style={{ padding: "16px 20px" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700" }}>SELECTED ({draftColumns.length})</p>
                  <div className="scroll-area" style={{ flex: 1, overflowY: "auto" }}>
                    {draftColumns.map((key, idx) => {
                      const prop = [{ id: 0, name: "Company Name", field_key: "company_name" }, { id: -1, name: "Assigned By", field_key: "assigned_by_name" }, ...properties.data].find(p => p.field_key === key);
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
                {connectedSourceProperty && (
                  <div style={{ marginBottom: "15px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Connected Source</label>
                    <select
                      value={statusForm.connectedSource}
                      onChange={e => setStatusForm({ ...statusForm, connectedSource: e.target.value })}
                      style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                    >
                      <option value="">-</option>
                      {connectedSourceProperty.options?.filter(o => o.is_active !== false).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
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

        {showAddModal && (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
            <div className="modal" style={{ maxWidth: "500px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden" }}>
              <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "16px", margin: 0 }}>Add New Lead</h2>
                <button onClick={() => setShowAddModal(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
              </div>
              <form onSubmit={handleAddLead} style={{ padding: "20px" }}>
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Company Name *</label>
                  <input required value={leadForm.company_name} onChange={e => setLeadForm({ ...leadForm, company_name: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }} />
                </div>

                <div className="scroll-area" style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "20px" }}>
                  {activeProperties.filter(p => p.entity_type === 'lead').map(prop => (
                    <div key={prop.id} style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>{prop.name}</label>
                      {prop.object_type === "dropdown" || prop.object_type === "multiselect" ? (
                        <select
                          multiple={prop.object_type === "multiselect"}
                          value={prop.object_type === "multiselect" ? splitMultiValue(leadForm.property_values.find(pv => pv.property_id === prop.id)?.value) : (leadForm.property_values.find(pv => pv.property_id === prop.id)?.value || "")}
                          onChange={e => {
                            const val = prop.object_type === "multiselect" ? Array.from(e.target.selectedOptions, o => o.value).join(",") : e.target.value;
                            updateLeadProp(prop.id, val);
                          }}
                          style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                        >
                          <option value="">Select option</option>
                          {prop.options?.map(opt => <option key={opt.id} value={opt.value}>{opt.label}</option>)}
                        </select>
                      ) : (
                        <input
                          type={prop.object_type === "number" ? "number" : "text"}
                          value={leadForm.property_values.find(pv => pv.property_id === prop.id)?.value || ""}
                          onChange={e => updateLeadProp(prop.id, e.target.value)}
                          style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #f1f5f9", paddingTop: "15px" }}>
                  <button type="button" className="secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="primary" style={{ backgroundColor: "#176b5b", color: "#fff" }}>Save Lead</button>
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
                  {visibleHistory.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No history found for this field.</div>
                  ) : visibleHistory.map(h => (
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
        .my-leads-page .stack { gap: 0; }
        .my-leads-page .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
        .company-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: max-content; }
        .company-table th, .company-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left; }
        .company-table thead th { background: #f8fafc; font-weight: 700; position: sticky; top: 0; z-index: 20; color: #475569; }
        .company-table .filter-row th { background: #f8fafc; position: sticky; top: 41px; z-index: 15; padding: 6px 12px; }
        .company-table .filter-row input { width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; }
        .company-table .filter-row input:focus { border-color: #176b5b; outline: none; box-shadow: 0 0 0 2px rgba(23, 107, 91, 0.1); }
        .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .sort-header span { color: #94a3b8; font-size: 10px; }
        .width-input { width: 60px; font-size: 10px; margin-top: 4px; border: 1px solid #cbd5e1; border-radius: 3px; padding: 2px 4px; }
        .cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}} />
      </div>
      );
}
