import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Save, Calendar, Globe, Mail, Phone, MapPin, Tag, Building } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { GridFilterDropdown } from "../components/GridFilterDropdown";

const emptyVendorForm = {
  company_name: "",
  vendor_name: "",
  products: [],
  email_id: "",
  city: "",
  status: "active",
  website: "",
  quotation_updated_date: "",
  contact_numbers: [""],
};

const VENDOR_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Blocked", value: "blocked" },
];

function ProductSelect({ value = [], onChange, existingOptions = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filteredOptions = existingOptions.filter((opt) =>
    opt.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggleOption = (opt) => {
    const next = value.includes(opt)
      ? value.filter((v) => v !== opt)
      : [...value, opt];
    onChange(next);
  };

  const handleAddNew = () => {
    const val = query.trim();
    if (val && !value.includes(val)) {
      onChange([...value, val]);
      setQuery("");
    }
  };

  const exactMatchExists = existingOptions.some(
    (opt) => opt.toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <div className="premium-multiselect-container" ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div
        className="premium-select-control"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          minHeight: "38px",
          border: "1px solid #cbd5e1",
          borderRadius: "6px",
          padding: "6px 12px",
          cursor: "pointer",
          background: "#fff",
          alignItems: "center",
        }}
        onClick={() => setOpen(!open)}
      >
        {value.length ? (
          value.map((item, idx) => (
            <span
              key={idx}
              style={{
                backgroundColor: "#eff6ff",
                color: "#1e40af",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                border: "1px solid #dbeafe",
                fontWeight: "600",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {item}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v !== item));
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#ef4444",
                  padding: 0,
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            </span>
          ))
        ) : (
          <span className="muted" style={{ color: "#94a3b8", fontSize: "13px" }}>Select or type products...</span>
        )}
      </div>

      {open && (
        <div
          className="premium-dropdown"
          style={{
            position: "absolute",
            top: "105%",
            left: 0,
            width: "100%",
            zIndex: 100,
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            padding: "8px",
          }}
        >
          <input
            autoFocus
            placeholder="Search or add custom product..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddNew();
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "13px",
              border: "1px solid #cbd5e1",
              borderRadius: "4px",
              marginBottom: "8px",
              outline: "none",
            }}
          />

          <div style={{ maxHeight: "200px", overflowY: "auto" }}>
            {filteredOptions.map((opt, i) => {
              const selected = value.includes(opt);
              return (
                <div
                  key={i}
                  onClick={() => toggleOption(opt)}
                  style={{
                    padding: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                    display: "flex",
                    justifyContent: "space-between",
                    backgroundColor: selected ? "#f0fdf4" : "transparent",
                    color: selected ? "#166534" : "#1e293b",
                    borderRadius: "4px",
                    fontWeight: selected ? "600" : "400",
                  }}
                >
                  <span>{opt}</span>
                  {selected && <span>✓</span>}
                </div>
              );
            })}

            {query.trim() && !exactMatchExists && (
              <div
                onClick={handleAddNew}
                style={{
                  padding: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "#176b5b",
                  fontWeight: "bold",
                  borderTop: "1px solid #f1f5f9",
                  marginTop: "4px",
                }}
              >
                + Add "{query.trim()}" as a new product
              </div>
            )}

            {filteredOptions.length === 0 && !query.trim() && (
              <div style={{ padding: "8px", color: "#94a3b8", textAlign: "center", fontSize: "13px" }}>
                No products found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function VendorsPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const canManage = user.permissions.includes("vendors.manage");

  const [q, setQ] = useState("");
  const [vendorsPage, setVendorsPage] = useState(1);
  const [vendorsPageSize, setVendorsPageSize] = useState(10);
  const [columnFilters, setColumnFilters] = useState({
    company_name: "",
    vendor_name: "",
    products: "",
    email_id: "",
    city: "",
    status: "",
    website: "",
    contact_number: "",
  });

  const vendors = useLoad(() => api.vendors(q), [q]);

  const allExistingProducts = useMemo(() => {
    const set = new Set();
    vendors.data?.forEach((v) => {
      v.products?.forEach((p) => {
        if (p?.trim()) set.add(p.trim());
      });
    });
    return Array.from(set).sort();
  }, [vendors.data]);

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [formState, setFormState] = useState(emptyVendorForm);

  const filteredVendors = useMemo(() => {
    return vendors.data.filter((v) => {
      return Object.entries(columnFilters).every(([key, filter]) => {
        if (!filter || (Array.isArray(filter) && filter.length === 0)) return true;
        
        if (key === "contact_number") {
          const search = String(filter).toLowerCase();
          return v.contact_numbers?.some((num) => num.toLowerCase().includes(search));
        }
        
        if (key === "products") {
          const filterParts = Array.isArray(filter) ? filter : String(filter).split(",").map(f => f.trim().toLowerCase()).filter(Boolean);
          if (filterParts.length === 0) return true;
          return v.products?.some(p => filterParts.some(fp => p.toLowerCase().includes(fp)));
        }
        
        const val = String(v[key] || "").toLowerCase();
        const search = String(filter).toLowerCase();
        return val.includes(search);
      });
    });
  }, [vendors.data, columnFilters]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / vendorsPageSize));
  const currentPage = Math.min(vendorsPage, totalPages);
  const visibleVendors = filteredVendors.slice((currentPage - 1) * vendorsPageSize, currentPage * vendorsPageSize);

  const handleFilterChange = (key, value) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setVendorsPage(1);
  };

  const handleOpenAdd = () => {
    setEditingVendorId(null);
    setFormState(emptyVendorForm);
    setFormOpen(true);
  };

  const handleOpenEdit = (v) => {
    setEditingVendorId(v.id);
    setFormState({
      company_name: v.company_name,
      vendor_name: v.vendor_name,
      products: v.products?.length ? [...v.products] : [],
      email_id: v.email_id || "",
      city: v.city || "",
      status: v.status || "active",
      website: v.website || "",
      quotation_updated_date: v.quotation_updated_date || "",
      contact_numbers: v.contact_numbers?.length ? [...v.contact_numbers] : [""],
    });
    setFormOpen(true);
  };

  const handleContactChange = (idx, value) => {
    setFormState((prev) => {
      const nextContacts = [...prev.contact_numbers];
      nextContacts[idx] = value;
      return { ...prev, contact_numbers: nextContacts };
    });
  };

  const addContactValue = () => {
    setFormState((prev) => ({
      ...prev,
      contact_numbers: [...prev.contact_numbers, ""],
    }));
  };

  const removeContactValue = (idx) => {
    setFormState((prev) => ({
      ...prev,
      contact_numbers: prev.contact_numbers.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.company_name.trim() || !formState.vendor_name.trim()) {
      notify("Company Name and Vendor Name are required", "error");
      return;
    }

    const payload = {
      ...formState,
      products: formState.products.map(p => p.trim()).filter(Boolean),
      contact_numbers: formState.contact_numbers.map(c => c.trim()).filter(Boolean),
      quotation_updated_date: formState.quotation_updated_date || null,
    };

    try {
      if (editingVendorId) {
        await api.updateVendor(editingVendorId, payload);
        notify("Vendor updated successfully", "success");
      } else {
        await api.createVendor(payload);
        notify("Vendor added successfully", "success");
      }
      setFormOpen(false);
      vendors.reload();
    } catch (err) {
      notify(err.message || "Failed to save vendor details", "error");
    }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Are you sure you want to delete vendor "${v.vendor_name}"?`)) return;
    try {
      await api.deleteVendor(v.id);
      notify("Vendor deleted successfully", "success");
      vendors.reload();
    } catch (err) {
      notify(err.message || "Failed to delete vendor", "error");
    }
  };

  return (
    <div className="stack">
      <div className="toolbar split-toolbar">
        <input
          className="search"
          placeholder="Search vendors..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canManage && (
          <div className="row-actions">
            <button type="button" className="icon-button compact-primary" onClick={handleOpenAdd}>
              <Plus size={16} /> Add Vendor
            </button>
          </div>
        )}
      </div>

      <div className="data-grid">
        {!vendors.data.length ? (
          <div className="muted">No vendors found</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    <th style={{ width: "160px" }}>Company Name</th>
                    <th style={{ width: "160px" }}>Vendor Name</th>
                    <th style={{ width: "180px" }}>Products</th>
                    <th style={{ width: "180px" }}>Contact Numbers</th>
                    <th style={{ width: "180px" }}>Email ID</th>
                    <th style={{ width: "120px" }}>City</th>
                    <th style={{ width: "100px" }}>Status</th>
                    <th style={{ width: "160px" }}>Website</th>
                    <th style={{ width: "150px" }}>Quotation Updated</th>
                    <th style={{ width: "130px" }}>Added By</th>
                    {canManage && <th style={{ width: "100px" }}>Actions</th>}
                  </tr>
                  <tr className="filter-row">
                    <th>
                      <input
                        placeholder="Filter Company"
                        value={columnFilters.company_name}
                        onChange={(e) => handleFilterChange("company_name", e.target.value)}
                      />
                    </th>
                    <th>
                      <input
                        placeholder="Filter Vendor"
                        value={columnFilters.vendor_name}
                        onChange={(e) => handleFilterChange("vendor_name", e.target.value)}
                      />
                    </th>
                    <th>
                      <GridFilterDropdown
                        label="Products"
                        options={allExistingProducts}
                        value={columnFilters.products ? (Array.isArray(columnFilters.products) ? columnFilters.products : columnFilters.products.split(",")) : []}
                        onChange={(val) => handleFilterChange("products", val)}
                        isMulti={true}
                      />
                    </th>
                    <th>
                      <input
                        placeholder="Filter Contacts"
                        value={columnFilters.contact_number}
                        onChange={(e) => handleFilterChange("contact_number", e.target.value)}
                      />
                    </th>
                    <th>
                      <input
                        placeholder="Filter Email"
                        value={columnFilters.email_id}
                        onChange={(e) => handleFilterChange("email_id", e.target.value)}
                      />
                    </th>
                    <th>
                      <input
                        placeholder="Filter City"
                        value={columnFilters.city}
                        onChange={(e) => handleFilterChange("city", e.target.value)}
                      />
                    </th>
                    <th>
                      <select
                        value={columnFilters.status}
                        onChange={(e) => handleFilterChange("status", e.target.value)}
                        style={{ width: "100%", padding: "4px", fontSize: "12px" }}
                      >
                        <option value="">All</option>
                        {VENDOR_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th>
                      <input
                        placeholder="Filter Website"
                        value={columnFilters.website}
                        onChange={(e) => handleFilterChange("website", e.target.value)}
                      />
                    </th>
                    <th></th>
                    <th></th>
                    {canManage && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleVendors.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.company_name}</strong>
                      </td>
                      <td>{v.vendor_name}</td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {v.products?.length ? (
                            v.products.map((p, idx) => (
                              <span
                                key={idx}
                                style={{
                                  backgroundColor: "#eff6ff",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  border: "1px solid #dbeafe",
                                  color: "#1e40af"
                                }}
                              >
                                {p}
                              </span>
                            ))
                          ) : (
                            <em className="muted">none</em>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {v.contact_numbers?.length ? (
                            v.contact_numbers.map((num, idx) => (
                              <span
                                key={idx}
                                style={{
                                  backgroundColor: "#f1f5f9",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                {num}
                              </span>
                            ))
                          ) : (
                            <em className="muted">none</em>
                          )}
                        </div>
                      </td>
                      <td>{v.email_id || <em className="muted">-</em>}</td>
                      <td>{v.city || <em className="muted">-</em>}</td>
                      <td>
                        <span
                          className={`badge-${v.status}`}
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            textTransform: "capitalize",
                            backgroundColor: v.status === "active" ? "#dcfce7" : v.status === "blocked" ? "#fee2e2" : "#f1f5f9",
                            color: v.status === "active" ? "#15803d" : v.status === "blocked" ? "#b91c1c" : "#475569",
                          }}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td>
                        {v.website ? (
                          <a
                            href={v.website.startsWith("http") ? v.website : `https://${v.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#176b5b", textDecoration: "underline" }}
                          >
                            {v.website}
                          </a>
                        ) : (
                          <em className="muted">-</em>
                        )}
                      </td>
                      <td>{v.quotation_updated_date || <em className="muted">-</em>}</td>
                      <td>
                        <small className="muted">{v.creator_name || "Unknown"}</small>
                      </td>
                      {canManage && (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="secondary icon-only"
                              onClick={() => handleOpenEdit(v)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="danger icon-only"
                              onClick={() => handleDelete(v)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              pageSize={vendorsPageSize}
              totalRows={filteredVendors.length}
              onPageChange={setVendorsPage}
              onPageSizeChange={(size) => {
                setVendorsPageSize(size);
                setVendorsPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </>
        )}
      </div>

      {formOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "600px",
              width: "95%",
              backgroundColor: "#fff",
              borderRadius: "8px",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <div
              className="modal-head"
              style={{
                backgroundColor: "#176b5b",
                color: "#fff",
                padding: "14px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
                {editingVendorId ? "Edit Vendor Details" : "Add Vendor Details"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: "20px" }} className="stack">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div className="form-group">
                  <label>
                    Company Name <span className="danger">*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <Building size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                    <input
                      required
                      value={formState.company_name}
                      onChange={(e) => setFormState((prev) => ({ ...prev, company_name: e.target.value }))}
                      style={{ paddingLeft: "32px", width: "100%" }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Vendor Name <span className="danger">*</span>
                  </label>
                  <input
                    required
                    value={formState.vendor_name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, vendor_name: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Products</label>
                  <ProductSelect
                    value={formState.products}
                    onChange={(next) => setFormState((prev) => ({ ...prev, products: next }))}
                    existingOptions={allExistingProducts}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Contact Numbers</label>
                  <div className="stack" style={{ gap: "8px" }}>
                    {formState.contact_numbers.map((cn, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "8px" }}>
                        <div style={{ position: "relative", flex: 1 }}>
                          <Phone size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                          <input
                            placeholder="Enter Contact Number"
                            value={cn}
                            onChange={(e) => handleContactChange(idx, e.target.value.replace(/\D/g, ""))}
                            style={{ paddingLeft: "32px", width: "100%" }}
                          />
                        </div>
                        {formState.contact_numbers.length > 1 && (
                          <button type="button" className="danger icon-only" onClick={() => removeContactValue(idx)}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="secondary icon-button" onClick={addContactValue} style={{ width: "max-content", minHeight: "32px", fontSize: "12px" }}>
                      <Plus size={14} /> Add More Contact Number
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Email ID</label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                    <input
                      type="email"
                      value={formState.email_id}
                      onChange={(e) => setFormState((prev) => ({ ...prev, email_id: e.target.value }))}
                      style={{ paddingLeft: "32px", width: "100%" }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>City</label>
                  <div style={{ position: "relative" }}>
                    <MapPin size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                    <input
                      value={formState.city}
                      onChange={(e) => setFormState((prev) => ({ ...prev, city: e.target.value }))}
                      style={{ paddingLeft: "32px", width: "100%" }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value }))}
                    style={{ width: "100%" }}
                  >
                    {VENDOR_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Website</label>
                  <div style={{ position: "relative" }}>
                    <Globe size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                    <input
                      placeholder="e.g. www.vendor.com"
                      value={formState.website}
                      onChange={(e) => setFormState((prev) => ({ ...prev, website: e.target.value }))}
                      style={{ paddingLeft: "32px", width: "100%" }}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Quotation Updated Date</label>
                  <div style={{ position: "relative" }}>
                    <Calendar size={16} className="muted" style={{ position: "absolute", left: "10px", top: "11px" }} />
                    <input
                      type="date"
                      value={formState.quotation_updated_date}
                      onChange={(e) => setFormState((prev) => ({ ...prev, quotation_updated_date: e.target.value }))}
                      style={{ paddingLeft: "32px", width: "100%" }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="secondary icon-button" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="icon-button">
                  <Save size={16} /> Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
