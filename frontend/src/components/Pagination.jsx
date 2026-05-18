import React from "react";

export function Pagination({ page, totalPages, pageSize, totalRows, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50] }) {
  const start = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);

  const goToPage = (value) => {
    const next = Math.min(Math.max(Number(value) || 1, 1), totalPages);
    onPageChange(next);
  };

  return (
    <div className="table-footer user-grid-footer crm-pagination">
      <span>Showing {start}-{end} of {totalRows} entries</span>
      <div className="pager">
        <label>
          Items per page
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" disabled={page === 1} onClick={() => onPageChange(1)} title="First page">&lt;&lt;</button>
        <button type="button" className="secondary" disabled={page === 1} onClick={() => onPageChange(page - 1)} title="Previous page">&lt;</button>
        <input
          className="page-input"
          type="number"
          min="1"
          max={totalPages}
          value={page}
          onChange={(e) => goToPage(e.target.value)}
        />
        <span className="pager-total">of {totalPages}</span>
        <button type="button" className="secondary" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} title="Next page">&gt;</button>
        <button type="button" className="secondary" disabled={page === totalPages} onClick={() => onPageChange(totalPages)} title="Last page">&gt;&gt;</button>
      </div>
    </div>
  );
}
