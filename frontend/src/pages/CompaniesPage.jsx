import React, { useMemo, useState } from "react";
import { Columns3, FileUp, GripVertical, MoreVertical, Pencil, Plus, Ruler, Save, Search, Trash2, X, SquareCheckBig, History } from "lucide-react";
import { GridFilterDropdown } from "../components/GridFilterDropdown";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { orderedVisibleColumns, readColumnKeys, writeColumnKeys } from "../utils/columnConfig";

const emptyForm = {
  company_name: "",
  property_values: [],
};

const COMPANY_COLUMN_STORAGE_KEY = "crm.grid.columns.companies";
const COMPANY_STATIC_COLUMNS = [
  { id: 0, name: "Company Name", field_key: "company_name", grids: [{ grid_key: "companies", grid_width: 200, grid_order: -100 }] },
  { id: -1, name: "Contact Created By", field_key: "created_by_name", grids: [{ grid_key: "companies", grid_width: 180, grid_order: -90 }] },
];

function getCompanyPropertyValue(company, property) {
  if (property.field_key === "company_name") return company.company_name || "";
  if (property.field_key === "created_by_name") return company.created_by_name || "";
  const pv = company.property_values?.find((v) => v.field_key === property.field_key);
  return pv ? pv.value : "";
}

function propertyOptions(property) {
  return (property?.options || [])
    .filter((option) => option.is_active !== false)
    .map((option) => ({ label: option.label, value: option.value }));
}

function splitMultiValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPropertyValue(property, value) {
  const labelsByValue = new Map(propertyOptions(property).map((option) => [String(option.value), option.label]));
  const parts = splitMultiValue(value);
  if (!parts.length) return "";
  return parts.map((part) => labelsByValue.get(String(part)) || part).join(", ");
}

const getVerificationStatusStyle = (value) => {
  if (value === "verified") return { backgroundColor: "#d1fae5", color: "#065f46", fontWeight: "700", border: "1px solid #a7f3d0" };
  if (value === "pending") return { backgroundColor: "#fef3c7", color: "#92400e", fontWeight: "700", border: "1px solid #fde68a" };
  if (value === "unverified") return { backgroundColor: "#fee2e2", color: "#991b1b", fontWeight: "700", border: "1px solid #fecaca" };
  return {};
};

export function CompaniesPage({ setPage, editingId, setEditingId }) {
  const notify = useNotify();
  const { user } = useAuth();
  const handleInlineEdit = async (companyId, prop, value) => {
    try {
      await api.updateCompanyInline(companyId, { property_id: prop.id, value });
      notify("Updated successfully", "success");
      companies.reload();
    } catch (err) { }
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

  const visibleHistory = historyData.filter((item) => {
    if (!historyFilterKey) return true;
    if (Array.isArray(historyFilterKey)) return historyFilterKey.includes(item.property_key);
    return item.property_key === historyFilterKey;
  });
  const canManage = user.permissions.includes("companies.manage");
  const [q, setQ] = useState("");
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [draftColumns, setDraftColumns] = useState([]);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => readColumnKeys(COMPANY_COLUMN_STORAGE_KEY));
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [companySort, setCompanySort] = useState({ key: "company_name", direction: "asc" });
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(25);
  const [columnWidthEdit, setColumnWidthEdit] = useState(false);
  const [draftColumnWidths, setDraftColumnWidths] = useState({});
  const [columnFilters, setColumnFilters] = useState({});
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);

  const toggleCompanySelection = (id) => {
    const cid = Number(id);
    setSelectedCompanyIds((current) =>
      current.map(Number).includes(cid)
        ? current.filter((x) => Number(x) !== cid)
        : [...current, cid]
    );
  };

  const submitBulkDelete = async () => {
    if (!selectedCompanyIds.length) {
      notify("Select at least one company", "error");
      return;
    }
    if (!window.confirm(`Delete the ${selectedCompanyIds.length} selected companies?`)) return;
    try {
      await api.bulkDeleteCompanies(selectedCompanyIds);
      notify("Companies deleted successfully", "success");
      setSelectedCompanyIds([]);
      companies.reload();
    } catch (err) {
      notify("Failed to delete selected companies", "error");
    }
  };

  const serializedFilters = JSON.stringify(columnFilters);
  const companies = useLoad(() => api.companies({
    page: companyPage,
    page_size: companyPageSize,
    q,
    sort_key: companySort.key,
    sort_dir: companySort.direction,
    filters: serializedFilters
  }), [companyPage, companyPageSize, q, companySort.key, companySort.direction, serializedFilters]);
  const properties = useLoad(() => api.properties(), []);
  const propertyGrids = useLoad(() => api.propertyGrids(), []);

  const companyGridKey = propertyGrids.data[0]?.key || "companies";
  const activeProperties = properties.data.filter((property) => property.is_active);

  const availableGridProperties = useMemo(() => {
    const props = activeProperties
      .filter((property) => property.grids?.some((grid) => grid.grid_key === companyGridKey))
      .filter((property) => !COMPANY_STATIC_COLUMNS.some((column) => column.field_key === property.field_key))
      .sort((a, b) => {
        const gridA = a.grids?.find((g) => g.grid_key === companyGridKey);
        const gridB = b.grids?.find((g) => g.grid_key === companyGridKey);
        return (gridA?.grid_order || 0) - (gridB?.grid_order || 0);
      });

    return [...COMPANY_STATIC_COLUMNS, ...props];
  }, [activeProperties, companyGridKey]);
  const gridProperties = useMemo(
    () => orderedVisibleColumns(availableGridProperties, selectedColumnKeys),
    [availableGridProperties, selectedColumnKeys]
  );

  const companiesList = Array.isArray(companies.data) ? companies.data : (companies.data?.companies || []);
  const companiesTotal = Array.isArray(companies.data) ? companies.data.length : (companies.data?.total || 0);

  const filteredCompanies = companiesList;
  const sortedCompanies = companiesList;
  const companyTotalPages = Math.max(1, Math.ceil(companiesTotal / companyPageSize));
  const currentCompanyPage = Math.min(companyPage, companyTotalPages);
  const visibleCompanies = companiesList;

  const toggleCompanySort = (key) => setCompanySort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const getColumnWidth = (property) => {
    const grid = property.grids?.find(g => g.grid_key === companyGridKey);
    return Math.min(Math.max(draftColumnWidths[property.field_key] || grid?.grid_width || property.grid_width || 160, 80), 640);
  };

  const setColumnWidth = (fieldKey, value) => {
    setDraftColumnWidths((current) => ({ ...current, [fieldKey]: Number(value) }));
  };

  const setColumnFilter = (fieldKey, value) => {
    setColumnFilters((current) => ({ ...current, [fieldKey]: value }));
    setCompanyPage(1);
  };

  const edit = (company) => {
    setEditingId(company.id);
    setPage("add-company");
  };

  const remove = async (company) => {
    if (!window.confirm(`Delete ${company.company_name}?`)) return;
    await api.deleteCompany(company.id);
    notify("Company deleted", "success");
    companies.reload();
  };

  const openColumnChooser = () => {
    setDraftColumns(gridProperties.map((p) => p.field_key));
    setColumnChooserOpen(true);
  };

  const saveColumnChooser = async () => {
    const order = new Map(draftColumns.map((key, index) => [key, (index + 1) * 10]));
    const gridId = propertyGrids.data?.find(g => g.key === companyGridKey)?.id;
    const payload = activeProperties.map((p) => ({
      id: p.id,
      grid_id: gridId,
      show_on_grid: order.has(p.field_key),
      grid_order: order.get(p.field_key) || 0,
      grid_width: getColumnWidth(p),
    }));
    await api.updatePropertyGridColumns(payload);
    setSelectedColumnKeys(draftColumns);
    writeColumnKeys(COMPANY_COLUMN_STORAGE_KEY, draftColumns);
    notify("Grid configuration updated", "success");
    setColumnChooserOpen(false);
    properties.reload();
  };

  const saveColumnWidths = async () => {
    const gridId = propertyGrids.data?.find(g => g.key === companyGridKey)?.id;
    const payload = activeProperties.map((p) => ({
      id: p.id,
      grid_id: gridId,
      show_on_grid: gridProperties.some(gp => gp.id === p.id),
      grid_order: p.grids?.find(g => g.grid_key === companyGridKey)?.grid_order || 0,
      grid_width: getColumnWidth(p),
    }));
    await api.updatePropertyGridColumns(payload);
    notify("Column widths saved", "success");
    setColumnWidthEdit(false);
    properties.reload();
  };

  return (
    <div className="stack">
      <div className="toolbar split-toolbar">
        <input className="search" placeholder="Search companies..." value={q} onChange={(e) => setQ(e.target.value)} />
        {canManage && (
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
                    setSelectedCompanyIds([]);
                    setActionsMenuOpen(false);
                  }}
                  title="Bulk delete actions"
                >
                  <SquareCheckBig size={18} />
                </button>
                <button type="button" className="icon-button compact-primary" onClick={() => setPage("add-company")}><Plus size={16} /> Add Company</button>
                <button type="button" className="secondary icon-button" onClick={() => setPage("import-companies")}><FileUp size={16} /> Import</button>
                <button type="button" className="secondary icon-button" onClick={() => setPage("bulk-edit-companies")}><FileUp size={16} /> Edit Bulk Company</button>
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
        )}
      </div>

      <div className="data-grid">
        {!companiesList.length ? (
          <div className="muted">No companies found</div>
        ) : (
          <>
            {bulkMode && (
              <div className="bulk-action-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
                <button type="button" className="bulk-link" onClick={() => setSelectedCompanyIds(filteredCompanies.map((c) => Number(c.id)))} style={{ background: 'none', border: 'none', color: '#176b5b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Select all</button>
                <button type="button" className="bulk-link" onClick={() => setSelectedCompanyIds([])} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Unselect all</button>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>{selectedCompanyIds.length}</strong>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Items Selected</span>
                <button type="button" className="bulk-submit danger" onClick={submitBulkDelete} style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}>Delete Selected</button>
              </div>
            )}
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    {bulkMode && <th style={{ width: "40px" }} />}
                    {gridProperties.map((p) => (
                      <th key={p.field_key} style={{ width: `${getColumnWidth(p)}px` }}>
                        <button type="button" className="sort-header" onClick={() => toggleCompanySort(p.field_key)}>
                          {p.name} <span>{companySort.key === p.field_key ? (companySort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        {columnWidthEdit && (
                          <input type="number" value={getColumnWidth(p)} onChange={(e) => setColumnWidth(p.field_key, e.target.value)} className="width-input" />
                        )}
                      </th>
                    ))}
                    {canManage && <th style={{ width: "100px" }}>Actions</th>}
                  </tr>
                  <tr className="filter-row">
                    {bulkMode && <th />}
                    {gridProperties.map((p) => {
                      const filterVal = columnFilters[p.field_key] || "";

                      const dataValues = companiesList.map(c => getCompanyPropertyValue(c, p))
                        .flatMap(v => String(v).split(",").map(s => s.trim()))
                        .filter(Boolean);
                      const optionMap = new Map(propertyOptions(p).map((option) => [String(option.value), option.label]));
                      const rawOptions = dataValues.filter((item) => !optionMap.has(String(item)));
                      const uniqueValues = [
                        ...propertyOptions(p),
                        ...Array.from(new Set(rawOptions)).sort().map((item) => ({ value: item, label: formatPropertyValue(p, item) || item }))
                      ];

                      return (
                        <th key={`${p.field_key}-f`}>
                          {p.filter_type === "dropdown" || p.filter_type === "multiselect" ? (
                            <GridFilterDropdown
                              label={p.name}
                              options={uniqueValues}
                              value={columnFilters[p.field_key] || (p.filter_type === "multiselect" ? [] : "")}
                              onChange={(val) => setColumnFilter(p.field_key, val)}
                              isMulti={p.filter_type === "multiselect"}
                            />
                          ) : (
                            <input
                              placeholder={`Filter ${p.name}`}
                              value={columnFilters[p.field_key] || ""}
                              onChange={(e) => setColumnFilter(p.field_key, e.target.value)}
                            />
                          )}
                        </th>
                      );
                    })}
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visibleCompanies.map((c) => {
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
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={selectedCompanyIds.map(Number).includes(Number(c.id))}
                              onChange={() => toggleCompanySelection(c.id)}
                              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#176b5b" }}
                            />
                          </td>
                        )}
                        {gridProperties.map((p) => (
                          <td key={p.field_key}>
                            {p.object_type === "dropdown" ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  className="inline-select"
                                  style={{
                                    flex: 1,
                                    padding: "4px",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    ...getVerificationStatusStyle(getCompanyPropertyValue(c, p))
                                  }}
                                  value={getCompanyPropertyValue(c, p) || ""}
                                  onChange={(e) => handleInlineEdit(c.id, p, e.target.value)}
                                  disabled={!canManage}
                                >
                                  <option value="">-</option>
                                  {p.options?.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                                {c.history_keys?.includes(p.field_key) && (
                                  <button type="button" className="cell-icon-button" onClick={() => openHistory(c.id, p.field_key)} title={`View ${p.name} History`} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
                                    <History size={14} style={{ color: "#64748b" }} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="cell-text" title={getCompanyPropertyValue(c, p)}>
                                {p.field_key === "company_name" ? <strong>{getCompanyPropertyValue(c, p)}</strong> : (p.options?.length ? formatPropertyValue(p, getCompanyPropertyValue(c, p)) : getCompanyPropertyValue(c, p))}
                              </span>
                            )}
                          </td>
                        ))}
                        {canManage && (
                          <td>
                            <div className="row-actions">
                              <button type="button" className="secondary icon-only" onClick={() => edit(c)}><Pencil size={16} /></button>
                              <button type="button" className="danger icon-only" onClick={() => remove(c)}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentCompanyPage}
              totalPages={companyTotalPages}
              pageSize={companyPageSize}
              totalRows={companiesTotal}
              onPageChange={setCompanyPage}
              onPageSizeChange={(size) => { setCompanyPageSize(size); setCompanyPage(1); }}
              pageSizeOptions={[25, 50, 75, 100]}
            />
          </>
        )}
      </div>

      {columnChooserOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal column-modal" style={{ maxWidth: "880px", width: "95%", backgroundColor: "#fff", borderRadius: "4px", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.2)", fontFamily: "'Inter', sans-serif" }}>
            {/* Modal Header */}
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Choose which columns you see</h2>
              <button onClick={() => setColumnChooserOpen(false)} style={{ background: "transparent", color: "#fff", padding: "2px", cursor: "pointer" }}><X size={18} /></button>
            </div>

            <div className="column-chooser-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "min(480px, calc(100vh - 170px))", minHeight: 0 }}>
              {/* Left Side: Property Pool */}
              <div className="column-pool-side stack" style={{ padding: "16px 20px", borderRight: "1px solid #e2e8f0", backgroundColor: "#fff", gap: "12px", gridTemplateRows: "auto minmax(0, 1fr) auto", minHeight: 0 }}>
                <div className="crm-search small" style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    placeholder="Search columns..."
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    style={{
                      padding: "8px 32px 8px 12px",
                      fontSize: "13px",
                      border: "1px solid #dbe3ef",
                      borderRadius: "3px",
                      width: "100%",
                      outline: "none",
                      backgroundColor: "#f9fafb"
                    }}
                  />
                  <Search size={14} style={{ position: "absolute", right: "10px", color: "#94a3b8" }} />
                </div>

                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto", paddingRight: "4px" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "4px" }}>Company Properties</p>
                  {COMPANY_STATIC_COLUMNS
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.field_key} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "5px 0",
                          cursor: "pointer",
                          transition: "color 0.2s",
                        }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) setDraftColumns(prev => prev.filter(k => k !== p.field_key));
                              else setDraftColumns(prev => [...prev, p.field_key]);
                            }}
                            style={{ width: "14px", height: "14px", accentColor: "#176b5b" }}
                          />
                          <span style={{ fontSize: "12px", color: isSelected ? "#176b5b" : "#475569", fontWeight: isSelected ? "600" : "400" }}>{p.name}</span>
                        </label>
                      );
                    })}
                  {[
                    ...activeProperties.filter(p =>
                      p.field_key.toLowerCase() !== "company_name" &&
                      p.field_key.toLowerCase() !== "comapanyname" &&
                      p.entity_type !== 'lead'
                    )
                  ]
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id || p.field_key} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "5px 0",
                          cursor: "pointer",
                          transition: "color 0.2s",
                        }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) setDraftColumns(prev => prev.filter(k => k !== p.field_key));
                              else setDraftColumns(prev => [...prev, p.field_key]);
                            }}
                            style={{ width: "14px", height: "14px", accentColor: "#176b5b" }}
                          />
                          <span style={{ fontSize: "12px", color: isSelected ? "#176b5b" : "#475569", fontWeight: isSelected ? "600" : "400" }}>{p.name}</span>
                        </label>
                      );
                    })}

                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase", marginBottom: "10px", marginTop: "16px" }}>Lead Group</p>
                  {[
                    ...activeProperties.filter(p =>
                      p.field_key.toLowerCase() !== "company_name" &&
                      p.field_key.toLowerCase() !== "comapanyname" &&
                      p.entity_type === 'lead'
                    )
                  ]
                    .filter(p => !columnSearch || p.name.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(p => {
                      const isSelected = draftColumns.includes(p.field_key);
                      return (
                        <label key={p.id || p.field_key} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "5px 0",
                          cursor: "pointer",
                          transition: "color 0.2s",
                        }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) setDraftColumns(prev => prev.filter(k => k !== p.field_key));
                              else setDraftColumns(prev => [...prev, p.field_key]);
                            }}
                            style={{ width: "14px", height: "14px", accentColor: "#176b5b" }}
                          />
                          <span style={{ fontSize: "12px", color: isSelected ? "#176b5b" : "#475569", fontWeight: isSelected ? "600" : "400" }}>{p.name}</span>
                        </label>
                      );
                    })}
                </div>
                <div style={{ fontSize: "11px", color: "#475569" }}>
                  Don't see the property you're looking for? <span style={{ color: "#176b5b", cursor: "pointer", fontWeight: "600" }} onClick={() => setPage("properties")}>Create a property</span>
                </div>
              </div>

              {/* Right Side: Selected Columns Order */}
              <div className="column-order-side stack" style={{ padding: "16px 20px", backgroundColor: "#fff", gap: "12px", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", textTransform: "uppercase" }}>SELECTED COLUMNS ({draftColumns.length})</p>
                </div>

                <div className="scroll-area" style={{ minHeight: 0, overflowY: "auto", paddingRight: "4px" }}>
                  {draftColumns.map((key, idx) => {
                    const prop = [...COMPANY_STATIC_COLUMNS, ...activeProperties].find(p => p.field_key === key);
                    if (!prop) return null;

                    return (
                      <div
                        key={key}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("index", idx); e.currentTarget.style.background = "#e2e8f0"; }}
                        onDragEnd={(e) => { e.currentTarget.style.background = "#f0f4f7"; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = Number(e.dataTransfer.getData("index"));
                          const toIdx = idx;
                          if (fromIdx === toIdx) return;
                          const next = [...draftColumns];
                          const [moved] = next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, moved);
                          setDraftColumns(next);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 12px",
                          backgroundColor: "#f0f4f7",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                          marginBottom: "6px",
                          cursor: "grab",
                          transition: "background 0.2s"
                        }}
                      >
                        <GripVertical size={13} style={{ color: "#94a3b8" }} />
                        <span style={{ flex: 1, fontSize: "12px", color: "#1e293b", fontWeight: "500" }}>{prop.name}</span>
                        <button type="button" style={{ background: "none", color: "#94a3b8", padding: "2px", cursor: "pointer" }} onClick={() => setDraftColumns(prev => prev.filter(k => k !== key))}>
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-actions" style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", backgroundColor: "#fff", display: "flex", gap: "10px", alignItems: "center" }}>
              <button onClick={saveColumnChooser} style={{ backgroundColor: "#176b5b", color: "#fff", fontSize: "12px", fontWeight: "700", padding: "8px 24px", borderRadius: "3px" }}>Apply</button>
              <button className="secondary" onClick={() => setColumnChooserOpen(false)} style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#1e293b", fontSize: "12px", fontWeight: "700", padding: "8px 24px", borderRadius: "3px" }}>Cancel</button>
              <button type="button" style={{ background: "none", color: "#176b5b", fontSize: "12px", fontWeight: "600", marginLeft: "auto", cursor: "pointer" }} onClick={() => setDraftColumns([])}>Remove All Columns</button>
            </div>
          </div>
        </div>
      )}
      {historyModalOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "4px", overflow: "hidden" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "10px 20px", display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "14px", margin: 0 }}>Company/Lead History</h2>
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
    </div>
  );
}
