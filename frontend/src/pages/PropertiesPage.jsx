import React, { useState, useMemo } from "react";
import { MoreVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { useNotify } from "../components/NotificationProvider";
import { RecordGrid } from "../components/RecordGrid";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";

const emptyForm = {
  name: "",
  field_key: "",
  object_type: "text",
  is_multi_value: false,
  description: "",
  is_required: false,
  is_unique: false,
  is_active: true,
  show_on_grid: false,
  grid_order: 0,
  sort_order: 0,
  grid_ids: [],
  options: [],
  filter_type: "text",
  entity_type: "company",
};

const objectTypes = [
  ["text", "One Line Text"],
  ["textarea", "Multi Line Text"],
  ["number", "Number"],
  ["date", "Date"],
  ["email", "Email"],
  ["mobile", "Mobile"],
  ["dropdown", "Single Value Select Dropdown"],
  ["multiselect", "Multi Value Select Dropdown"],
].map(([value, label]) => ({ value, label }));

function toFieldKey(name) {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) return "";
  return /^[0-9]/.test(key) ? `p_${key}` : key;
}

function toOptionValue(label) {
  return toFieldKey(label);
}

export function PropertiesPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const canManage = user.permissions.includes("properties.manage");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);
  const properties = useLoad(() => api.properties(q), [q]);
  const propertyGrids = useLoad(() => api.propertyGrids(), []);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setName = (name) => setForm((current) => ({ ...current, name, field_key: editingId ? current.field_key : toFieldKey(name) }));
  const setObjectType = (objectType) => setForm((current) => ({ ...current, object_type: objectType, options: ["dropdown", "multiselect"].includes(objectType) ? current.options : [] }));
  const setGridIds = (gridIds) => setForm((current) => ({ ...current, grid_ids: gridIds.map(Number) }));
  const hasOptions = ["dropdown", "multiselect"].includes(form.object_type);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    
    if (!editingId) {
      const confirmed = window.confirm(
        `Are you sure you want to add the property "${form.name}"?\n\n` +
        `This will permanently add a new column to the database. ` +
        `Once added, you cannot delete this property or change it to a multi-select property.`
      );
      if (!confirmed) return;
    }

    const options = hasOptions
      ? form.options
        .filter((option) => option.label.trim() || option.value.trim())
        .map((option, index) => ({
          ...option,
          label: option.label.trim(),
          value: toOptionValue(option.value || option.label),
          description: "",
          sort_order: index,
        }))
      : [];
    
    const payload = { 
      ...form, 
      options, 
      grid_order: Number(form.grid_order || 0), 
      sort_order: Number(form.sort_order || 0) 
    };

    try {
      if (editingId) {
        await api.updateProperty(editingId, payload);
        notify("Property updated", "success");
      } else {
        await api.createProperty(payload);
        notify("Property created and database column added", "success");
      }
      resetForm();
      properties.reload();
    } catch (err) {
      notify(err.response?.data?.detail || "Failed to save property", "error");
    }
  };

  const edit = (property) => {
    setOpenActionId(null);
    setEditingId(property.id);
    setForm({
      name: property.name,
      field_key: property.field_key,
      object_type: property.object_type,
      is_multi_value: property.is_multi_value || false,
      description: property.description || "",
      is_required: property.is_required,
      is_unique: property.is_unique,
      is_active: property.is_active,
      show_on_grid: property.show_on_grid,
      grid_order: property.grid_order,
      sort_order: property.sort_order,
      grid_ids: property.grid_ids || property.grids?.map((grid) => grid.grid_id) || [],
      options: property.options?.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description || "",
        sort_order: option.sort_order,
        is_active: option.is_active,
      })) || [],
      filter_type: property.filter_type || "text",
    });
    setShowForm(true);
  };

  const columns = [
    { key: "name", label: "Name" },
    { key: "field_key", label: "Key", render: (row) => row.field_key },
    { key: "object_type", label: "Object type", render: (row) => row.object_type },
    { key: "is_multi_value", label: "Multi Value", render: (row) => (row.is_multi_value ? "Yes" : "No") },
    { key: "is_required", label: "Required", render: (row) => (row.is_required ? "Yes" : "No") },
    { key: "is_unique", label: "Unique", render: (row) => (row.is_unique ? "Yes" : "No") },
    { 
      key: "show_on_grid", 
      label: "Show on Grid", 
      render: (row) => {
        const gridNames = row.grids?.map(g => g.grid_name).join(", ");
        return <span style={{ fontSize: "11px", color: "#64748b", display: "block", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={gridNames}>{gridNames || "None"}</span>;
      } 
    },
    { key: "filter_type", label: "Filter Type", render: (row) => {
        const labels = { text: "Text Search", dropdown: "Single Select", multiselect: "Multi-select" };
        return labels[row.filter_type] || "Text Search";
    }},
    { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Active" : "Inactive") },
    { key: "created_by_name", label: "Created by" },
    { key: "entity_type", label: "Group", render: (row) => row.entity_type === "lead" ? "Lead" : "Company" },
  ];

  const addOption = () => setForm((current) => ({
    ...current,
    options: [...current.options, { label: "", value: "", description: "", sort_order: current.options.length, is_active: true }],
  }));

  const updateOption = (index, key, value) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, itemIndex) => {
        if (itemIndex !== index) return option;
        const next = { ...option, [key]: value };
        if (key === "label") next.value = toOptionValue(value);
        return next;
      }),
    }));
  };

  const removeOption = (index) => {
    setForm((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const allRows = useMemo(() => {
    const systemProps = [
      { 
        id: 0, 
        name: "Company Name", 
        field_key: "company_name", 
        object_type: "name", 
        is_multi_value: false, 
        is_required: true, 
        is_unique: true, 
        is_active: true, 
        created_by_name: "System",
        filter_type: "text",
        grids: propertyGrids.data?.map(g => ({ grid_name: g.name })) || []
      }
    ].filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
    return [...systemProps, ...(properties.data || [])];
  }, [properties.data, propertyGrids.data, q]);

  if (showForm) {
    return (
      <div className="crm-page property-editor-page">
        <form className="crm-user-form compact-user-form property-editor-form" onSubmit={save}>
          <div className="modal-head">
            <div>
              <h2>{editingId ? "Edit Property" : "Add Property"}</h2>
              <p className="muted">Properties / {editingId ? "Edit Property" : "Add Property"}</p>
            </div>
          </div>

          <main className="property-editor-grid">
            <div className="property-editor-column">
              <label className="property-name-field">Property Name *<input required value={form.name} onChange={(event) => setName(event.target.value)} /><small>Field Key: {form.field_key || "auto_generated"}</small></label>
              <label className="property-description">Description<textarea rows={4} value={form.description} onChange={(event) => setField("description", event.target.value)} /></label>
              <div className="property-toggle-row">
                <label><input type="checkbox" checked={form.is_active} onChange={(event) => setField("is_active", event.target.checked)} />Active</label>
                <label><input type="checkbox" checked={form.is_unique} onChange={(event) => setField("is_unique", event.target.checked)} />Unique</label>
                <label><input type="checkbox" checked={form.is_required} onChange={(event) => setField("is_required", event.target.checked)} />Required</label>
                <label className={`property-multi-check ${editingId ? "disabled" : ""}`}>
                    <input 
                        type="checkbox" 
                        disabled={!!editingId}
                        checked={form.is_multi_value} 
                        onChange={(event) => setField("is_multi_value", event.target.checked)} 
                    />
                    Is Multi value
                </label>
              </div>
            </div>

            <div className="property-editor-column">
              <label>Object Type<select value={form.object_type} onChange={(event) => setObjectType(event.target.value)}>{objectTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              
              <label>Filter Type (Grid)
                <select value={form.filter_type || "text"} onChange={(e) => setForm({ ...form, filter_type: e.target.value })}>
                    <option value="text">Text Search</option>
                    <option value="dropdown">Dropdown (Single)</option>
                    <option value="multiselect">Dropdown (Multi)</option>
                </select>
              </label>

              <label className={editingId ? "disabled" : ""}>Group (Mapping)
                <select 
                    disabled={!!editingId}
                    value={form.entity_type || "company"} 
                    onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
                >
                    <option value="company">Company</option>
                    <option value="lead">Lead</option>
                </select>
              </label>

              <MultiSelect
                label="Show on Grid"
                options={propertyGrids.data.map((grid) => ({ value: grid.id, label: grid.name }))}
                value={form.grid_ids}
                onChange={setGridIds}
                placeholder="Select grids"
                searchPlaceholder="Search grids"
              />
              {hasOptions && (
                <section className="property-option-section inline-options">
                  <div className="property-option-head">
                    <div>
                      <h3>Options</h3>
                      <p>Option key is generated from option name.</p>
                    </div>
                    <button type="button" className="secondary icon-button" onClick={addOption}><Plus size={15} /> Add Option</button>
                  </div>
                  {form.options.length === 0 ? (
                    <div className="option-empty muted">Add at least one option.</div>
                  ) : (
                    form.options.map((option, index) => (
                      <div className="property-option-row" key={index}>
                        <label className="property-option-name">
                          Option Name *
                          <input required value={option.label} onChange={(event) => updateOption(index, "label", event.target.value)} />
                          <small>Key: {option.value || "auto_generated"}</small>
                        </label>
                        <label className="property-option-active"><input type="checkbox" checked={option.is_active} onChange={(event) => updateOption(index, "is_active", event.target.checked)} />Active</label>
                        <button type="button" className="secondary icon-only" onClick={() => removeOption(index)} aria-label="Remove option"><X size={16} /></button>
                      </div>
                    ))
                  )}
                </section>
              )}
            </div>
          </main>

          <div className="modal-actions">
            <button type="button" className="secondary icon-button" onClick={resetForm}><X size={16} /> Cancel</button>
            <button type="submit" className="icon-button"><Save size={16} /> {editingId ? "Update Property" : "Save Property"}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="stack property-page">
      <div className="toolbar split-toolbar">
        <input className="search" placeholder="Search properties..." value={q} onChange={(event) => setQ(event.target.value)} />
        {canManage && (
          <button type="button" className="icon-button compact-primary" onClick={openAdd}>
            <Plus size={15} />
            Add Property
          </button>
        )}
      </div>

      <RecordGrid
        gridKey="properties"
        rows={allRows}
        columns={columns}
        empty="No properties"
        selectable={false}
        configurableColumns={false}
        actions={canManage ? (property) => {
          if (property.id === 0) return null;
          return (
            <div className="property-row-action">
              <button type="button" className="secondary icon-only menu-trigger" onClick={() => setOpenActionId((current) => current === property.id ? null : property.id)} aria-label={`Open actions for ${property.name}`}>
                <MoreVertical size={17} />
              </button>
              {openActionId === property.id && (
                <div className="action-menu property-action-menu">
                  <button type="button" onClick={() => edit(property)}><Pencil size={15} /> Edit</button>
                  <div className="muted-hint" style={{ fontSize: '10px', padding: '8px', color: '#94a3b8' }}>Deletions restricted</div>
                </div>
              )}
            </div>
          );
        } : null}
      />
    </div>
  );
}
