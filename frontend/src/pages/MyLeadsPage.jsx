
import React, { useMemo, useState } from "react";
import { Columns3, GripVertical, MoreVertical, Ruler, Save, Search, X, Plus, Phone, Mail, MessageCircle, History, Pencil, Sparkles, SquareCheckBig, Download, Trash2 } from "lucide-react";
import { GridFilterDropdown } from "../components/GridFilterDropdown";
import { ConnectedSourceActions } from "../components/ConnectedSourceActions";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { orderedVisibleColumns, readColumnKeys, writeColumnKeys } from "../utils/columnConfig";
import { MultiSelect } from "../components/MultiSelect";

const MY_LEADS_COLUMN_STORAGE_KEY = "crm.grid.columns.my_leads";
let usersGlobal = [];

const MY_LEADS_STATIC_COLUMNS = [
  { id: 0, name: "Lead / Company Name", field_key: "company_name", grids: [{ grid_key: "my_leads", grid_width: 200, grid_order: -100 }] },
  { id: -1, name: "Assigned By", field_key: "assigned_by_name", grids: [{ grid_key: "my_leads", grid_width: 160, grid_order: 900 }] },
];

function getPropertyValue(record, property) {
  if (property.field_key === "company_name") return record.company_name || "";
  if (property.field_key === "assigned_by_name") return record.assigned_by_name || "";
  if (property.field_key === "call_action") return "";
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
  if (property?.field_key === "company") {
    return [
      { value: "unassigned", label: "Unassigned Data" },
      ...usersGlobal.map((u) => ({ label: u.name, value: String(u.id) }))
    ];
  }
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

function isMultiSelectProperty(property) {
  return property?.object_type === "multiselect";
}

const getVerificationStatusStyle = (value) => {
  if (value === "verified") return { backgroundColor: "#d1fae5", color: "#065f46", fontWeight: "700", border: "1px solid #a7f3d0" };
  if (value === "pending") return { backgroundColor: "#fef3c7", color: "#92400e", fontWeight: "700", border: "1px solid #fde68a" };
  if (value === "unverified") return { backgroundColor: "#fee2e2", color: "#991b1b", fontWeight: "700", border: "1px solid #fecaca" };
  return {};
};

const COLD_LEAD_STATUSES = ["new", "connected", "not_connected", "converted", "not_interested"];

export function MyLeadsPage({ setPage, setEditingId }) {
  const notify = useNotify();
  const { user } = useAuth();
  const canManage = user?.permissions?.includes("companies.manage");
  const canEditLeads = user?.permissions?.includes("leads.my");
  const edit = (company) => {
    setEditingId(company.id);
    setPage("add-company");
  };

  const remove = async (company) => {
    if (!window.confirm(`Delete ${company.company_name}?`)) return;
    try {
      await api.deleteCompany(company.id);
      notify("Company deleted", "success");
      leads.reload();
    } catch (err) {
      notify("Failed to delete company", "error");
    }
  };
  const [q, setQ] = useState("");
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [draftColumns, setDraftColumns] = useState([]);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => readColumnKeys(MY_LEADS_COLUMN_STORAGE_KEY));
  const [columnWidthEdit, setColumnWidthEdit] = useState(false);
  const [draftColumnWidths, setDraftColumnWidths] = useState({});
  const [columnFilters, setColumnFilters] = useState({});
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
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
  const [statusForm, setStatusForm] = useState({ remark: "", followUpDate: "", status: "", requirement: "" });
  const [editingCell, setEditingCell] = useState(null); // { leadId, fieldKey, value }
  const [draftClientReplays, setDraftClientReplays] = useState({}); // { leadId: value }

  const handleInlineEdit = async (companyId, prop, value) => {
    if (prop.field_key === "status" && value === "converted") {
      setStatusModal({ companyId, property: prop, value });
      setStatusForm({ remark: "", followUpDate: "", status: value, requirement: "" });
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
      if (statusForm.status === "converted") {
        if (!statusForm.followUpDate) {
          notify("Follow up date is required for converted inquiries", "error");
          return;
        }
        await api.convertLeadToInquiry(statusModal.companyId, {
          follow_up_date: statusForm.followUpDate,
          remark: statusForm.remark,
          requirement: statusForm.requirement
        });
        notify("Lead converted to Inquiry successfully", "success");
      } else {
        await api.updateCompanyInline(statusModal.companyId, {
          property_id: statusModal.property.id,
          value: statusForm.status,
          remark: statusForm.remark,
          follow_up_date: statusForm.followUpDate || null
        });
        notify("Status updated", "success");
      }
      setStatusModal(null);
      leads.reload();
    } catch (err) { }
  };

  const [leadSort, setLeadSort] = useState({ key: "company_name", direction: "asc" });
  const [showAddModal, setShowAddModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ company_name: "", property_values: [] });

  const users = useLoad(() => api.users(), []);
  usersGlobal = users.data || [];
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

  const submitBulkAction = async () => {
    if (!selectedLeadIds.length) {
      notify("Select at least one lead", "error");
      return;
    }
    if (!bulkAction.startsWith("assign:")) {
      notify("Select an action", "error");
      return;
    }

    const userId = bulkAction.slice("assign:".length);
    try {
      await Promise.all(selectedLeadIds.map((companyId) => api.assignCompany(companyId, userId || null)));
      notify("Bulk assignment updated", "success");
      setSelectedLeadIds([]);
      setBulkAction("");
      leads.reload();
    } catch (err) {
      notify("Failed to update selected leads", "error");
    }
  };

  const gridKey = "my_leads";
  const myLeadsGrid = propertyGrids.data?.find(g => g.key === gridKey);

  const activeProperties = properties.data.filter((property) => property.is_active);
  const connectedSourceProperty = activeProperties.find((property) => property.field_key === "connected_source");

  const openStatusUpdate = (lead, property) => {
    const statusValue = getPropertyValue(lead, property) || "";
    setStatusModal({
      companyId: lead.id,
      property,
      value: statusValue
    });
    setStatusForm({
      remark: "",
      followUpDate: "",
      status: statusValue,
      requirement: ""
    });
  };

  const availableGridProperties = useMemo(() => {
    if (!myLeadsGrid) return MY_LEADS_STATIC_COLUMNS;

    const props = activeProperties
      .filter((property) => property.grids?.some((grid) => grid.grid_key === gridKey))
      .filter((property) => !MY_LEADS_STATIC_COLUMNS.some((column) => column.field_key === property.field_key))
      .sort((a, b) => {
        const gridA = a.grids?.find((g) => g.grid_key === gridKey);
        const gridB = b.grids?.find((g) => g.grid_key === gridKey);
        return (gridA?.grid_order || 0) - (gridB?.grid_order || 0);
      });

    // Add Status as default if available in properties but not in grid
    const statusProp = activeProperties.find(p => p.field_key === "status");
    if (statusProp && !props.some(p => p.field_key === "status")) {
      props.unshift(statusProp);
    }

    return [...MY_LEADS_STATIC_COLUMNS, ...props];
  }, [activeProperties, myLeadsGrid]);
  const gridProperties = useMemo(
    () => orderedVisibleColumns(availableGridProperties, selectedColumnKeys),
    [availableGridProperties, selectedColumnKeys]
  );

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

  const exportLeads = () => {
    const headers = gridProperties.map((p) => p.name);
    const rows = sortedLeads.map((lead) =>
      gridProperties.map((p) => {
        return getPropertyValue(lead, p) || "";
      })
    );
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "my_leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(sortedLeads.length / leadPageSize);
  const visibleLeads = sortedLeads.slice((leadPage - 1) * leadPageSize, leadPage * leadPageSize);
  const selectedLeadIdSet = new Set(selectedLeadIds.map(Number));
  const toggleLeadSelection = (companyId) => {
    const id = Number(companyId);
    setSelectedLeadIds((current) => (
      current.map(Number).includes(id)
        ? current.filter((selectedId) => Number(selectedId) !== id)
        : [...current, id]
    ));
  };
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
      setSelectedColumnKeys(draftColumns);
      writeColumnKeys(MY_LEADS_COLUMN_STORAGE_KEY, draftColumns);
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

        <div className="row-actions">
          <button type="button" className="secondary icon-button" onClick={exportLeads}>
            <Download size={16} /> Export
          </button>
        </div>

        <div className="toolbar-menu-wrap">
          {columnWidthEdit ? (
            <div className="row-actions">
              <button className="secondary icon-button" onClick={() => setColumnWidthEdit(false)}><X size={18} /> Cancel</button>
              <button className="icon-button" onClick={saveColumnWidths}><Save size={18} /> Save Widths</button>
            </div>
          ) : (
            <div className="row-actions">
              <button
                type="button"
                className={`secondary icon-only menu-trigger ${bulkMode ? "active" : ""}`}
                onClick={() => {
                  setBulkMode((current) => !current);
                  setSelectedLeadIds([]);
                  setActionsMenuOpen(false);
                }}
                title="Bulk actions"
              >
                <SquareCheckBig size={18} />
              </button>
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
            {bulkMode && (
              <div className="bulk-action-bar">
                <button type="button" className="bulk-link" onClick={() => setSelectedLeadIds(filteredLeads.map((lead) => Number(lead.id)))}>Select all</button>
                <button type="button" className="bulk-link" onClick={() => setSelectedLeadIds([])}>Unselect all</button>
                <strong>{selectedLeadIds.length}</strong>
                <span>Items Selected</span>
                <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} aria-label="Bulk action">
                  <option value="">Actions</option>
                  <option value="assign:">Unassign leads</option>
                  {users.data?.map((assignee) => (
                    <option key={assignee.id} value={`assign:${assignee.id}`}>Assign to {assignee.name}</option>
                  ))}
                </select>
                <button type="button" className="bulk-submit" onClick={submitBulkAction}>Submit</button>
              </div>
            )}
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    {bulkMode && <th className="bulk-select-col" />}
                    {gridProperties.map((p) => (
                      <th key={p.field_key} style={{ width: `${getColumnWidth(p)}px`, minWidth: `${getColumnWidth(p)}px`, maxWidth: `${getColumnWidth(p)}px` }}>
                        <button className="sort-header" onClick={() => setLeadSort({ key: p.field_key, direction: leadSort.key === p.field_key && leadSort.direction === "asc" ? "desc" : "asc" })}>
                          {p.name} <span>{leadSort.key === p.field_key ? (leadSort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        {columnWidthEdit && p.id > 0 && (
                          <input type="number" value={getColumnWidth(p)} onChange={(e) => setDraftColumnWidths({ ...draftColumnWidths, [p.field_key]: parseInt(e.target.value) })} className="width-input" />
                        )}
                      </th>
                    ))}
                    {canManage && <th style={{ width: "100px" }}>Actions</th>}
                  </tr>
                  <tr className="filter-row">
                    {bulkMode && <th className="bulk-select-col" />}
                    {gridProperties.map((p) => {
                      const dataValues = leads.data.map(l => getPropertyValue(l, p))
                        .flatMap(v => String(v).split(",").map(s => s.trim()))
                        .filter(Boolean);
                      let propOptions = p.options?.map(o => o.value) || [];
                      if (p.field_key === "status") {
                        propOptions = propOptions.filter(val => COLD_LEAD_STATUSES.includes(val));
                      }
                      let uniqueValues = Array.from(new Set([...propOptions, ...dataValues])).sort();
                      if (p.field_key === "status") {
                        uniqueValues = uniqueValues.filter(val => COLD_LEAD_STATUSES.includes(val));
                      }
                      const allOptions = propertyOptions(p);
                      const optionsMap = new Map(allOptions.map(opt => [String(opt.value), opt.label]));
                      const mappedOptions = uniqueValues.map(val => ({
                        value: String(val),
                        label: optionsMap.get(String(val)) || String(val)
                      }));
                      return (
                        <th key={`${p.field_key}-f`} style={{ width: `${getColumnWidth(p)}px`, minWidth: `${getColumnWidth(p)}px`, maxWidth: `${getColumnWidth(p)}px`, padding: "4px 8px" }}>
                          {p.field_key === "call_action" ? (
                            <div style={{ minHeight: "28px" }} />
                          ) : (p.field_key === "assigned_to" || p.field_key === "assigned_by_name" || p.filter_type === "dropdown" || p.filter_type === "multiselect") ? (
                            <GridFilterDropdown label={p.name} options={mappedOptions} value={columnFilters[p.field_key] || []} onChange={(val) => setColumnFilters({ ...columnFilters, [p.field_key]: val })} isMulti={true} />
                          ) : (
                            <input className="filter-input" placeholder={`Filter ${p.name}`} value={columnFilters[p.field_key] || ""} onChange={(e) => setColumnFilters({ ...columnFilters, [p.field_key]: e.target.value })} />
                          )}
                        </th>
                      );
                    })}
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead) => {
                    const statusVal = lead.property_values?.find(pv => pv.field_key === "status")?.value || "";
                    const isInquiry = lead.is_inquiry;
                    let rowClassName = "";
                    if (isInquiry) {
                      const isOrderPlaced = statusVal === "converted_to_order" || statusVal === "completed";
                      if (isOrderPlaced) {
                        rowClassName = "order-placed-row";
                      }
                    }
                    return (
                      <tr key={lead.id} className={rowClassName}>
                      {bulkMode && (
                        <td className="bulk-select-col">
                          <input
                            type="checkbox"
                            checked={selectedLeadIdSet.has(Number(lead.id))}
                            onChange={() => toggleLeadSelection(lead.id)}
                            aria-label={`Select ${lead.company_name}`}
                          />
                        </td>
                      )}
                      {gridProperties.map((p) => {
                        const isEditing = editingCell?.leadId === lead.id && editingCell?.fieldKey === p.field_key;
                        return (
                          <td 
                            key={p.field_key} 
                            style={{ 
                              width: `${getColumnWidth(p)}px`, 
                              minWidth: `${getColumnWidth(p)}px`, 
                              maxWidth: `${getColumnWidth(p)}px`,
                              overflow: isEditing ? 'visible' : 'hidden', 
                              position: 'relative', 
                              zIndex: isEditing ? 100 : 10 
                            }}
                            onDoubleClick={() => {
                              if (p.field_key !== "call_action" && p.field_key !== "assigned_by_name" && p.field_key !== "status" && p.field_key !== "client_replay" && p.field_key !== "connected_source" && !isMultiSelectProperty(p) && p.object_type !== "dropdown" && (canManage || canEditLeads)) {
                                setEditingCell({ leadId: lead.id, fieldKey: p.field_key, value: getPropertyValue(lead, p) });
                              }
                            }}
                          >
                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '2px' }}>
                                {p.object_type === "textarea" ? (
                                  <textarea
                                    style={{
                                      width: "100%",
                                      padding: "4px",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "4px",
                                      fontSize: "12px"
                                    }}
                                    rows={2}
                                    value={editingCell.value || ""}
                                    onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}
                                  />
                                ) : (
                                  <input
                                    style={{
                                      width: "100%",
                                      padding: "4px",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "4px",
                                      fontSize: "12px"
                                    }}
                                    type={p.object_type === "number" ? "number" : p.object_type === "date" ? "date" : "text"}
                                    value={editingCell.value || ""}
                                    onChange={(e) => setEditingCell(prev => ({ ...prev, value: e.target.value }))}
                                  />
                                )}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await handleInlineEdit(lead.id, p, editingCell.value);
                                      setEditingCell(null);
                                    }}
                                    style={{
                                      padding: "2px 8px",
                                      backgroundColor: "#176b5b",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      cursor: "pointer"
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCell(null)}
                                    style={{
                                      padding: "2px 8px",
                                      backgroundColor: "#ef4444",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      cursor: "pointer"
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : p.field_key === "call_action" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                <button
                                  className="cell-icon-button call-action-btn"
                                  style={{
                                    backgroundColor: "#d1fae5",
                                    color: "#065f46",
                                    border: "1px solid #a7f3d0",
                                    borderRadius: "6px",
                                    padding: "6px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer"
                                  }}
                                  onClick={() => {
                                    const statusProp = activeProperties.find(prop => prop.field_key === "status");
                                    if (statusProp) {
                                      openStatusUpdate(lead, statusProp);
                                    } else {
                                      notify("Status property configuration not found", "error");
                                    }
                                  }}
                                  title="Call Lead / Update Status"
                                >
                                  <Phone size={14} />
                                </button>
                                {(lead.history_keys?.includes("connected_source") || lead.history_keys?.includes("status")) && (
                                  <button className="cell-icon-button" onClick={() => openHistory(lead.id, ["status", "connected_source"])} title="View Call History">
                                    <History size={14} />
                                  </button>
                                )}
                              </div>
                            ) : p.field_key === "client_replay" ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '2px', width: "100%" }}>
                                <input
                                  style={{
                                    width: "100%",
                                    padding: "4px 8px",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    boxSizing: "border-box"
                                  }}
                                  type="text"
                                  value={draftClientReplays[lead.id] !== undefined ? draftClientReplays[lead.id] : (getPropertyValue(lead, p) || "")}
                                  disabled={!(canManage || canEditLeads)}
                                  onChange={(e) => setDraftClientReplays(prev => ({ ...prev, [lead.id]: e.target.value }))}
                                  placeholder="Enter reply..."
                                />
                                {draftClientReplays[lead.id] !== undefined && draftClientReplays[lead.id] !== (getPropertyValue(lead, p) || "") && (
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const val = draftClientReplays[lead.id];
                                        await handleInlineEdit(lead.id, p, val);
                                        setDraftClientReplays(prev => {
                                          const next = { ...prev };
                                          delete next[lead.id];
                                          return next;
                                        });
                                      }}
                                      style={{
                                        padding: "2px 8px",
                                        backgroundColor: "#176b5b",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: "4px",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDraftClientReplays(prev => {
                                          const next = { ...prev };
                                          delete next[lead.id];
                                          return next;
                                        });
                                      }}
                                      style={{
                                        padding: "2px 8px",
                                        backgroundColor: "#ef4444",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: "4px",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : p.field_key === "status" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: "100%" }}>
                                <select
                                  className="inline-select"
                                  style={{
                                    flex: 1,
                                    padding: "4px",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    fontWeight: "600",
                                    color: lead.is_inquiry ? "#176b5b" : "inherit"
                                  }}
                                  value={getPropertyValue(lead, p) || ""}
                                  disabled={!(canManage || canEditLeads)}
                                  onChange={(e) => handleInlineEdit(lead.id, p, e.target.value)}
                                >
                                  <option value="">-</option>
                                  {p.options?.filter(o => o.is_active !== false && COLD_LEAD_STATUSES.includes(o.value)).map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                                {(lead.history_keys?.includes("status") || lead.history_keys?.includes("connected_source")) && (
                                  <button className="cell-icon-button" onClick={() => openHistory(lead.id, ["status", "connected_source"])} title="View Status History">
                                    <History size={14} />
                                  </button>
                                )}
                              </div>
                          ) : p.field_key === "connected_source" ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className="cell-text" title={getPropertyValue(lead, p)} style={{ flex: 1, fontWeight: "600", fontSize: "12px" }}>
                                {getPropertyValue(lead, p) || "-"}
                              </span>
                              <ConnectedSourceActions
                                companyId={lead.id}
                                connectedSourceProperty={p}
                                connectedSourceValue={getPropertyValue(lead, p)}
                                contactNumber={getPropertyValue(lead, { field_key: "contact_number" })}
                                emailId={getPropertyValue(lead, { field_key: "email_id" })}
                                onUpdated={leads.reload}
                                statusProperty={activeProperties.find(prop => prop.field_key === "status")}
                                currentStatus={getPropertyValue(lead, { field_key: "status" })}
                              />
                              {(lead.history_keys?.includes("connected_source") || lead.history_keys?.includes("status")) && (
                                <button className="cell-icon-button" onClick={() => openHistory(lead.id, ["status", "connected_source"])} title="View Connected Source History">
                                  <History size={14} />
                                </button>
                              )}
                            </div>
                          ) : isMultiSelectProperty(p) ? (
                            <div className="inline-multi-select">
                              <GridFilterDropdown
                                label={formatPropertyValue(p, getPropertyValue(lead, p)) || "-"}
                                options={propertyOptions(p)}
                                value={splitMultiValue(getPropertyValue(lead, p))}
                                onChange={(val) => handleInlineEdit(lead.id, p, val.join(","))}
                                isMulti={true}
                              />
                            </div>
                          ) : p.object_type === "dropdown" ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <select
                                className="inline-select"
                                style={{
                                  flex: 1,
                                  padding: "4px",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                  ...getVerificationStatusStyle(getPropertyValue(lead, p))
                                }}
                                value={getPropertyValue(lead, p) || ""}
                                onChange={(e) => handleInlineEdit(lead.id, p, e.target.value)}
                              >
                                <option value="">-</option>
                                {p.options?.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              {lead.history_keys?.includes(p.field_key) && (
                                <button type="button" className="cell-icon-button" onClick={() => openHistory(lead.id, p.field_key)} title={`View ${p.name} History`} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
                                  <History size={14} style={{ color: "#64748b" }} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="cell-text" title={getPropertyValue(lead, p)}>
                              {p.field_key === "company_name" ? <strong>{getPropertyValue(lead, p)}</strong> : getPropertyValue(lead, p)}
                            </span>
                          )}
                        </td>
                      );
                      })}
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button type="button" className="secondary icon-only" onClick={() => edit(lead)} title="Edit Company"><Pencil size={16} /></button>
                            <button type="button" className="danger icon-only" onClick={() => remove(lead)} title="Delete Company"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
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
              <h2 style={{ fontSize: "14px" }}>Choose Columns (datas)</h2>
              <button onClick={() => setColumnChooserOpen(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div className="column-chooser-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "min(480px, calc(100vh - 170px))", minHeight: 0 }}>
              <div className="column-pool-side stack" style={{ padding: "16px 20px", borderRight: "1px solid #e2e8f0", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
                <input placeholder="Search columns..." value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px" }} />
                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "4px" }}>Company Properties</p>
                  {MY_LEADS_STATIC_COLUMNS.filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase())).map(p => {
                    const isSelected = draftColumns.includes(p.field_key);
                    return (
                      <label key={p.field_key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                        <span style={{ fontSize: "12px" }}>{p.name}</span>
                      </label>
                    );
                  })}
                  {activeProperties.filter(p => !MY_LEADS_STATIC_COLUMNS.some((column) => column.field_key === p.field_key) && p.entity_type !== 'lead').filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase())).map(p => {
                    const isSelected = draftColumns.includes(p.field_key);
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                        <span style={{ fontSize: "12px" }}>{p.name}</span>
                      </label>
                    );
                  })}
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "16px" }}>Lead Group</p>
                  {activeProperties.filter(p => !MY_LEADS_STATIC_COLUMNS.some((column) => column.field_key === p.field_key) && p.field_key !== "connected_source" && p.entity_type === 'lead').filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase())).map(p => {
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
              <div className="column-order-side stack" style={{ padding: "16px 20px", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
                <p style={{ fontSize: "11px", fontWeight: "700" }}>SELECTED ({draftColumns.length})</p>
                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto" }}>
                  {draftColumns.map((key, idx) => {
                    const prop = [...MY_LEADS_STATIC_COLUMNS, ...properties.data].find(p => p.field_key === key);
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
                  {statusModal.property?.options?.filter(o => o.is_active !== false && COLD_LEAD_STATUSES.includes(o.value)).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {statusForm.status === "converted" && (
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>Requirement *</label>
                  <input
                    type="text"
                    required
                    value={statusForm.requirement}
                    onChange={e => setStatusForm({ ...statusForm, requirement: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                    placeholder="Enter customer requirement"
                  />
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
                    {prop.object_type === "dropdown" || isMultiSelectProperty(prop) ? (
                      <select
                        multiple={isMultiSelectProperty(prop)}
                        value={isMultiSelectProperty(prop) ? splitMultiValue(leadForm.property_values.find(pv => pv.property_id === prop.id)?.value) : (leadForm.property_values.find(pv => pv.property_id === prop.id)?.value || "")}
                        onChange={e => {
                          const val = isMultiSelectProperty(prop) ? Array.from(e.target.selectedOptions, o => o.value).join(",") : e.target.value;
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
                        <span>{h.user_name || "System"}{h.our_company_names ? ` (${h.our_company_names})` : ""}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155" }}>
                        {h.property_key === "connected_source" ? (
                          <><strong>{h.remark || "Connected source logged"}</strong> on {new Date(h.created_at).toLocaleDateString()}</>
                        ) : (
                          <>Changed <strong>{h.property_name}</strong> from <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>{h.old_value || "(empty)"}</span> to <span style={{ color: "#176b5b", fontWeight: "600" }}>{h.new_value || "(empty)"}</span></>
                        )}
                      </div>
                      {h.remark && h.property_key !== "connected_source" && (
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
        .company-table { width: max-content; min-width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
        .company-table th, .company-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left; overflow: hidden; box-sizing: border-box; }
        .company-table thead tr:first-child th {
          position: sticky;
          top: 0;
          z-index: 1000;
          height: 38px;
          padding: 8px 12px;
          background: #f8fafc;
          font-weight: 700;
          color: #475569;
          box-sizing: border-box;
        }
        .company-table .filter-row th {
          position: sticky;
          top: 38px;
          z-index: 999;
          height: 44px;
          background: #f8fafc;
          padding: 6px 12px;
          box-sizing: border-box;
        }
        .company-table .filter-row input { width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; }
        .my-leads-page .inline-multi-select .premium-filter-trigger {
          height: 30px;
          min-width: 110px;
          padding: 0 8px;
          border-color: #d9e2ee;
          border-radius: 6px;
          color: #334155;
          font-size: 12px;
          background: #fff;
        }
        .my-leads-page .inline-multi-select .premium-filter-trigger.active {
          color: #176b5b;
          background: #f0fdf4;
          border-color: #b7e4d7;
        }
        .my-leads-page .menu-trigger.active {
          color: #176b5b;
          border-color: #9fd5ca;
          background: #e9f8f4;
        }
        .bulk-action-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: #e5f3ef;
          border: 1px solid #b8dcd4;
          border-bottom: 0;
          border-radius: 8px 8px 0 0;
          color: #0f172a;
          font-size: 12px;
        }
        .bulk-link {
          height: 30px;
          padding: 0 10px;
          border: 0;
          border-right: 1px solid #abcfc7;
          background: transparent;
          color: #176b5b;
          cursor: pointer;
          font-weight: 600;
        }
        .bulk-action-bar select {
          width: 180px;
          height: 34px;
          padding: 0 12px;
          border: 1px solid #9fcfc5;
          border-radius: 6px;
          background: #fff;
          color: #0f172a;
          font-size: 12px;
        }
        .bulk-submit {
          height: 34px;
          padding: 0 16px;
          border: 0;
          border-radius: 6px;
          background: #176b5b;
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
        }
        .bulk-select-col {
          width: 42px !important;
          min-width: 42px !important;
          max-width: 42px !important;
          text-align: center !important;
          padding: 0 !important;
        }
        .bulk-select-col input {
          width: 14px;
          height: 14px;
          accent-color: #176b5b;
        }
        .status-connected-source .premium-filter-trigger {
          height: 38px;
          padding: 0 10px;
          border-color: #cbd5e1;
          border-radius: 6px;
          color: #334155;
          background: #fff;
        }
        .company-table .filter-row input:focus { border-color: #176b5b; outline: none; box-shadow: 0 0 0 2px rgba(23, 107, 91, 0.1); }
        .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .sort-header span { color: #94a3b8; font-size: 10px; }
        .width-input { width: 60px; font-size: 10px; margin-top: 4px; border: 1px solid #cbd5e1; border-radius: 3px; padding: 2px 4px; }
        .cell-text { display: block; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cell-icon-button {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 28px;
          border: 0;
          border-radius: 8px;
          background: #0f766e;
          color: #fff;
          cursor: pointer;
          padding: 0;
        }
        .cell-icon-button:hover {
          background: #115e59;
        }
        .quick-connect-cell { display: flex; gap: 8px; align-items: center; }
        .connect-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; color: #fff; transition: transform 0.2s, opacity 0.2s; text-decoration: none; }
        .connect-btn:hover { transform: scale(1.15); opacity: 0.95; }
        .connect-btn.whatsapp { background-color: #25D366; }
        .connect-btn.call { background-color: #3b82f6; }
        .connect-btn.email { background-color: #ef4444; }
        .connect-btn.disabled { background-color: #f1f5f9; color: #cbd5e1; cursor: not-allowed; pointer-events: none; }
      `}} />
    </div>
  );
}
