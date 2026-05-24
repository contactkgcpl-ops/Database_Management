import React, { useState, useMemo } from "react";
import { Search, X, MoreVertical, Ruler, Columns3, Save, History, SquareCheckBig } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";
import { Pagination } from "../components/Pagination";
import { GridFilterDropdown } from "../components/GridFilterDropdown";
import { ConnectedSourceActions } from "../components/ConnectedSourceActions";
import { orderedVisibleColumns, readColumnKeys, writeColumnKeys } from "../utils/columnConfig";
import { useAuth } from "../context/AuthContext";

const ASSIGN_LEADS_COLUMN_STORAGE_KEY = "crm.grid.columns.assign_leads";
const ASSIGN_LEADS_STATIC_COLUMNS = [
  { id: 0, name: "Company Name", field_key: "company_name", grids: [{ grid_key: "assign_leads", grid_width: 200, grid_order: -100 }] },
  { id: -1, name: "Assigned To", field_key: "assigned_to", grids: [{ grid_key: "assign_leads", grid_width: 210, grid_order: 900 }] },
  { id: -2, name: "Assigned By", field_key: "assigned_by_name", grids: [{ grid_key: "assign_leads", grid_width: 160, grid_order: 910 }] },
];
const READ_ONLY_HISTORY_FIELDS = new Set(["status", "connected_source"]);

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

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

export function AssignLeadsPage() {
  const { user } = useAuth();
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
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => readColumnKeys(ASSIGN_LEADS_COLUMN_STORAGE_KEY));
  const [columnWidths, setColumnWidths] = useState({});
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");

  // Pagination & Filtering (Simplified local version for now)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columnFilters, setColumnFilters] = useState({});
  const [sort, setSort] = useState({ key: "id", direction: "desc" });

  const assignLeadsGrid = propertyGrids.data?.find(g => g.key === "assign_leads");

  const availableGridProperties = useMemo(() => {
    if (!assignLeadsGrid || !properties.data) return [];

    const dynamic = properties.data
      .filter(p => p.grids?.some(g => g.grid_id === assignLeadsGrid.id))
      .filter(p => !ASSIGN_LEADS_STATIC_COLUMNS.some(column => column.field_key === p.field_key))
      .sort((a, b) => {
        const orderA = a.grids.find(g => g.grid_id === assignLeadsGrid.id)?.grid_order || 0;
        const orderB = b.grids.find(g => g.grid_id === assignLeadsGrid.id)?.grid_order || 0;
        return orderA - orderB;
      });

    return [...ASSIGN_LEADS_STATIC_COLUMNS, ...dynamic];
  }, [assignLeadsGrid, properties.data]);
  const gridProperties = useMemo(
    () => orderedVisibleColumns(availableGridProperties, selectedColumnKeys),
    [availableGridProperties, selectedColumnKeys]
  );

  const getColumnWidth = (p) => {
    if (columnWidths[p.field_key] !== undefined) return columnWidths[p.field_key];
    return p.grids?.find(g => g.grid_id === assignLeadsGrid?.id || g.grid_key === "assign_leads")?.grid_width || 160;
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
    } catch (err) { }
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
      notify("Status updated", "success");
      setStatusModal(null);
      companies.reload();
    } catch (err) { }
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
      setSelectedColumnKeys(draftColumns);
      writeColumnKeys(ASSIGN_LEADS_COLUMN_STORAGE_KEY, draftColumns);
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
      companies.reload();
    } catch (err) {
      notify("Failed to update selected leads", "error");
    }
  };

  const getVal = (company, prop) => {
    if (prop.field_key === "company_name") return company.company_name;
    if (prop.field_key === "assigned_to") return getAssignedToName(company);
    if (prop.field_key === "assigned_by_name") return company.assigned_by_name || "System";
    const pv = company.property_values?.find(v => v.property_id === prop.id || v.field_key === prop.field_key);
    return pv ? pv.value : "";
  };

  const getAssignedToName = (company) => {
    if (!company.assigned_to) return "Not Assigned";
    const user = users.data?.find((u) => Number(u.id) === Number(company.assigned_to));
    return company.assigned_user_name || user?.name || String(company.assigned_to);
  };

  const assignedToOptions = useMemo(
    () => uniqueSorted((companies.data || []).map((company) => getAssignedToName(company))),
    [companies.data, users.data]
  );

  const assignedByOptions = useMemo(
    () => uniqueSorted((companies.data || []).map((company) => company.assigned_by_name || "System")),
    [companies.data]
  );
  const cityProperty = useMemo(
    () => gridProperties.find((property) => property.field_key === "city" || property.name?.toLowerCase() === "city"),
    [gridProperties]
  );
  const cityOptions = useMemo(() => {
    if (!cityProperty) return [];
    return uniqueSorted((companies.data || [])
      .map((company) => getVal(company, cityProperty))
      .flatMap((value) => String(value || "").split(",").map((item) => item.trim()))
      .filter(Boolean));
  }, [companies.data, cityProperty]);

  // Filter & Sort Logic
  const filteredData = useMemo(() => {
    let data = companies.data || [];

    // Column Filters
    Object.entries(columnFilters).forEach(([key, val]) => {
      if (!val) return;
      if (key === "company_name") {
        data = data.filter(c => String(c.company_name || "").toLowerCase().includes(String(val).toLowerCase()));
        return;
      }
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

    const assignedToFilter = columnFilters.assigned_to;
    if (Array.isArray(assignedToFilter) && assignedToFilter.length) {
      data = data.filter((company) => assignedToFilter.includes(getAssignedToName(company)));
    }

    const assignedByFilter = columnFilters.assigned_by_name;
    if (Array.isArray(assignedByFilter) && assignedByFilter.length) {
      data = data.filter((company) => assignedByFilter.includes(company.assigned_by_name || "System"));
    }

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
  }, [companies.data, columnFilters, sort, properties.data, users.data]);

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const visibleData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedLeadIdSet = new Set(selectedLeadIds.map(Number));

  const toggleLeadSelection = (companyId) => {
    const id = Number(companyId);
    setSelectedLeadIds((current) => (
      current.map(Number).includes(id)
        ? current.filter((selectedId) => Number(selectedId) !== id)
        : [...current, id]
    ));
  };

  return (
    <div className="stack assign-leads-page">
      <div className="toolbar split-toolbar">
        <div className="assign-filter-tools" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="crm-search small lead-search">
            <Search size={16} />
            <input
              placeholder="Search leads..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span className="user-debug-info" style={{ fontSize: '11px', color: '#94a3b8' }}>
            Logged in as: <strong>{user?.name} (ID: {user?.id})</strong>
          </span>
          {cityProperty && (
            <div className="city-quick-filter">
              <GridFilterDropdown
                label="City"
                options={cityOptions}
                value={columnFilters[cityProperty.field_key] || []}
                onChange={(val) => {
                  setColumnFilters((prev) => ({ ...prev, [cityProperty.field_key]: val }));
                  setCurrentPage(1);
                }}
                isMulti={true}
              />
            </div>
          )}
        </div>

        <div className="toolbar-menu-wrap">
          {columnWidthEdit ? (
            <div className="row-actions">
              <button type="button" className="secondary icon-button" onClick={() => setColumnWidthEdit(false)}><X size={18} /> Cancel</button>
              <button type="button" className="icon-button" onClick={saveColumnWidths}><Save size={18} /> Save Widths</button>
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
            {bulkMode && (
              <div className="bulk-action-bar">
                <button type="button" className="bulk-link" onClick={() => setSelectedLeadIds(filteredData.map((company) => Number(company.id)))}>Select all</button>
                <button type="button" className="bulk-link" onClick={() => setSelectedLeadIds([])}>Unselect all</button>
                <strong>{selectedLeadIds.length}</strong>
                <span>Items Selected</span>
                <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} aria-label="Bulk action">
                  <option value="">Actions</option>
                  <option value="assign:">Unassign leads</option>
                  {users.data?.map((user) => (
                    <option key={user.id} value={`assign:${user.id}`}>{user.name}</option>
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
                        <button type="button" className="sort-header" onClick={() => setSort({ key: p.field_key, direction: sort.key === p.field_key && sort.direction === "asc" ? "desc" : "asc" })}>
                          {p.name} <span>{sort.key === p.field_key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        {columnWidthEdit && (
                          <input type="number" value={getColumnWidth(p)} onChange={(e) => setColumnWidth(p.field_key, e.target.value)} className="width-input" />
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr className="filter-row">
                    {bulkMode && <th className="bulk-select-col" />}
                    {gridProperties.map((p) => {
                      const dataValues = companies.data.map(c => getVal(c, p))
                        .flatMap(v => String(v).split(",").map(s => s.trim()))
                        .filter(Boolean);
                      const optionMap = new Map(propertyOptions(p).map((option) => [String(option.value), option.label]));
                      const rawOptions = dataValues.filter((item) => !optionMap.has(String(item)));
                      const uniqueValues = [
                        ...propertyOptions(p),
                        ...uniqueSorted(rawOptions).map((item) => ({ value: item, label: formatPropertyValue(p, item) || item }))
                      ];

                      return (
                        <th key={`${p.field_key}-f`} style={{ width: `${getColumnWidth(p)}px`, minWidth: `${getColumnWidth(p)}px`, maxWidth: `${getColumnWidth(p)}px`, padding: "4px 8px" }}>
                          {p.field_key === "assigned_to" ? (
                            <GridFilterDropdown
                              label="Assigned To"
                              options={assignedToOptions}
                              value={columnFilters.assigned_to || []}
                              onChange={(val) => {
                                setColumnFilters(prev => ({ ...prev, assigned_to: val }));
                                setCurrentPage(1);
                              }}
                              isMulti={true}
                            />
                          ) : p.field_key === "assigned_by_name" ? (
                            <GridFilterDropdown
                              label="Assigned By"
                              options={assignedByOptions}
                              value={columnFilters.assigned_by_name || []}
                              onChange={(val) => {
                                setColumnFilters(prev => ({ ...prev, assigned_by_name: val }));
                                setCurrentPage(1);
                              }}
                              isMulti={true}
                            />
                          ) : p.filter_type === "dropdown" || p.filter_type === "multiselect" ? (
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
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((c) => {
                    const statusVal = c.property_values?.find(pv => pv.field_key === "status")?.value || "";
                    const isInquiry = c.is_inquiry;
                    let rowClassName = "";
                    if (isInquiry) {
                      const isOrderPlaced = statusVal === "converted_to_order" || statusVal === "completed";
                      if (isOrderPlaced) {
                        rowClassName = "order-placed-row";
                      }
                    }
                    return (
                      <tr key={c.id} className={rowClassName}>
                      {bulkMode && (
                        <td className="bulk-select-col">
                          <input
                            type="checkbox"
                            checked={selectedLeadIdSet.has(Number(c.id))}
                            onChange={() => toggleLeadSelection(c.id)}
                            aria-label={`Select ${c.company_name}`}
                          />
                        </td>
                      )}
                      {gridProperties.map((p) => (
                        <td key={p.field_key} style={{ width: `${getColumnWidth(p)}px`, minWidth: `${getColumnWidth(p)}px`, maxWidth: `${getColumnWidth(p)}px` }}>
                          {p.field_key === "assigned_to" ? (
                            <div className="assign-cell">
                              <select
                                className="compact-select"
                                value={c.assigned_to || ""}
                                onChange={(e) => handleAssign(c.id, e.target.value)}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
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
                              {c.history_keys?.includes("assigned_to") && (
                                <button type="button" className="cell-icon-button" onClick={() => openHistory(c.id, "assigned_to")} title="View Assignment History">
                                  <History size={14} />
                                </button>
                              )}
                            </div>
                          ) : p.field_key === "assigned_by_name" ? (
                            <span className="cell-text" style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                              {c.assigned_by_name || "-"}
                            </span>
                          ) : p.field_key === "connected_source" ? (
                            <div className="assign-cell">
                              <span className="cell-text" title={getVal(c, p)} style={{ flex: 1, fontWeight: "600", fontSize: "12px" }}>
                                {getVal(c, p) || "-"}
                              </span>
                              <ConnectedSourceActions
                                companyId={c.id}
                                connectedSourceProperty={p}
                                connectedSourceValue={getVal(c, p)}
                                contactNumber={getVal(c, { field_key: "contact_number" })}
                                emailId={getVal(c, { field_key: "email_id" })}
                                onUpdated={companies.reload}
                              />
                              {c.history_keys?.includes(p.field_key) && (
                                <button type="button" className="cell-icon-button" onClick={() => openHistory(c.id, p.field_key)} title={`View ${p.name} History`}>
                                  <History size={14} />
                                </button>
                              )}
                            </div>
                          ) : READ_ONLY_HISTORY_FIELDS.has(p.field_key) ? (
                            <div className="assign-cell">
                              <span className="cell-text" title={p.field_key === "connected_source" ? getVal(c, p) : formatPropertyValue(p, getVal(c, p))} style={{ flex: 1, fontWeight: "600", fontSize: "12px" }}>
                                {p.field_key === "connected_source" ? (getVal(c, p) || "-") : (formatPropertyValue(p, getVal(c, p)) || "-")}
                              </span>
                              {c.history_keys?.includes(p.field_key) && (
                                <button type="button" className="cell-icon-button" onClick={() => openHistory(c.id, p.field_key)} title={`View ${p.name} History`}>
                                  <History size={14} />
                                </button>
                              )}
                            </div>
                          ) : p.object_type === "multiselect" ? (
                            <div className="inline-multi-select">
                              <GridFilterDropdown
                                label={formatPropertyValue(p, getVal(c, p)) || "-"}
                                options={propertyOptions(p)}
                                value={splitMultiValue(getVal(c, p))}
                                onChange={(val) => handleInlineEdit(c.id, p, val.join(","))}
                                isMulti={true}
                              />
                            </div>
                          ) : p.object_type === "dropdown" ? (
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
                      {false && (<>
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
                        </>)}
                     </tr>
                    );
                  })}
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

            <div className="column-chooser-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "min(480px, calc(100vh - 170px))", minHeight: 0 }}>
              <div className="column-pool-side stack" style={{ padding: "16px 20px", borderRight: "1px solid #e2e8f0", backgroundColor: "#fff", gap: "12px", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
                <div className="crm-search small">
                  <input placeholder="Search columns..." value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} />
                </div>
                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "4px" }}>Company Properties</p>
                  {ASSIGN_LEADS_STATIC_COLUMNS
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.field_key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={isSelected} onChange={() => isSelected ? setDraftColumns(prev => prev.filter(k => k !== p.field_key)) : setDraftColumns(prev => [...prev, p.field_key])} />
                          <span style={{ fontSize: "12px" }}>{p.name}</span>
                        </label>
                      );
                    })}
                  {[
                    ...properties.data.filter(p =>
                      !ASSIGN_LEADS_STATIC_COLUMNS.some(column => column.field_key === p.field_key) && p.entity_type !== 'lead'
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
                      !ASSIGN_LEADS_STATIC_COLUMNS.some(column => column.field_key === p.field_key) && p.entity_type === 'lead'
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

              <div className="column-order-side stack" style={{ padding: "16px 20px", backgroundColor: "#fff", gap: "12px", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
                <p style={{ fontSize: "11px", fontWeight: "700" }}>SELECTED ({draftColumns.length})</p>
                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto" }}>
                  {draftColumns.map((key, idx) => {
                    const prop = [...ASSIGN_LEADS_STATIC_COLUMNS, ...properties.data].find(p => p.field_key === key);
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
        .assign-leads-page .table-wrap { overflow: auto; width: 100%; border: 1px solid #e3e8f0; border-radius: 8px; }
        .assign-filter-tools {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .assign-filter-tools .lead-search {
          width: 240px;
          max-width: 240px;
        }
        .city-quick-filter {
          width: 180px;
        }
        .city-quick-filter .premium-filter-trigger {
          height: 34px;
          padding: 0 12px;
          border-color: #cbd5e1;
          border-radius: 7px;
          color: #334155;
          font-size: 12px;
          background: #fff;
        }
        .assign-leads-page .menu-trigger.active {
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
          width: 170px;
          height: 34px;
          padding: 0 36px 0 12px;
          border: 1px solid #9fcfc5;
          border-radius: 7px;
          background: #fff;
          color: #0f172a;
          font-weight: 600;
          font-size: 12px;
        }
        .bulk-submit {
          height: 34px;
          min-width: 96px;
          border: 0;
          border-radius: 999px;
          background: #176b5b;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .bulk-submit:hover {
          background: #115e52;
        }
        .bulk-select-col {
          width: 52px !important;
          min-width: 52px !important;
          max-width: 52px !important;
          text-align: center;
          padding: 0 !important;
        }
        .bulk-select-col input {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #176b5b;
        }
        .assign-leads-page .inline-multi-select .premium-filter-trigger {
          height: 30px;
          min-width: 110px;
          padding: 0 8px;
          border-color: #d9e2ee;
          border-radius: 6px;
          color: #334155;
          font-size: 12px;
          background: #fff;
        }
        .assign-leads-page .inline-multi-select .premium-filter-trigger.active {
          color: #176b5b;
          background: #f0fdf4;
          border-color: #b7e4d7;
        }
        .company-table { border-collapse: collapse; border-spacing: 0; width: max-content; min-width: 100%; table-layout: fixed; background: #fff; }
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
          overflow: hidden;
        }
        .company-table tbody td {
          overflow: hidden;
          box-sizing: border-box;
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
        .assign-cell {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          width: 100%;
          flex-wrap: nowrap;
        }
        .assign-cell .cell-text {
          min-width: 0;
          max-width: 100%;
        }
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
        .compact-select {
          height: 32px;
          min-width: 0;
          width: 100%;
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
