import React, { useMemo, useState } from "react";
import { Columns3, GripVertical, X } from "lucide-react";
import { Pagination } from "./Pagination";


function normalizeColumns(columns, visibleKeys) {
  const allowedKeys = new Set(columns.map((column) => column.key));
  const ordered = visibleKeys
    .filter((key) => allowedKeys.has(key))
    .map((key) => columns.find((column) => column.key === key));
  return ordered.length ? ordered : columns;
}

export function RecordGrid({ rows = [], columns = [], actions, empty = "No records", gridKey, selectable = true, configurableColumns = true }) {
  const storageKey = `erp:grid-columns:${gridKey || columns.map((column) => column.key).join("|")}`;
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState([]);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return saved.length ? saved : columns.map((column) => column.key);
    } catch {
      return columns.map((column) => column.key);
    }
  });
  const activeColumns = normalizeColumns(columns, visibleColumnKeys);
  const draftColumnSet = new Set(draftColumns);
  const [selected, setSelected] = useState([]);
  const [sort, setSort] = useState({ key: activeColumns[0]?.key || "", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((first, second) => {
      const a = String(first[sort.key] ?? "").toLowerCase();
      const b = String(second[sort.key] ?? "").toLowerCase();
      return sort.direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    });
  }, [rows, sort]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleIds = visibleRows.map((row) => row.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const toggleAll = () => setSelected((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  const toggleRow = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const goToPage = (value) => setPage(Math.min(Math.max(Number(value) || 1, 1), totalPages));
  const openColumnChooser = () => {
    setDraftColumns(activeColumns.map((column) => column.key));
    setColumnChooserOpen(true);
  };
  const toggleDraftColumn = (key) => setDraftColumns((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  const moveDraftColumn = (fromKey, toKey) => {
    if (!fromKey || fromKey === toKey) return;
    setDraftColumns((current) => {
      const next = current.filter((key) => key !== fromKey);
      const toIndex = next.indexOf(toKey);
      next.splice(toIndex < 0 ? next.length : toIndex, 0, fromKey);
      return next;
    });
  };
  const applyColumns = () => {
    const nextColumns = normalizeColumns(columns, draftColumns);
    const nextKeys = nextColumns.map((column) => column.key);
    setVisibleColumnKeys(nextKeys);
    if (!nextKeys.includes(sort.key)) setSort({ key: nextKeys[0] || "", direction: "asc" });
    localStorage.setItem(storageKey, JSON.stringify(nextKeys));
    setColumnChooserOpen(false);
  };

  if (!rows.length) return <div className="panel muted">{empty}</div>;

  return (
    <>
      {configurableColumns && (
        <div className="grid-column-toolbar">
          <button type="button" className="secondary icon-button compact-primary" onClick={openColumnChooser}><Columns3 size={15} />Columns</button>
        </div>
      )}
      {columnChooserOpen && (
        <div className="modal-backdrop">
          <div className="modal column-modal">
            <div className="modal-head">
              <div>
                <h2>Choose columns</h2>
                <p className="muted">Select columns for this grid only.</p>
              </div>
              <button type="button" className="secondary icon-only" onClick={() => setColumnChooserOpen(false)} aria-label="Close columns"><X size={18} /></button>
            </div>
            <div className="column-chooser">
              <div className="column-pool">
                <div className="column-pool-list">
                  {columns.map((column) => (
                    <label className="column-option" key={column.key}>
                      <input type="checkbox" checked={draftColumnSet.has(column.key)} onChange={() => toggleDraftColumn(column.key)} />
                      <span><strong>{column.label}</strong><small>{column.key}</small></span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="selected-columns">
                <div className="section-head compact">
                  <h3>Selected columns ({draftColumns.length})</h3>
                  <button type="button" className="ghost" onClick={() => setDraftColumns([])}>Remove all</button>
                </div>
                <div className="selected-column-list">
                  {draftColumns.map((key) => {
                    const column = columns.find((item) => item.key === key);
                    if (!column) return null;
                    return (
                      <div
                        className="selected-column"
                        draggable
                        key={key}
                        onDragStart={() => setDraggedColumn(key)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => moveDraftColumn(draggedColumn, key)}
                      >
                        <GripVertical size={16} />
                        <span>{column.label}</span>
                        <button type="button" className="ghost" onClick={() => toggleDraftColumn(key)} aria-label={`Remove ${column.label}`}><X size={16} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setColumnChooserOpen(false)}>Cancel</button>
              <button type="button" onClick={applyColumns}>Apply</button>
            </div>
          </div>
        </div>
      )}
      <div className="data-grid">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {selectable && <th className="select-col"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all rows" /></th>}
                {activeColumns.map((column) => (
                  <th key={column.key}>
                    <button type="button" className="sort-header" onClick={() => toggleSort(column.key)}>
                      {column.label}<span>{sort.key === column.key ? (sort.direction === "asc" ? "Asc" : "Desc") : "Sort"}</span>
                    </button>
                  </th>
                ))}
                {actions && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  {selectable && <td className="select-col"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Select row ${row.id}`} /></td>}
                  {activeColumns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "")}</td>
                  ))}
                  {actions && <td>{actions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalRows={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>

    </>
  );
}
