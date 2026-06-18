import React, { useState, useMemo } from "react";
import { ArrowLeft, FileUp, Save, X, AlertCircle, CheckCircle2, ChevronRight, Upload, Info, Trash2 } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";

// Helper to trim and remove extra spaces
const sanitizeValue = (val) => {
    if (val === null || val === undefined) return "";
    return String(val)
        .replace(/\s+/g, " ")
        .trim();
};

const cleanContactNumber = (val) => {
    if (!val) return "";
    // Remove all non-digit characters
    let cleaned = String(val).replace(/\D/g, "");
    // Remove leading country code or zero for Indian numbers
    if (cleaned.length === 11 && cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
};

// Regex helpers for format validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactNumberRegex = /^\+?[0-9\s\-()]{7,18}$/;

const splitCSVLine = (line) => {
    const result = [];
    let insideQuotes = false;
    let currentToken = "";


    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            result.push(currentToken.trim());
            currentToken = "";
        } else {
            currentToken += char;
        }
    }
    result.push(currentToken.trim());
    return result;
};

// Helper to parse CSV
const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = splitCSVLine(lines[0]).map((h, i) => ({ id: `col_${i}`, label: h.trim().replace(/^"|"$/g, '') }));
    const rows = lines.slice(1).map((line, lineIndex) => {
        const values = splitCSVLine(line);
        const row = headers.reduce((acc, header, i) => {
            acc[header.id] = sanitizeValue(values[i]).replace(/^"|"$/g, '');
            return acc;
        }, {});
        row.row_id = `row_${lineIndex}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
        return row;
    }).filter(row => {
        // Exclude row if all mapped CSV columns are empty
        return headers.some(header => row[header.id] !== "");
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
        let val = String(row[headerId] || "").trim();
        if (!val) return;

        if (fieldKey === "company_name") {
            payload.company_name = val;
        } else {
            const prop = activeProperties.find(p => p.field_key === fieldKey);
            if (prop) {
                if (fieldKey === "contact_number") {
                    val = cleanContactNumber(val);
                }
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
    const [importProgress, setImportProgress] = useState(null); // { current, total, success, fail }
    const [rowErrors, setRowErrors] = useState({}); // map of { row_id: error_message }
    const [invalidRowIds, setInvalidRowIds] = useState([]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const { headers, rows } = parseCSV(event.target.result);
            setCsvData({ headers, rows });

            const autoMapping = {};
            headers.forEach(h => {
                const label = h.label.toLowerCase();
                const match = activeProperties.find(p => p.name.toLowerCase() === label || p.field_key === label);
                if (match) {
                    autoMapping[h.id] = match.field_key;
                } else if (label.includes("company")) {
                    autoMapping[h.id] = "company_name";
                } else if (label.includes("mobile") || label.includes("phone") || label.includes("contact")) {
                    const contactProp = activeProperties.find(p => p.field_key === "contact_number");
                    if (contactProp) autoMapping[h.id] = "contact_number";
                } else if (label.includes("email")) {
                    const emailProp = activeProperties.find(p => p.field_key === "email_id");
                    if (emailProp) autoMapping[h.id] = "email_id";
                }
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

        // Check format validations
        Object.entries(mapping).forEach(([headerId, fieldKey]) => {
            if (!fieldKey) return;
            const val = String(row[headerId] || "").trim();
            if (!val) return;

            if (fieldKey === "email_id" || fieldKey.toLowerCase().includes("email")) {
                if (!emailRegex.test(val)) {
                    issues.push(`Invalid Email Format for "${val}" (expected: name@domain.com)`);
                }
            } else if (fieldKey === "contact_number" || fieldKey.toLowerCase().includes("mobile") || fieldKey.toLowerCase().includes("phone")) {
                const cleaned = cleanContactNumber(val);
                if (!cleaned || cleaned.length < 7 || cleaned.length > 15) {
                    issues.push(`Invalid Mobile/Phone Format for "${val}" (Only numbers allowed, 7-15 digits after removing country code/symbols)`);
                }
            }
        });

        // Uniqueness checks (Intra-CSV + DB)
        Object.entries(mapping).forEach(([headerId, fieldKey]) => {
            if (!fieldKey) return;
            const val = String(row[headerId] || "").trim();
            if (!val) return;

            const prop = activeProperties.find(p => p.field_key === fieldKey);
            const isUnique = prop?.is_unique || fieldKey === "company_name" || ["email_id", "contact_number"].includes(fieldKey);

            if (isUnique) {
                // 1. Check duplicates within the CSV itself (prior rows)
                const firstDuplicateIdx = csvData.rows.findIndex((r, idx) => {
                    if (idx >= rowIndex) return false;
                    const otherVal = String(r[headerId] || "").trim();
                    if (fieldKey === "contact_number") {
                        return cleanContactNumber(otherVal) === cleanContactNumber(val);
                    }
                    return otherVal.toLowerCase() === val.toLowerCase();
                });
                if (firstDuplicateIdx !== -1) {
                    issues.push(`Duplicate ${prop?.name || "Company Name"} within CSV (matches Row ${firstDuplicateIdx + 1})`);
                }

                // 2. Check duplicates in the database cache
                const duplicateInDb = companies.data.some(c => {
                    if (fieldKey === "company_name") {
                        return c.company_name?.toLowerCase() === val.toLowerCase();
                    }

                    // Check dynamic property values. Note: Database stores multi-value comma-separated, so we must split
                    return c.property_values?.some(pv => {
                        if (pv.field_key !== fieldKey && pv.property_id !== prop?.id) return false;
                        const vals = (pv.value || "").split(",").map(v => v.trim().toLowerCase());
                        if (fieldKey === "contact_number") {
                            const cleanedCsvVal = cleanContactNumber(val);
                            return vals.some(dbV => cleanContactNumber(dbV) === cleanedCsvVal);
                        }
                        return vals.includes(val.toLowerCase());
                    });
                });
                if (duplicateInDb) {
                    issues.push(`${prop?.name || "Company Name"} already exists in database`);
                }
            }
        });

        // 3. Add any cached backend error for this row
        if (rowErrors[row.row_id]) {
            issues.push(`Server Error: ${rowErrors[row.row_id]}`);
        }

        return { payload, issues };
    };

    const handleImport = async () => {
        const validRows = csvData.rows.filter((r, i) => validateRow(r, i).issues.length === 0);
        if (validRows.length === 0) {
            notify("No valid rows to import", "error");
            return;
        }

        setImporting(true);
        setImportProgress({ current: 0, total: validRows.length, success: 0, fail: 0 });

        const newRowErrors = { ...rowErrors };
        const succeededRowIds = [];

        for (let i = 0; i < validRows.length; i++) {
            const row = validRows[i];
            const payload = buildCompanyPayload(row, mapping, activeProperties);

            try {
                await api.createCompany(payload);
                succeededRowIds.push(row.row_id);
                delete newRowErrors[row.row_id];
                setImportProgress(prev => ({
                    ...prev,
                    current: i + 1,
                    success: prev.success + 1
                }));
            } catch (error) {
                console.error(`Failed to import row ${row.row_id}:`, error);
                newRowErrors[row.row_id] = error.message || "Database validation failed";
                setImportProgress(prev => ({
                    ...prev,
                    current: i + 1,
                    fail: prev.fail + 1
                }));
            }
        }

        // Filter out successfully imported rows from the preview table
        const remainingRows = csvData.rows.filter(r => !succeededRowIds.includes(r.row_id));
        setCsvData(prev => ({
            ...prev,
            rows: remainingRows
        }));
        setRowErrors(newRowErrors);
        setImporting(false);

        if (succeededRowIds.length === validRows.length && remainingRows.length === 0) {
            notify(`All ${succeededRowIds.length} companies imported successfully!`, "success");
            onBack();
        } else {
            const invalidIds = remainingRows.map(r => r.row_id);
            setInvalidRowIds(invalidIds);
            setStep(3);
            notify(`Import finished: ${succeededRowIds.length} succeeded. ${remainingRows.length} invalid/failed rows moved to Step 4 for correction.`, "warning");
        }
    };

    const deleteRow = (rowId) => {
        setCsvData(prev => ({
            ...prev,
            rows: prev.rows.filter(r => r.row_id !== rowId)
        }));
        setInvalidRowIds(prev => prev.filter(id => id !== rowId));
        setRowErrors(prev => {
            const updated = { ...prev };
            delete updated[rowId];
            return updated;
        });
        notify("Row removed from import", "info");
    };

    const handleImportFixed = async () => {
        const rowsToDisplay = csvData.rows.filter(r => invalidRowIds.includes(r.row_id));
        const fixedRows = rowsToDisplay.filter(r => {
            const idx = csvData.rows.findIndex(csvR => csvR.row_id === r.row_id);
            return validateRow(r, idx).issues.length === 0;
        });

        if (fixedRows.length === 0) {
            notify("No corrected valid rows to import yet", "error");
            return;
        }

        setImporting(true);
        setImportProgress({ current: 0, total: fixedRows.length, success: 0, fail: 0 });

        const newRowErrors = { ...rowErrors };
        const succeededRowIds = [];

        for (let i = 0; i < fixedRows.length; i++) {
            const row = fixedRows[i];
            const payload = buildCompanyPayload(row, mapping, activeProperties);

            try {
                await api.createCompany(payload);
                succeededRowIds.push(row.row_id);
                delete newRowErrors[row.row_id];
                setImportProgress(prev => ({
                    ...prev,
                    current: i + 1,
                    success: prev.success + 1
                }));
            } catch (error) {
                console.error(`Failed to import fixed row ${row.row_id}:`, error);
                newRowErrors[row.row_id] = error.message || "Database validation failed";
                setImportProgress(prev => ({
                    ...prev,
                    current: i + 1,
                    fail: prev.fail + 1
                }));
            }
        }

        // Remove succeeded rows from CSV rows and from invalidRowIds
        const remainingRows = csvData.rows.filter(r => !succeededRowIds.includes(r.row_id));
        setCsvData(prev => ({
            ...prev,
            rows: remainingRows
        }));
        setInvalidRowIds(prev => prev.filter(id => !succeededRowIds.includes(id)));
        setRowErrors(newRowErrors);
        setImporting(false);

        const remainingCount = invalidRowIds.length - succeededRowIds.length;
        if (remainingCount === 0) {
            notify("All corrected records imported successfully!", "success");
            onBack();
        } else {
            notify(`Import finished: ${succeededRowIds.length} succeeded, ${remainingCount} invalid rows remaining.`, "warning");
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
                        <ChevronRight size={16} className="muted" />
                        <div className={`step ${step >= 3 ? "active" : ""}`}>4. Fix Invalid Data</div>
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

                        {importProgress && (
                            <div className="import-progress-banner">
                                <div className="progress-text">
                                    Importing records: <strong>{importProgress.current} / {importProgress.total}</strong>
                                </div>
                                <div className="progress-bar-container">
                                    <div className="progress-bar-fill" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}></div>
                                </div>
                                <div className="progress-stats">
                                    <span className="success-stats-text">{importProgress.success} succeeded</span>
                                    {importProgress.fail > 0 && <span className="danger-stats-text">{importProgress.fail} failed</span>}
                                </div>
                            </div>
                        )}

                        <div className="table-wrap">
                            <table className="crm-table import-preview-table">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        {csvData.headers.map(h => mapping[h.id] && <th key={h.id}>{h.label}</th>)}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvData.rows.slice(0, 50).map((row, i) => {
                                        const { issues } = validateRow(row, i);
                                        const isValid = issues.length === 0;

                                        return (
                                            <tr key={row.row_id || i} className={!isValid ? "has-issues" : ""}>
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

                                                    // Check if this specific cell has a duplicate issue (Intra-CSV + DB)
                                                    const prop = activeProperties.find(p => p.field_key === fieldKey);
                                                    const isUniqueField = prop?.is_unique || fieldKey === "company_name" || ["email_id", "contact_number"].includes(fieldKey);
                                                    let isDuplicate = false;
                                                    if (isUniqueField && val) {
                                                        const csvDupCount = csvData.rows.filter(r => String(r[h.id] || "").trim().toLowerCase() === val.toLowerCase()).length;
                                                        const isCsvDuplicate = csvDupCount > 1;

                                                        const isDbDuplicate = companies.data.some(c => {
                                                            if (fieldKey === "company_name") return c.company_name?.toLowerCase() === val.toLowerCase();
                                                            return c.property_values?.some(pv => {
                                                                if (pv.field_key !== fieldKey && pv.property_id !== prop?.id) return false;
                                                                const vals = (pv.value || "").split(",").map(v => v.trim().toLowerCase());
                                                                return vals.includes(val.toLowerCase());
                                                            });
                                                        });
                                                        isDuplicate = isCsvDuplicate || isDbDuplicate;
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
                                                                    onBlur={(e) => {
                                                                        updateCell(i, h.id, sanitizeValue(e.target.value));
                                                                        setEditingCell(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") {
                                                                            updateCell(i, h.id, sanitizeValue(e.target.value));
                                                                            setEditingCell(null);
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span className="cell-text">{val || <em className="muted">blank</em>}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="action-cell">
                                                    <button
                                                        type="button"
                                                        className="delete-row-btn"
                                                        onClick={() => deleteRow(row.row_id)}
                                                        title="Delete Row"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {csvData.rows.length > 50 && <p className="muted" style={{ padding: "10px" }}>Showing first 50 rows of {csvData.rows.length} total.</p>}
                        </div>
                        <div className="modal-actions">
                            <button className="secondary icon-button" onClick={() => setStep(1)}>Back to Mapping</button>
                            <button
                                type="button"
                                className="secondary icon-button"
                                onClick={() => {
                                    const invalidIds = csvData.rows
                                        .filter((r, idx) => validateRow(r, idx).issues.length > 0)
                                        .map(r => r.row_id);
                                    if (invalidIds.length === 0) {
                                        notify("No invalid rows found!", "info");
                                        return;
                                    }
                                    setInvalidRowIds(invalidIds);
                                    setStep(3);
                                }}
                            >
                                Filter Invalid Rows (Step 4)
                            </button>
                            <button className="icon-button" onClick={handleImport} disabled={importing}>
                                <Save size={16} />
                                {importing ? "Importing..." : `Import Valid Records`}
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="stack">
                        <div className="crm-section-head compact">
                            <div>
                                <h2>Step 4: Fix Invalid Data</h2>
                                <p>This view displays only the records with errors. Corrected rows will turn green once errors are solved. Double-click to edit, or delete unwanted rows.</p>
                            </div>
                        </div>

                        {importProgress && (
                            <div className="import-progress-banner">
                                <div className="progress-text">
                                    Importing records: <strong>{importProgress.current} / {importProgress.total}</strong>
                                </div>
                                <div className="progress-bar-container">
                                    <div className="progress-bar-fill" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}></div>
                                </div>
                                <div className="progress-stats">
                                    <span className="success-stats-text">{importProgress.success} succeeded</span>
                                    {importProgress.fail > 0 && <span className="danger-stats-text">{importProgress.fail} failed</span>}
                                </div>
                            </div>
                        )}

                        <div className="table-wrap">
                            <table className="crm-table import-preview-table">
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th style={{ minWidth: "220px" }}>Validation Summary</th>
                                        {csvData.headers.map(h => mapping[h.id] && <th key={h.id}>{h.label}</th>)}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvData.rows.filter(r => invalidRowIds.includes(r.row_id)).map((row) => {
                                        const actualIdx = csvData.rows.findIndex(r => r.row_id === row.row_id);
                                        const { issues } = validateRow(row, actualIdx);
                                        const isValid = issues.length === 0;

                                        return (
                                            <tr key={row.row_id} className={!isValid ? "has-issues" : ""}>
                                                <td className="status-cell">
                                                    {isValid ? (
                                                        <CheckCircle2 size={16} className="success" />
                                                    ) : (
                                                        <AlertCircle size={16} className="danger" />
                                                    )}
                                                </td>
                                                <td className="issues-column">
                                                    {isValid ? (
                                                        <span className="success-stats-text" style={{ fontSize: "12px", fontWeight: "600" }}>Validation cleared! Ready to import.</span>
                                                    ) : (
                                                        <ul className="issues-list">
                                                            {issues.map((issue, idx) => (
                                                                <li key={idx} className="issue-item">
                                                                    <span>• {issue}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                                {csvData.headers.map(h => {
                                                    const fieldKey = mapping[h.id];
                                                    if (!fieldKey) return null;

                                                    const isEditing = editingCell?.rowIndex === actualIdx && editingCell?.headerId === h.id;
                                                    const val = row[h.id];

                                                    // Duplicate check
                                                    const prop = activeProperties.find(p => p.field_key === fieldKey);
                                                    const isUniqueField = prop?.is_unique || fieldKey === "company_name" || ["email_id", "contact_number"].includes(fieldKey);
                                                    let isDuplicate = false;
                                                    if (isUniqueField && val) {
                                                        const csvDupCount = csvData.rows.filter(r => String(r[h.id] || "").trim().toLowerCase() === val.toLowerCase()).length;
                                                        const isCsvDuplicate = csvDupCount > 1;
                                                        const isDbDuplicate = companies.data.some(c => {
                                                            if (fieldKey === "company_name") return c.company_name?.toLowerCase() === val.toLowerCase();
                                                            return c.property_values?.some(pv => {
                                                                if (pv.field_key !== fieldKey && pv.property_id !== prop?.id) return false;
                                                                const vals = (pv.value || "").split(",").map(v => v.trim().toLowerCase());
                                                                return vals.includes(val.toLowerCase());
                                                            });
                                                        });
                                                        isDuplicate = isCsvDuplicate || isDbDuplicate;
                                                    }

                                                    return (
                                                        <td
                                                            key={h.id}
                                                            className={`${isDuplicate ? "cell-duplicate" : ""} ${isEditing ? "cell-editing" : ""}`}
                                                            onDoubleClick={() => setEditingCell({ rowIndex: actualIdx, headerId: h.id })}
                                                        >
                                                            {isEditing ? (
                                                                <input
                                                                    autoFocus
                                                                    className="cell-input"
                                                                    value={val}
                                                                    onChange={(e) => updateCell(actualIdx, h.id, e.target.value)}
                                                                    onBlur={(e) => {
                                                                        updateCell(actualIdx, h.id, sanitizeValue(e.target.value));
                                                                        setEditingCell(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") {
                                                                            updateCell(actualIdx, h.id, sanitizeValue(e.target.value));
                                                                            setEditingCell(null);
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span className="cell-text">{val || <em className="muted">blank</em>}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="action-cell">
                                                    <button
                                                        type="button"
                                                        className="delete-row-btn"
                                                        onClick={() => deleteRow(row.row_id)}
                                                        title="Delete Row"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {invalidRowIds.length === 0 && (
                                <div className="muted" style={{ padding: "30px", textAlign: "center", background: "#fff" }}>
                                    All invalid records have been fixed/deleted!
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="secondary icon-button" onClick={() => setStep(2)}>Back to Preview</button>
                            <button
                                className="icon-button"
                                onClick={handleImportFixed}
                                disabled={importing || csvData.rows.filter(r => invalidRowIds.includes(r.row_id)).filter(r => {
                                    const idx = csvData.rows.findIndex(csvR => csvR.row_id === r.row_id);
                                    return validateRow(r, idx).issues.length === 0;
                                }).length === 0}
                            >
                                <Save size={16} />
                                {importing ? "Importing..." : `Import Fixed Records`}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
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

        .import-progress-banner {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .progress-bar-container {
            width: 100%;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
        }
        .progress-bar-fill {
            height: 100%;
            background: #2563eb;
            transition: width 0.1s ease;
        }
        .progress-stats {
            display: flex;
            gap: 16px;
            font-size: 13px;
            font-weight: 600;
        }
        .success-stats-text {
            color: #16a34a;
        }
        .danger-stats-text {
            color: #dc2626;
        }
        .issues-column {
            padding: 8px 12px !important;
            vertical-align: top;
            max-width: 300px;
            white-space: normal;
        }
        .issues-list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .issue-item {
            font-size: 11px;
            color: #b91c1c;
            line-height: 1.3;
        }
        .action-cell {
            text-align: center;
            width: 70px;
        }
        .delete-row-btn {
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            padding: 6px;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        .delete-row-btn:hover {
            color: #ef4444;
            background-color: #fef2f2;
        }
      `
            }} />
        </div>
    );
}
