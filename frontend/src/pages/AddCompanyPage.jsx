import React, { useState, useEffect } from "react";
import { Plus, X, Save, ArrowLeft, Building2, Tag } from "lucide-react";
import { api } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { useNotify } from "../components/NotificationProvider";

const emptyForm = {
  company_name: "",
  property_values: [],
};

export function AddCompanyPage({ onBack, editingId }) {
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  
  const [fieldValues, setFieldValues] = useState({ company_name: "" });

  useEffect(() => {
    async function loadData() {
      try {
        const [propsRes, companyRes] = await Promise.all([
          api.properties(),
          editingId ? api.company(editingId) : null
        ]);

        const activeProps = propsRes.filter((p) => p.is_active);

        // Sort sequence: Single Line -> Multi Line (textarea) -> Multi Select
        const sortedProps = activeProps.sort((a, b) => {
          const getCategory = (p) => {
            if (p.object_type === "textarea") return 2;
            if (p.is_multi_value) return 3;
            return 1;
          };
          const catA = getCategory(a);
          const catB = getCategory(b);
          if (catA !== catB) return catA - catB;
          return (a.sort_order || a.id) - (b.sort_order || b.id);
        });

        setProperties(sortedProps);

        if (companyRes) {
          const initialValues = { company_name: companyRes.company_name };
          companyRes.property_values?.forEach(pv => {
            if (pv.field_key) {
              initialValues[pv.field_key] = pv.value;
            } else {
              // Fallback for legacy data without field_key in response
              const prop = activeProps.find(p => p.id === pv.property_id);
              if (prop) initialValues[prop.field_key] = pv.value;
            }
          });
          setFieldValues(initialValues);
        }
      } catch (error) {
        console.error("Failed to load data", error);
      }
    }
    loadData();
  }, [editingId]);

  const handleValueChange = (key, value, isMulti = false, multiIndex = null) => {
    setFieldValues((prev) => {
      let newValue = value;
      if (isMulti) {
        const currentVal = prev[key] || "";
        const parts = currentVal ? currentVal.split(",") : [""];
        if (multiIndex !== null) parts[multiIndex] = value;
        else parts.push(value);
        newValue = parts.join(",");
      }
      return { ...prev, [key]: newValue };
    });
  };

  const removeMultiValue = (key, index) => {
    setFieldValues((prev) => {
      const currentVal = prev[key] || "";
      const parts = currentVal.split(",").filter((_, i) => i !== index);
      return { ...prev, [key]: parts.join(",") };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fieldValues.company_name?.trim()) {
      notify("Company Name is required", "error");
      return;
    }

    const payload = {
      company_name: fieldValues.company_name.trim(),
      property_values: [],
    };

    properties.forEach(prop => {
      const val = fieldValues[prop.field_key];
      if (val !== undefined && val !== null && String(val).trim()) {
        payload.property_values.push({
          property_id: prop.id,
          value: String(val).trim()
        });
      }
    });

    setLoading(true);
    try {
      if (editingId) {
        await api.updateCompany(editingId, payload);
        notify("Company updated successfully", "success");
      } else {
        await api.createCompany(payload);
        notify("Company added successfully", "success");
      }
      if (onBack) onBack();
    } catch (error) {
        notify(error.response?.data?.detail || "Failed to save company", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="crm-page">

      <form className="panel stack" onSubmit={handleSubmit}>
        <div className="crm-form-grid">
          {/* Always show Company Name first */}
          <label>
            Company Name *
            <div className="crm-search small">
              <Building2 size={16} />
              <input
                required
                value={fieldValues.company_name || ""}
                onChange={(e) => handleValueChange("company_name", e.target.value)}
                placeholder="Enter company name"
              />
            </div>
          </label>

          {/* Render all other properties in a 2-column grid */}
          {properties.filter(p => p.field_key !== "company_name").map((prop) => {
            const isMulti = prop.is_multi_value;
            const val = fieldValues[prop.field_key] || "";
            const parts = isMulti ? (val ? val.split(",") : [""]) : [val];

            return (
              <div key={prop.id}>
                <label className="field-label">{prop.name} {prop.is_required && "*"}</label>
                {prop.object_type === "multiselect" ? (
                  <MultiSelect
                    options={prop.options?.map(o => ({ value: o.value, label: o.label })) || []}
                    value={val ? val.split(",") : []}
                    onChange={(next) => handleValueChange(prop.field_key, next.join(","))}
                    placeholder={`Select ${prop.name}`}
                  />
                ) : isMulti ? (
                  <div className="stack" style={{ gap: "8px" }}>
                    {parts.map((p, idx) => (
                      <div key={idx} className="row-actions">
                        {prop.object_type === "dropdown" ? (
                          <select
                            required={prop.is_required}
                            value={p}
                            onChange={(e) => handleValueChange(prop.field_key, e.target.value, true, idx)}
                            style={{ flex: 1 }}
                          >
                            <option value="">Select {prop.name}</option>
                            {prop.options?.map(opt => (
                              <option key={opt.id} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="crm-search small" style={{ flex: 1 }}>
                            <Tag size={16} />
                            <input
                              required={prop.is_required}
                              type={["mobile", "email"].includes(prop.object_type) ? "text" : prop.object_type === "number" ? "number" : prop.object_type === "date" ? "date" : "text"}
                              value={p}
                              onChange={(e) => {
                                let v = e.target.value;
                                if (prop.object_type === "mobile") v = v.replace(/\D/g, "");
                                handleValueChange(prop.field_key, v, true, idx);
                              }}
                              placeholder={`Enter ${prop.name}`}
                            />
                          </div>
                        )}
                        {parts.length > 1 && (
                          <button type="button" className="danger icon-only" onClick={() => removeMultiValue(prop.field_key, idx)}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="secondary icon-button" onClick={() => handleValueChange(prop.field_key, "", true, null)} style={{ width: "max-content", minHeight: "32px", fontSize: "12px" }}>
                      <Plus size={14} />
                      Add More {prop.name}
                    </button>
                  </div>
                ) : prop.object_type === "textarea" ? (
                  <textarea
                    required={prop.is_required}
                    rows={3}
                    value={val}
                    onChange={(e) => handleValueChange(prop.field_key, e.target.value)}
                    placeholder={prop.description || `Enter ${prop.name}`}
                  />
                ) : prop.object_type === "dropdown" ? (
                  <select
                    required={prop.is_required}
                    value={val}
                    onChange={(e) => handleValueChange(prop.field_key, e.target.value)}
                  >
                    <option value="">Select {prop.name}</option>
                    {prop.options?.map(opt => (
                      <option key={opt.id} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="crm-search small">
                    <Tag size={16} />
                    <input
                      required={prop.is_required}
                      type={prop.object_type === "number" ? "number" : prop.object_type === "date" ? "date" : "text"}
                      value={val}
                      onChange={(e) => handleValueChange(prop.field_key, e.target.value)}
                      placeholder={`Enter ${prop.name}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions" style={{ marginTop: "24px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
          <button type="button" className="secondary icon-button" onClick={onBack}>
            <X size={18} />
            Cancel
          </button>
          <button type="submit" className="icon-button" disabled={loading}>
            <Save size={18} />
            {loading ? "Saving..." : (editingId ? "Update Company" : "Create Company")}
          </button>
        </div>
      </form>

      <style dangerouslySetInnerHTML={{
        __html: `
        .field-label {
          display: block;
          margin-bottom: 6px;
          color: #475569;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        .crm-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .crm-form-grid .wide {
          grid-column: span 2;
        }
        @media (max-width: 768px) {
          .crm-form-grid { grid-template-columns: 1fr; }
          .crm-form-grid .wide { grid-column: span 1; }
        }
      `}} />
    </div>
  );
}
