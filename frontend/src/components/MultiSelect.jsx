import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X, ChevronsUpDown } from "lucide-react";

export function MultiSelect({ label, options = [], value = [], onChange, placeholder = "Select", searchPlaceholder = "Search" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selectedSet = useMemo(() => new Set(value.map(String)), [value]);
  const selectedOptions = options.filter((option) => selectedSet.has(String(option.value)));
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggleOption = (optionValue) => {
    const key = String(optionValue);
    const next = selectedSet.has(key) ? value.filter((item) => String(item) !== key) : [...value, optionValue];
    onChange(next);
  };

  const removeOption = (optionValue) => {
    onChange(value.filter((item) => String(item) !== String(optionValue)));
  };

  return (
    <div className="field multi-select-field" ref={wrapRef}>
      {label ? <span className="field-label">{label}</span> : null}
      <div
        className={`premium-select-control ${open ? "open" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="premium-select-content">
          {selectedOptions.length ? (
            <div className="premium-chips">
              {selectedOptions.map((option) => (
                <span className="premium-chip" key={option.value}>
                  {option.label}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeOption(option.value); }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <span className="premium-placeholder">{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown size={16} className="premium-arrow" />
      </div>

      {open && (
        <div className="premium-dropdown">
          <div className="premium-search-wrap">
            <Search size={14} className="muted" />
            <input 
              autoFocus
              value={query} 
              placeholder={searchPlaceholder} 
              onChange={(e) => setQuery(e.target.value)} 
            />
          </div>
          <div className="premium-list">
            {filteredOptions.map((option) => {
              const isSelected = selectedSet.has(String(option.value));
              return (
                <div key={option.value} className={`premium-item ${isSelected ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); toggleOption(option.value); }}>
                  <span className="premium-item-label">{option.label}</span>
                  <div className={`premium-checkbox ${isSelected ? "checked" : ""}`}>
                    {isSelected && <Check size={14} />}
                  </div>
                </div>
              );
            })}
            {filteredOptions.length === 0 && <div className="premium-empty">No results found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
