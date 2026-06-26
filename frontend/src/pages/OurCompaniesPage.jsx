import React, { useMemo, useState } from "react";
import { 
  Building2, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  X,
  Camera,
  Save
} from "lucide-react";
import { api, assetUrl } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";

function initials(name = "C") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarColor(id) {
  const colors = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#ec4899"];
  return colors[id % colors.length];
}

const initialForm = {
  name: "",
  logo_url: "",
  website: "",
  email: "",
  phone: "",
  address: "",
  status: "Active",
};

export function OurCompaniesPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const companies = useLoad(() => api.ourCompanies());
  
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage = user?.permissions?.includes("our_companies.manage") || false;
  const companiesList = Array.isArray(companies.data) ? companies.data : [];

  const filteredCompanies = useMemo(() => {
    return companiesList.filter((company) => {
      const matchesSearch = company.name.toLowerCase().includes(q.trim().toLowerCase());
      const matchesStatus = statusFilter === "All" || company.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [companiesList, q, statusFilter]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(initialForm);
    setModalOpen(true);
  };

  const openEditModal = (company) => {
    setEditingId(company.id);
    setForm({
      name: company.name || "",
      logo_url: company.logo_url || "",
      website: company.website || "",
      email: company.email || "",
      phone: company.phone || "",
      address: company.address || "",
      status: company.status || "Active",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Please select a valid image file (PNG, JPG, WEBP, etc.)", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify("Logo image size must be less than 2MB", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLogoUploading(true);
    try {
      const res = await api.uploadOurCompanyLogo(formData);
      setForm((prev) => ({ ...prev, logo_url: res.filename }));
      notify("Logo uploaded successfully", "success");
    } catch (err) {
      notify(err.message || "Failed to upload logo", "error");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setForm((prev) => ({ ...prev, logo_url: "" }));
    notify("Logo removed", "info");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify("Company name is required", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        website: form.website.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      };

      if (editingId) {
        await api.updateOurCompany(editingId, payload);
        notify("Company updated successfully", "success");
      } else {
        await api.createOurCompany(payload);
        notify("Company created successfully", "success");
      }
      setModalOpen(false);
      companies.reload();
    } catch (err) {
      notify(err.message || "Failed to save company information", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company) => {
    if (!window.confirm(`Are you sure you want to delete corporate company "${company.name}"?`)) {
      return;
    }
    try {
      await api.deleteOurCompany(company.id);
      notify("Company deleted successfully", "success");
      companies.reload();
    } catch (err) {
      notify(err.message || "Failed to delete company", "error");
    }
  };

  return (
    <div className="our-companies-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Our Companies</h1>
          <p className="page-subtitle">Manage and monitor your sister companies, partners, and subsidiaries.</p>
        </div>
        {canManage && (
          <button 
            type="button" 
            className="add-btn" 
            onClick={openAddModal}
          >
            <Plus size={16} /> Add Corporate Company
          </button>
        )}
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by company name..." 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
          />
        </div>
        
        <div className="filter-group">
          <label>Status:</label>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {companies.loading ? (
        <div className="loading-state">Loading companies list...</div>
      ) : companies.error ? (
        <div className="error-state">
          <ShieldAlert size={24} />
          <span>Failed to load companies: {companies.error}</span>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="empty-state">
          <Building2 size={48} className="empty-icon" />
          <h3>No companies found</h3>
          <p>No corporate companies match your search. Get started by adding a new company.</p>
          {canManage && (
            <button 
              type="button" 
              className="add-btn inline-btn"
              onClick={openAddModal}
            >
              <Plus size={16} /> Add First Company
            </button>
          )}
        </div>
      ) : (
        <div className="companies-card-grid">
          {filteredCompanies.map((company) => (
            <div key={company.id} className="company-card">
              <div className="card-top">
                <div className="logo-container">
                  {company.logo_url ? (
                    <img 
                      src={assetUrl(company.logo_url)} 
                      alt={`${company.name} Logo`} 
                      className="company-logo"
                    />
                  ) : (
                    <div 
                      className="fallback-logo" 
                      style={{ backgroundColor: getAvatarColor(company.id) }}
                    >
                      {initials(company.name)}
                    </div>
                  )}
                </div>
                <div className="status-badge-wrap">
                  <span className={`status-badge ${company.status.toLowerCase()}`}>
                    {company.status === "Active" ? (
                      <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                    ) : (
                      <XCircle size={12} style={{ marginRight: 4 }} />
                    )}
                    {company.status}
                  </span>
                </div>
              </div>

              <div className="card-body">
                <h3 className="company-card-name" title={company.name}>{company.name}</h3>
                
                <div className="company-meta-list">
                  {company.website && (
                    <a 
                      href={company.website.startsWith("http") ? company.website : `https://${company.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="meta-item link-item"
                    >
                      <Globe size={14} className="meta-icon" />
                      <span className="meta-text">{company.website}</span>
                      <ExternalLink size={10} className="ext-icon" />
                    </a>
                  )}
                  {company.email && (
                    <div className="meta-item">
                      <Mail size={14} className="meta-icon" />
                      <span className="meta-text">{company.email}</span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="meta-item">
                      <Phone size={14} className="meta-icon" />
                      <span className="meta-text">{company.phone}</span>
                    </div>
                  )}
                  {company.address && (
                    <div className="meta-item address-item">
                      <MapPin size={14} className="meta-icon" />
                      <span className="meta-text address-text" title={company.address}>
                        {company.address}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="card-actions">
                  <button 
                    type="button" 
                    className="action-btn edit" 
                    onClick={() => openEditModal(company)}
                    title="Edit Company"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button 
                    type="button" 
                    className="action-btn delete" 
                    onClick={() => handleDelete(company)}
                    title="Delete Company"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Popup Modal */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="company-modal">
            <div className="modal-head">
              <div>
                <h2>{editingId ? "Edit Corporate Company" : "Add Corporate Company"}</h2>
                <p className="modal-subtitle">Save details, contact information, and logo branding.</p>
              </div>
              <button className="close-btn" onClick={handleCloseModal} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form-shell">
              <div className="modal-body-scroll">
                <div className="modal-form-layout">
                  {/* Logo Column */}
                  <div className="modal-logo-column">
                    <label className="field-label">Company Logo</label>
                    <div className="logo-preview-box">
                      {form.logo_url ? (
                        <div className="logo-display-container">
                          <img src={assetUrl(form.logo_url)} alt="Logo Preview" className="uploaded-logo-preview" />
                          <button 
                            type="button" 
                            className="remove-logo-btn" 
                            onClick={handleRemoveLogo}
                            title="Remove Logo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="logo-placeholder">
                          <Building2 size={32} className="placeholder-icon" />
                          <span>No Logo Selected</span>
                        </div>
                      )}
                      
                      <label className="upload-trigger-btn">
                        <Camera size={12} /> 
                        {logoUploading ? "Uploading..." : form.logo_url ? "Change" : "Upload"}
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleLogoUpload} 
                          style={{ display: "none" }}
                          disabled={logoUploading}
                        />
                      </label>
                    </div>
                    <small className="help-text">Max size: 2MB. JPG, PNG or WEBP.</small>
                  </div>

                  {/* Input Fields Column */}
                  <div className="modal-fields-column">
                    <div className="form-field">
                      <label htmlFor="name" className="field-label">Company Name *</label>
                      <div className="input-with-icon">
                        <Building2 size={14} className="input-icon" />
                        <input 
                          type="text" 
                          id="name"
                          name="name" 
                          placeholder="Corporate company name (e.g. Salvin Industries)" 
                          value={form.name} 
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="form-field">
                        <label htmlFor="website" className="field-label">Website</label>
                        <div className="input-with-icon">
                          <Globe size={14} className="input-icon" />
                          <input 
                            type="text" 
                            id="website"
                            name="website" 
                            placeholder="www.salvin.com" 
                            value={form.website} 
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="form-field">
                        <label htmlFor="email" className="field-label">Email Address</label>
                        <div className="input-with-icon">
                          <Mail size={14} className="input-icon" />
                          <input 
                            type="email" 
                            id="email"
                            name="email" 
                            placeholder="contact@salvin.com" 
                            value={form.email} 
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="form-field">
                        <label htmlFor="phone" className="field-label">Phone Number</label>
                        <div className="input-with-icon">
                          <Phone size={14} className="input-icon" />
                          <input 
                            type="text" 
                            id="phone"
                            name="phone" 
                            placeholder="Phone number" 
                            value={form.phone} 
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="form-field">
                        <label htmlFor="status" className="field-label">Active Status</label>
                        <div className="input-with-icon no-icon">
                          <select 
                            id="status"
                            name="status" 
                            value={form.status} 
                            onChange={handleChange}
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="form-field">
                      <label htmlFor="address" className="field-label">Physical Address</label>
                      <div className="input-with-icon text-area-wrap">
                        <MapPin size={14} className="input-icon textarea-icon" />
                        <textarea 
                          id="address"
                          name="address" 
                          rows="2"
                          placeholder="Corporate headquarters office address..." 
                          value={form.address} 
                          onChange={handleChange}
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={handleCloseModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="save-btn" disabled={saving || logoUploading}>
                  <Save size={14} /> {saving ? "Saving..." : "Save Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .our-companies-page {
          display: flex;
          flex-direction: column;
          gap: 20px;
          font-family: 'Inter', sans-serif;
          color: #1e293b;
        }
        .page-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
        }
        .page-title {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        .page-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
        .add-btn {
          background-color: #176b5b;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s;
        }
        .add-btn:hover {
          background-color: #0e5245;
        }
        .inline-btn {
          margin-top: 14px;
        }
        .filter-bar {
          display: flex;
          gap: 16px;
          background: #ffffff;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          align-items: center;
        }
        .search-box {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 10px;
          color: #94a3b8;
        }
        .search-box input {
          width: 100%;
          padding: 8px 12px 8px 34px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }
        .search-box input:focus {
          border-color: #176b5b;
        }
        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .filter-group label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
        }
        .filter-group select {
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          background-color: #fff;
          cursor: pointer;
          outline: none;
        }
        .filter-group select:focus {
          border-color: #176b5b;
        }
        .loading-state, .error-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 60px 20px;
          text-align: center;
        }
        .loading-state {
          color: #64748b;
          font-weight: 600;
        }
        .error-state {
          color: #ef4444;
          gap: 10px;
        }
        .empty-state h3 {
          margin: 12px 0 6px 0;
          font-size: 16px;
          color: #0f172a;
        }
        .empty-state p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
          max-width: 320px;
        }
        .empty-icon {
          color: #94a3b8;
        }
        .companies-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        .company-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .company-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
        }
        .card-top {
          padding: 16px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .logo-container {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.02);
        }
        .company-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 4px;
        }
        .fallback-logo {
          width: 100%;
          height: 100%;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
          letter-spacing: 0.5px;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        .status-badge.active {
          background-color: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .status-badge.inactive {
          background-color: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .card-body {
          padding: 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .company-card-name {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .company-meta-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #475569;
          font-size: 12px;
        }
        .meta-icon {
          color: #94a3b8;
          flex-shrink: 0;
        }
        .meta-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .link-item {
          color: #176b5b;
          text-decoration: none;
          font-weight: 600;
          width: fit-content;
        }
        .link-item:hover {
          text-decoration: underline;
        }
        .ext-icon {
          color: #176b5b;
          margin-left: 2px;
          flex-shrink: 0;
        }
        .address-item {
          align-items: flex-start;
        }
        .address-item .meta-icon {
          margin-top: 2px;
        }
        .address-text {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
          line-height: 1.4;
        }
        .card-actions {
          padding: 12px 16px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 10px;
        }
        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #475569;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .action-btn:hover {
          background-color: #f8fafc;
        }
        .action-btn.edit:hover {
          border-color: #176b5b;
          color: #176b5b;
        }
        .action-btn.delete:hover {
          border-color: #ef4444;
          color: #ef4444;
        }

        /* Modal Styles */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(6, 17, 15, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 900;
          padding: 20px;
        }
        .company-modal {
          width: min(640px, 100%);
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          max-height: 90vh;
          overflow: hidden;
          animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-head {
          padding: 18px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: #f8fafc;
        }
        .modal-head h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }
        .modal-subtitle {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
        }
        .close-btn:hover {
          background-color: #cbd5e1;
          color: #475569;
        }
        .modal-form-shell {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .modal-body-scroll {
          padding: 24px;
          overflow-y: auto;
          max-height: calc(90vh - 140px);
        }
        .modal-form-layout {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 24px;
        }
        @media (max-width: 600px) {
          .modal-form-layout {
            grid-template-columns: 1fr;
          }
        }
        .modal-logo-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
        }
        .logo-preview-box {
          width: 120px;
          height: 120px;
          border-radius: 10px;
          border: 2px dashed #cbd5e1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          background: #f8fafc;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .logo-preview-box:hover {
          border-color: #176b5b;
        }
        .logo-display-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
        }
        .uploaded-logo-preview {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 6px;
        }
        .remove-logo-btn {
          position: absolute;
          top: 4px;
          right: 4px;
          background: #fee2e2;
          color: #ef4444;
          border: 1px solid #fca5a5;
          padding: 3px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
        .remove-logo-btn:hover {
          background: #fecaca;
        }
        .logo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #94a3b8;
          font-size: 11px;
          gap: 4px;
        }
        .placeholder-icon {
          color: #cbd5e1;
        }
        .upload-trigger-btn {
          position: absolute;
          bottom: 6px;
          background: rgba(15, 23, 42, 0.82);
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.12);
          backdrop-filter: blur(1px);
        }
        .upload-trigger-btn:hover {
          background: rgba(15, 23, 42, 0.95);
        }
        .help-text {
          font-size: 10px;
          color: #94a3b8;
          max-width: 120px;
          line-height: 1.3;
        }
        .modal-fields-column {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .form-row-2 {
          display: flex;
          gap: 14px;
        }
        @media (max-width: 480px) {
          .form-row-2 {
            flex-direction: column;
            gap: 14px;
          }
        }
        .form-field {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field-label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
        }
        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 10px;
          color: #94a3b8;
        }
        .textarea-icon {
          top: 10px;
        }
        .input-with-icon input, 
        .input-with-icon select,
        .input-with-icon textarea {
          width: 100%;
          padding: 8px 10px 8px 32px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 12.5px;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          transition: border-color 0.2s;
        }
        .input-with-icon.no-icon select {
          padding-left: 10px;
        }
        .input-with-icon input::placeholder, 
        .input-with-icon textarea::placeholder {
          color: #94a3b8;
        }
        .input-with-icon input:focus, 
        .input-with-icon select:focus,
        .input-with-icon textarea:focus {
          border-color: #176b5b;
        }
        .text-area-wrap {
          align-items: flex-start;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          border-top: 1px solid #e2e8f0;
          padding: 16px 24px;
          background: #f8fafc;
        }
        .cancel-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }
        .cancel-btn:hover {
          background-color: #f1f5f9;
        }
        .save-btn {
          background: #176b5b;
          color: #ffffff;
          border: none;
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .save-btn:hover {
          background-color: #0e5245;
        }
        .save-btn:disabled, .cancel-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      ` }} />
    </div>
  );
}
