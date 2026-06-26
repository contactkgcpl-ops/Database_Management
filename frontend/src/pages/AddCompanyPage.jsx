import React, { useState, useEffect } from "react";
import { Plus, X, Save, ArrowLeft, Building2, Tag } from "lucide-react";
import { api } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { useNotify } from "../components/NotificationProvider";

const emptyForm = {
  company_name: "",
  property_values: [],
};

function isMultiSelectProperty(property) {
  return property?.object_type === "multiselect";
}

function levenshtein(a, b) {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function getClosestCity(typed, cityList) {
  if (!typed || !cityList.length) return "";
  const target = typed.toLowerCase().trim();
  
  const subMatch = cityList.find(c => c.toLowerCase().startsWith(target) || c.toLowerCase().includes(target));
  if (subMatch) return subMatch;
  
  let best = "";
  let minDistance = 999;
  for (const city of cityList) {
    const dist = levenshtein(target, city.toLowerCase());
    if (dist < minDistance && dist <= 3) {
      minDistance = dist;
      best = city;
    }
  }
  return best;
}

export function AddCompanyPage({ onBack, editingId }) {
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  const [stateCityMapping, setStateCityMapping] = useState({});
  
  const [fieldValues, setFieldValues] = useState({ company_name: "" });

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json")
      .then(res => res.json())
      .then(data => {
        const mapping = {};
        if (data && Array.isArray(data.states)) {
          data.states.forEach(s => {
            const stateName = s.state.trim().toLowerCase();
            mapping[stateName] = s.districts;
          });
          setStateCityMapping(mapping);
        }
      })
      .catch(err => console.error("Failed to load states/districts data dynamically", err));
  }, []);

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
                {isMultiSelectProperty(prop) ? (
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
                  <div className="stack" style={{ gap: "4px", width: "100%" }}>
                    <div className="crm-search small">
                      <Tag size={16} />
                      <input
                        required={prop.is_required}
                        type={prop.object_type === "number" ? "number" : prop.object_type === "date" ? "date" : "text"}
                        value={val}
                        onChange={(e) => handleValueChange(prop.field_key, e.target.value)}
                        placeholder={`Enter ${prop.name}`}
                        list={
                          prop.field_key === "city" && fieldValues["state"] && stateCityMapping[String(fieldValues["state"]).trim().toLowerCase()]
                            ? "city-suggestions"
                            : (prop.field_key === "state" ? "state-suggestions" : undefined)
                        }
                      />
                    </div>
                    {prop.field_key === "state" && Object.keys(stateCityMapping).length > 0 && (() => {
                      const typedState = String(val).trim();
                      if (!typedState) return null;
                      
                      const isValid = stateCityMapping[typedState.toLowerCase()] !== undefined;
                      if (isValid) return null;
                      
                      const availableStates = Object.keys(stateCityMapping).map(s => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
                      const closest = getClosestCity(typedState, availableStates);
                      return (
                        <div style={{ color: "#d97706", fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "8px" }}>
                          <span>⚠️ "{typedState}" is not a recognized Indian State.</span>
                          {closest && (
                            <button
                              type="button"
                              onClick={() => handleValueChange("state", closest)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#176b5b",
                                cursor: "pointer",
                                fontSize: "11.5px",
                                padding: 0,
                                textDecoration: "underline",
                                textAlign: "left",
                                width: "max-content",
                                fontWeight: "600"
                              }}
                            >
                              Did you mean: "{closest}"?
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {prop.field_key === "city" && fieldValues["state"] && (() => {
                      const selectedState = String(fieldValues["state"]).trim();
                      const stateKey = selectedState.toLowerCase();
                      const availableCities = stateCityMapping[stateKey];
                      if (!availableCities || !val) return null;
                      
                      const isValid = availableCities.some(c => c.toLowerCase() === val.trim().toLowerCase());
                      if (isValid) return null;
                      
                      const closest = getClosestCity(val, availableCities);
                      return (
                        <div style={{ color: "#d97706", fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "8px" }}>
                          <span>⚠️ "{val}" is not in the district list of {selectedState}.</span>
                          {closest && (
                            <button
                              type="button"
                              onClick={() => handleValueChange("city", closest)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#176b5b",
                                cursor: "pointer",
                                fontSize: "11.5px",
                                padding: 0,
                                textDecoration: "underline",
                                textAlign: "left",
                                width: "max-content",
                                fontWeight: "600"
                              }}
                            >
                              Did you mean: "{closest}"?
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {prop.field_key === "state" && Object.keys(stateCityMapping).length > 0 && (
                      <datalist id="state-suggestions">
                        {Object.keys(stateCityMapping).map(state => {
                          const displayState = state.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                          return <option key={state} value={displayState} />;
                        })}
                      </datalist>
                    )}
                    {prop.field_key === "city" && fieldValues["state"] && stateCityMapping[String(fieldValues["state"]).trim().toLowerCase()] && (
                      <datalist id="city-suggestions">
                        {stateCityMapping[String(fieldValues["state"]).trim().toLowerCase()].map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    )}
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
