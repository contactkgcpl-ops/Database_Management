import React, { useState, useMemo } from "react";
import { ArrowLeft, FileUp, Save, X, AlertCircle, CheckCircle2, ChevronRight, Upload, Info } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";

// Helper to parse CSV
const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h, i) => ({ id: `col_${i}`, label: h.trim() }));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return headers.reduce((acc, header, i) => {
      acc[header.id] = values[i]?.trim() || "";
      return acc;
    }, {});
  });
  return { headers, rows };
};

const buildCompanyPayload = (row, mapping, activeProperties) => {
    const payload = {
        company_name: "",
        property_values: [],
    };
    Object.entries(mapping).forEach(([headerId, fieldKey]) => {
        if (!fieldKey) return;
        const val = String(row[headerId] || "").trim();
        if (!val) return;

        if (fieldKey === "company_name") {
            payload.company_name = val;
        } else {
            const prop = activeProperties.find(p => p.field_key === fieldKey);
            if (prop) {
                payload.property_values.push({ property_id: prop.id, value: val });
            }
        }
    });
    return payload;
};

export function ImportCompaniesPage({ onBack }) {
  const notify = useNotify();
  const properties = useLoad(() => api.properties(), []);
  const companies = useLoad(() => api.companies(), []);
  const activeProperties = useMemo(() => properties.data.filter(p => p.is_active), [properties.data]);
  
  const [step, setStep] = useState(0); // 0: Upload, 1: Mapping, 2: Preview
  const [csvData, setCsvData] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, headerId }

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const { headers, rows } = parseCSV(event.target.result);
      setCsvData({ headers, rows });
      
      const autoMapping = {};
      headers.forEach(h => {
          const match = activeProperties.find(p => p.name.toLowerCase() === h.label.toLowerCase() || p.field_key === h.label.toLowerCase());
          if (match) autoMapping[h.id] = match.field_key;
          else if (h.label.toLowerCase().includes("company")) autoMapping[h.id] = "company_name";
      });
      setMapping(autoMapping);
      setStep(1);
    };
    reader.readAsText(file);
  };

  const updateCell = (rowIndex, headerId, value) => {
      setCsvData(prev => ({
          ...prev,
          rows: prev.rows.map((row, i) => i === rowIndex ? { ...row, [headerId]: value } : row)
      }));
  };

  const validateRow = (row, rowIndex) => {
      const payload = buildCompanyPayload(row, mapping, activeProperties);
      const issues = [];
      
      if (!payload.company_name?.trim()) {
          issues.push("Company Name is required");
      }

      // Unique checks against DB
      Object.entries(mapping).forEach(([headerId, fieldKey]) => {
          if (!fieldKey) return;
          const val = String(row[headerId] || "").trim();
          if (!val) return;

          const prop = activeProperties.find(p => p.field_key === fieldKey);
          const isUnique = prop?.is_unique || fieldKey === "company_name";

          if (isUnique) {
              const duplicate = companies.data.some(c => {
                  if (fieldKey === "company_name") return c.company_name?.toLowerCase() === val.toLowerCase();
                  // Check dynamic property values (both in relation and potential direct cols)
                  return c.property_values?.some(pv => pv.field_key === fieldKey && pv.value?.toLowerCase() === val.toLowerCase());
              });
              if (duplicate) issues.push(`${prop?.name || "Company Name"} already exists in database`);
          }
      });

      return { payload, issues };
  };

  const handleImport = async () => {
      const rowsToImport = csvData.rows.filter((r, i) => validateRow(r, i).issues.length === 0);
      if (rowsToImport.length === 0) {
          notify("No valid rows to import", "error");
          return;
      }

      setImporting(true);
      try {
          const payloads = rowsToImport.map(row => buildCompanyPayload(row, mapping, activeProperties));
          await api.importCompanies(payloads);
          notify(`${payloads.length} companies imported successfully`, "success");
          onBack();
      } catch (error) {
          console.error(error);
          notify("Import failed", "error");
      } finally {
          setImporting(false);
      }
  };

  return (
    <div className="crm-page">
      <div className="panel stack">
        <div className="import-steps-row">
            <div className="import-steps">
                <div className={`step ${step >= 0 ? "active" : ""}`}>1. Upload</div>
                <ChevronRight size={16} className="muted" />
                <div className={`step ${step >= 1 ? "active" : ""}`}>2. Mapping</div>
                <ChevronRight size={16} className="muted" />
                <div className={`step ${step >= 2 ? "active" : ""}`}>3. Preview & Validation</div>
            </div>
            <button type="button" className="secondary icon-button" onClick={onBack}>
                <ArrowLeft size={16} />
                Back to Companies
            </button>
        </div>

        {step === 0 && (
            <div className="import-upload-zone">
                <Upload size={48} className="muted" />
                <h3>Select CSV File</h3>
                <p className="muted">Make sure your file has a header row with field names.</p>
                <label className="icon-button compact-primary">
                    <FileUp size={16} />
                    Choose File
                    <input type="file" accept=".csv" onChange={handleFileUpload} hidden />
                </label>
            </div>
        )}

        {step === 1 && (
            <div className="stack">
                <div className="crm-section-head compact">
                    <div>
                        <h2>Field Mapping</h2>
                        <p>Match your CSV columns to company properties.</p>
                    </div>
                </div>
                <div className="mapping-list">
                    <div className="mapping-header">
                        <span>CSV Column</span>
                        <span>Company Property</span>
                    </div>
                    {csvData.headers.map(header => (
                        <div key={header.id} className="mapping-row">
                            <div className="csv-label">
                                <strong>{header.label}</strong>
                                <small className="muted">{csvData.rows.slice(0, 3).map(r => r[header.id]).filter(Boolean).join(", ")}</small>
                            </div>
                            <div className="property-select">
                                <select 
                                    value={mapping[header.id] || ""} 
                                    onChange={(e) => setMapping(prev => ({ ...prev, [header.id]: e.target.value }))}
                                >
                                    <option value="">Do not import</option>
                                    <option value="company_name">Company Name *</option>
                                    {activeProperties
                                        .filter(p => p.field_key !== "company_name" && p.field_key.toLowerCase() !== "comapanyname")
                                        .map(p => (
                                            <option key={p.id} value={p.field_key}>{p.name}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="modal-actions">
                    <button className="icon-button" onClick={() => setStep(2)}>
                        Next: Preview Data
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        )}

        {step === 2 && (
            <div className="stack">
                <div className="crm-section-head compact">
                    <div>
                        <h2>Data Preview & Validation</h2>
                        <p>Double-click any cell to edit. Rows with red indicators already exist in our database or have missing data.</p>
                    </div>
                </div>
                <div className="table-wrap">
                    <table className="crm-table import-preview-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                {csvData.headers.map(h => mapping[h.id] && <th key={h.id}>{h.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {csvData.rows.slice(0, 50).map((row, i) => {
                                const { issues } = validateRow(row, i);
                                const isValid = issues.length === 0;
                                
                                return (
                                    <tr key={i} className={!isValid ? "has-issues" : ""}>
                                        <td className="status-cell">
                                            {isValid ? (
                                                <CheckCircle2 size={16} className="success" />
                                            ) : (
                                                <div className="tooltip-wrap">
                                                    <AlertCircle size={16} className="danger" />
                                                    <div className="tooltip">{issues.join(", ")}</div>
                                                </div>
                                            )}
                                        </td>
                                        {csvData.headers.map(h => {
                                            const fieldKey = mapping[h.id];
                                            if (!fieldKey) return null;
                                            
                                            const isEditing = editingCell?.rowIndex === i && editingCell?.headerId === h.id;
                                            const val = row[h.id];
                                            
                                            // Check if this specific cell has a duplicate issue
                                            const prop = activeProperties.find(p => p.field_key === fieldKey);
                                            const isUniqueField = prop?.is_unique || ["email", "mobile", "company_name"].includes(fieldKey);
                                            let isDuplicate = false;
                                            if (isUniqueField && val) {
                                                isDuplicate = companies.data.some(c => {
                                                    if (fieldKey === "company_name") return c.company_name?.toLowerCase() === val.toLowerCase();
                                                    if (fieldKey === "email" || fieldKey === "mobile") return c.contacts?.some(con => con.contact_value?.toLowerCase() === val.toLowerCase());
                                                    return c.property_values?.some(pv => (pv.field_key === fieldKey || pv.property_id === prop.id) && pv.value?.toLowerCase() === val.toLowerCase());
                                                });
                                            }

                                            return (
                                                <td 
                                                    key={h.id} 
                                                    className={`${isDuplicate ? "cell-duplicate" : ""} ${isEditing ? "cell-editing" : ""}`}
                                                    onDoubleClick={() => setEditingCell({ rowIndex: i, headerId: h.id })}
                                                >
                                                    {isEditing ? (
                                                        <input 
                                                            autoFocus
                                                            className="cell-input"
                                                            value={val}
                                                            onChange={(e) => updateCell(i, h.id, e.target.value)}
                                                            onBlur={() => setEditingCell(null)}
                                                            onKeyDown={(e) => e.key === "Enter" && setEditingCell(null)}
                                                        />
                                                    ) : (
                                                        <span className="cell-text">{val || <em className="muted">blank</em>}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {csvData.rows.length > 50 && <p className="muted" style={{ padding: "10px" }}>Showing first 50 rows of {csvData.rows.length} total.</p>}
                </div>
                <div className="modal-actions">
                    <button className="secondary icon-button" onClick={() => setStep(1)}>Back to Mapping</button>
                    <button className="icon-button" onClick={handleImport} disabled={importing}>
                        <Save size={16} />
                        {importing ? "Importing..." : `Import Valid Records`}
                    </button>
                </div>
            </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .import-steps-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 0 24px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 24px;
        }
        .import-steps {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .import-steps .step {
            font-size: 14px;
            font-weight: 600;
            color: #94a3b8;
        }
        .import-steps .step.active {
            color: #2563eb;
        }
        .import-upload-zone {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px;
            border: 2px dashed #e2e8f0;
            border-radius: 12px;
            text-align: center;
            gap: 12px;
        }
        .import-upload-zone h3 { margin-top: 12px; }
        
        .import-preview-table td {
            position: relative;
            cursor: pointer;
        }
        .cell-duplicate {
            background-color: #fef2f2 !important;
            color: #b91c1c !important;
        }
        .cell-editing {
            padding: 0 !important;
        }
        .cell-input {
            width: 100%;
            height: 100%;
            padding: 8px 12px;
            border: 2px solid #2563eb;
            background: #fff;
            outline: none;
        }
        .status-cell {
            text-align: center;
            width: 50px;
        }
        .tooltip-wrap {
            position: relative;
            display: inline-block;
        }
        .tooltip {
            visibility: hidden;
            background-color: #1e293b;
            color: #fff;
            text-align: center;
            padding: 6px 10px;
            border-radius: 6px;
            position: absolute;
            z-index: 100;
            bottom: 125%;
            left: 50%;
            transform: translateX(-50%);
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 11px;
            white-space: nowrap;
        }
        .tooltip-wrap:hover .tooltip {
            visibility: visible;
            opacity: 1;
        }
        .has-issues {
            background-color: #fffaf0;
        }
        .mapping-list {
            display: flex;
            flex-direction: column;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
        }
        .mapping-header {
            display: grid;
            grid-template-columns: 1fr 1fr;
            padding: 12px 16px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            font-weight: 700;
            font-size: 13px;
            color: #64748b;
            text-transform: uppercase;
        }
        .mapping-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            padding: 16px;
            border-bottom: 1px solid #f1f5f9;
            align-items: center;
        }
        .mapping-row:last-child { border-bottom: none; }
        .csv-label {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .csv-label strong { font-size: 15px; color: #1e293b; }
        .csv-label small { font-size: 12px; }
      `}} />
    </div>
  );
}
