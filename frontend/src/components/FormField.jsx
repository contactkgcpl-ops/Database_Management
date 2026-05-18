import React from "react";
import { MultiSelect } from "./MultiSelect";

export function FormField({ label, type = "text", value, onChange, options = [], required = false, placeholder = "", rows = 3 }) {
  const inputId = `${label}-${type}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const update = (event) => onChange(type === "checkbox" ? event.target.checked : event.target.value);

  if (type === "multiselect") {
    return <MultiSelect label={label} options={options} value={value || []} onChange={onChange} placeholder={placeholder || "Select"} />;
  }

  return (
    <label className={type === "checkbox" ? "check form-check" : "field"}>
      {type !== "checkbox" && <span>{label}</span>}
      {type === "select" ? (
        <select id={inputId} value={value ?? ""} required={required} onChange={update}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea id={inputId} value={value ?? ""} required={required} placeholder={placeholder} rows={rows} onChange={update} />
      ) : type === "checkbox" ? (
        <>
          <input id={inputId} type="checkbox" checked={!!value} onChange={update} />
          {label}
        </>
      ) : (
        <input id={inputId} type={type} value={value ?? ""} required={required} placeholder={placeholder} onChange={update} />
      )}
    </label>
  );
}
