import React, { useMemo, useState } from "react";
import { Columns3, GripVertical, X } from "lucide-react";

function columnLabel(column) {
  return column.replaceAll("_", " ");
}

function normalizeColumns(cols, visibleKeys) {
  const allowedKeys = new Set(cols);
  const visible = visibleKeys.filter((key) => allowedKeys.has(key));
  return visible.length ? visible : cols;
}

export function DataTable({ rows, cols, actions, gridKey }) {
  const storageKey = `erp:grid-columns:${gridKey || cols.join("|")}`;
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState([]);
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return normalizeColumns(cols, saved);
    } catch {
      return cols;
    }
  });
  const activeColumns = normalizeColumns(cols, visibleColumns);
  const draftColumnSet = new Set(draftColumns);
  const [selected, setSelected] = useState([]);
  const [sort, setSort] = useState({ key: activeColumns[0] || "", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows || [];
    return [...(rows || [])].sort((first, second) => {
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
    setDraftColumns(activeColumns);
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
    const next = normalizeColumns(cols, draftColumns);
    setVisibleColumns(next);
    if (!next.includes(sort.key)) setSort({ key: next[0] || "", direction: "asc" });
    localStorage.setItem(storageKey, JSON.stringify(next));
    setColumnChooserOpen(false);
  };

  if (!rows?.length) return <div className="panel muted">No records</div>;

  return (
    <>
      <div className="grid-column-toolbar">
        <button type="button" className="secondary icon-button compact-primary" onClick={openColumnChooser}><Columns3 size={15} />Columns</button>
      </div>
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
                  {cols.map((col) => (
                    <label className="column-option" key={col}>
                      <input type="checkbox" checked={draftColumnSet.has(col)} onChange={() => toggleDraftColumn(col)} />
                      <span><strong>{columnLabel(col)}</strong><small>{col}</small></span>
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
                  {draftColumns.map((col) => (
                    <div
                      className="selected-column"
                      draggable
                      key={col}
                      onDragStart={() => setDraggedColumn(col)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => moveDraftColumn(draggedColumn, col)}
                    >
                      <GripVertical size={16} />
                      <span>{columnLabel(col)}</span>
                      <button type="button" className="ghost" onClick={() => toggleDraftColumn(col)} aria-label={`Remove ${columnLabel(col)}`}><X size={16} /></button>
                    </div>
                  ))}
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
                <th className="select-col"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all rows" /></th>
                {activeColumns.map((col) => (
                  <th key={col}>
                    <button type="button" className="sort-header" onClick={() => toggleSort(col)}>
                      {columnLabel(col)}<span>{sort.key === col ? (sort.direction === "asc" ? "Asc" : "Desc") : "Sort"}</span>
                    </button>
                  </th>
                ))}
                {actions && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="select-col"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Select row ${row.id}`} /></td>
                  {activeColumns.map((col) => <td key={col}>{String(row[col] ?? "")}</td>)}
                  {actions && <td>{actions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length} entries</span>
          <div className="pager">
            <label>Items per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option></select></label>
            <button type="button" className="secondary" disabled={currentPage === 1} onClick={() => setPage(1)}>First</button>
            <button type="button" className="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <input className="page-input" type="number" min="1" max={totalPages} value={currentPage} onChange={(event) => goToPage(event.target.value)} />
            <span>of {totalPages}</span>
            <button type="button" className="secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
            <button type="button" className="secondary" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Last</button>
          </div>
        </div>
      </div>
    </>
  );
}
