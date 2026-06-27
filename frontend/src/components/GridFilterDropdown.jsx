import React, { useState, useRef, useEffect } from "react";
import { Search, X, Check, ChevronsUpDown } from "lucide-react";

function initials(label = "") {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 1)
    .toUpperCase();
}

function getAvatarColor(label = "") {
  const colors = [
    { bg: "#e6f4ea", text: "#1e7e34" }, // Green
    { bg: "#e8f0fe", text: "#1967d2" }, // Blue
    { bg: "#fef7e0", text: "#b06000" }, // Orange
    { bg: "#fce8e6", text: "#c5221f" }, // Red
  ];
  const index = label.length % colors.length;
  return colors[index];
}

function parseValueArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    return val.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return val ? [val] : [];
}

export function GridFilterDropdown({ label, options, value, onChange, isMulti, showSaveButton }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const [dropdownStyle, setDropdownStyle] = useState({});
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (isOpen) {
      setLocalValue(value);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = (e) => {
      // Don't close if the scroll was inside the dropdown itself
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleScroll);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  const normalizedOptions = options.map((option) => {
    if (option && typeof option === "object") {
      return {
        value: String(option.value ?? option.label ?? ""),
        label: String(option.label ?? option.value ?? "")
      };
    }
    return { value: String(option), label: String(option) };
  });
  const selectedArray = (showSaveButton
    ? parseValueArray(localValue)
    : parseValueArray(value)
  ).map(String);
  const filteredOptions = normalizedOptions.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (opt) => {
    if (isMulti) {
      const next = selectedArray.includes(opt.value)
        ? selectedArray.filter(v => v !== opt.value)
        : [...selectedArray, opt.value];
      if (showSaveButton) {
        setLocalValue(next);
      } else {
        onChange(next);
      }
    } else {
      if (showSaveButton) {
        setLocalValue(opt.value === String(localValue) ? "" : opt.value);
      } else {
        onChange(opt.value === String(value) ? "" : opt.value);
        setIsOpen(false);
      }
    }
  };

  const clearAll = (e) => {
    e.stopPropagation();
    if (showSaveButton) {
      setLocalValue(isMulti ? [] : "");
    } else {
      onChange(isMulti ? [] : "");
    }
  };

  const isSelected = (opt) => selectedArray.includes(opt.value);

  return (
    <div className="grid-filter-container" ref={containerRef}>
      <button 
        type="button" 
        className={`premium-filter-trigger ${selectedArray.length > 0 ? "active" : ""}`}
        onClick={() => {
          if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownStyle({
              position: 'fixed',
              top: rect.bottom + 4 + 'px',
              left: rect.left + 'px',
              width: '180px',
              zIndex: 999999,
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
            });
          }
          setIsOpen(!isOpen);
        }}
      >
        <span className="label-text">{label}</span>
        {selectedArray.length > 0 && <span className="badge">{selectedArray.length}</span>}
        <ChevronsUpDown size={14} className="arrow" />
      </button>

      {isOpen && (
        <div className="premium-dropdown grid-dropdown" style={dropdownStyle}>
          <div className="premium-search-wrap">
            <Search size={14} className="muted" />
            <input 
              autoFocus
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="dropdown-meta">
            <span className="count">{selectedArray.length} Selected</span>
            {selectedArray.length > 0 && (
              <button type="button" className="clear-link" onClick={clearAll}>Clear All</button>
            )}
          </div>

          <div className="premium-list">
            {isMulti && (
               <div className="premium-item select-all" onClick={() => {
                  if (selectedArray.length === normalizedOptions.length) {
                    if (showSaveButton) setLocalValue([]); else onChange([]);
                  } else {
                    const allVals = normalizedOptions.map((option) => option.value);
                    if (showSaveButton) setLocalValue(allVals); else onChange(allVals);
                  }
               }}>
                 <span className="premium-item-label">Select All</span>
                 <div className={`premium-checkbox ${normalizedOptions.length > 0 && selectedArray.length === normalizedOptions.length ? "checked" : ""}`}>
                   {normalizedOptions.length > 0 && selectedArray.length === normalizedOptions.length && <Check size={13} />}
                 </div>
               </div>
            )}
            
            {filteredOptions.length === 0 && (
              <div className="premium-empty">No matches</div>
            )}

            {filteredOptions.map((opt, i) => {
              return (
                <div key={`${opt.value}-${i}`} className={`premium-item ${isSelected(opt) ? "selected" : ""}`} onClick={() => toggleOption(opt)}>
                  <span className="premium-item-label">{opt.label}</span>
                  <div className={`premium-checkbox ${isSelected(opt) ? "checked" : ""}`}>
                    {isSelected(opt) && <Check size={13} />}
                  </div>
                </div>
              );
            })}
          </div>

          {showSaveButton && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", background: "#f8fafc" }}>
              <button
                type="button"
                style={{
                  backgroundColor: "#176b5b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
                onClick={() => {
                  onChange(localValue);
                  setIsOpen(false);
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .grid-filter-container {
          position: relative;
          width: 100%;
        }
        .premium-filter-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1px solid #ccd7d3;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #40524d;
          cursor: pointer;
          width: 100%;
          transition: all 0.2s;
          text-align: left;
        }
        .premium-filter-trigger:hover { border-color: #176b5b; }
        .premium-filter-trigger.active {
          border-color: #176b5b;
          color: #176b5b;
          background: #f0fdf4;
        }
        .premium-filter-trigger .badge {
          background: #176b5b;
          color: #fff;
          font-size: 10px;
          min-width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-weight: 600;
          padding: 0 3px;
        }
        .premium-filter-trigger .arrow {
          margin-left: auto;
          color: #94a3b8;
        }
        .grid-dropdown {
          width: 180px;
          z-index: 9999;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
        }
        .premium-search-wrap {
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .premium-search-wrap input { font-size: 12px; height: 28px; font-weight: 400; }
        .dropdown-meta {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          font-size: 10px;
          font-weight: 600;
          color: #176b5b;
          background: #f8fafc;
        }
        .clear-link {
          background: none;
          border: none;
          padding: 0;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
        }
        .clear-link:hover { color: #b42318; }
        .premium-list { max-height: 220px; overflow-y: auto; padding: 2px 0; }
        .premium-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px;
          cursor: pointer;
        }
        .premium-item:hover { background: #f8fafc; }
        .premium-item-label { flex: 1; font-size: 12px; color: #334155; font-weight: 400; }
        .premium-checkbox {
          width: 16px;
          height: 16px;
          border: 1.5px solid #e2e8f0;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }
        .premium-checkbox.checked {
          background: #176b5b;
          border-color: #176b5b;
        }
      `}} />
    </div>
  );
}
