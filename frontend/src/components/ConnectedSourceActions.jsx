import React from "react";
import { Check, Mail, MessageCircle, Phone, X } from "lucide-react";
import { api } from "../api";

function splitValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstValue(value) {
  return splitValues(value)[0] || "";
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

const sourceMeta = {
  whatsapp: {
    label: "WhatsApp",
    Icon: MessageCircle,
    className: "whatsapp",
    color: "#25D366",
    href: (phone) => phone ? `https://api.whatsapp.com/send?phone=${phone}` : "",
  },
  call: {
    label: "Call",
    Icon: Phone,
    className: "call",
    color: "#3b82f6",
    href: (phone) => phone ? `tel:${phone}` : "",
  },
  email: {
    label: "Email",
    Icon: Mail,
    className: "email",
    color: "#ef4444",
    href: (_phone, email) => email ? `mailto:${email}` : "",
  },
};

export function ConnectedSourceActions({
  companyId,
  connectedSourceProperty,
  connectedSourceValue,
  contactNumber,
  emailId,
  onUpdated,
  statusProperty,
  currentStatus,
  size = 13,
}) {
  const [selectedSources, setSelectedSources] = React.useState(() => splitValues(connectedSourceValue));
  const [pendingSources, setPendingSources] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [showCallModal, setShowCallModal] = React.useState(false);
  const [callForm, setCallForm] = React.useState({ remark: "", followUpDate: "", status: "", requirement: "" });
  const primaryNumber = firstValue(contactNumber);
  const primaryEmail = firstValue(emailId);
  const normalizedPhone = cleanPhone(primaryNumber);

  React.useEffect(() => {
    setSelectedSources(splitValues(connectedSourceValue));
  }, [connectedSourceValue]);

  const markSource = (source) => {
    setSelectedSources((current) => (
      current.includes(source) ? current : [...current, source]
    ));
    setPendingSources((current) => (
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    ));
  };

  const saveSources = async () => {
    if (!connectedSourceProperty?.id || !companyId) return;
    if (!pendingSources.length) return;
    setSaving(true);
    const nextValue = selectedSources.join(",");
    await api.updateCompanyInline(companyId, {
      property_id: connectedSourceProperty.id,
      value: nextValue,
      remark: `${pendingSources.map((source) => sourceMeta[source]?.label || source).join(", ")} contact logged`,
    });
    setPendingSources([]);
    onUpdated?.();
    setSaving(false);
  };

  const submitCallLog = async (e) => {
    e.preventDefault();
    if (!callForm.remark.trim()) return;
    if (callForm.status === "converted" && !callForm.requirement?.trim()) return;
    
    setSaving(true);
    try {
      const nextSources = selectedSources.includes("call") ? selectedSources : [...selectedSources, "call"];
      const nextValue = nextSources.join(",");
      const remark = callForm.remark.trim();
      const followUpDate = callForm.followUpDate || null;
      
      if (callForm.status === "converted") {
        await api.convertLeadToInquiry(companyId, {
          follow_up_date: followUpDate,
          remark: remark,
          requirement: callForm.requirement.trim()
        });
      } else if (callForm.status && callForm.status !== currentStatus && statusProperty) {
        await api.updateCompanyInline(companyId, {
          property_id: statusProperty.id,
          value: callForm.status,
          remark: remark,
          follow_up_date: followUpDate
        });
      } else if (followUpDate && statusProperty) {
        await api.updateCompanyInline(companyId, {
          property_id: statusProperty.id,
          value: currentStatus || "",
          remark: remark,
          follow_up_date: followUpDate
        });
      }
      
      // Always log call connection in connected_source property
      await api.updateCompanyInline(companyId, {
        property_id: connectedSourceProperty.id,
        value: nextValue,
        remark: remark
      });
      
      setSelectedSources(nextSources);
      setPendingSources(prev => prev.filter(s => s !== "call"));
      setShowCallModal(false);
      onUpdated?.();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="quick-connect-cell connected-source-actions">
      {Object.entries(sourceMeta).map(([source, meta]) => {
        const Icon = meta.Icon;
        const disabled = source === "email" ? !primaryEmail : !(normalizedPhone || primaryNumber);
        const selected = selectedSources.includes(source);
        const pending = pendingSources.includes(source);
        return (
          <button
            key={source}
            type="button"
            className={`connect-btn ${disabled ? "disabled" : meta.className} ${selected ? "selected" : ""}`}
            style={{
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: 0,
              borderRadius: "50%",
              padding: 0,
              color: disabled ? "#cbd5e1" : "#fff",
              backgroundColor: disabled ? "#f1f5f9" : pending ? "#f59e0b" : selected ? meta.color : "#94a3b8",
              boxShadow: pending ? "0 0 0 3px rgba(245, 158, 11, 0.28)" : selected ? `0 0 0 2px ${meta.color}33` : "none",
              cursor: disabled ? "not-allowed" : "pointer",
              flex: "0 0 24px",
            }}
            title={disabled ? `${meta.label} unavailable` : `Mark ${meta.label}`}
            onClick={() => {
              if (!disabled) {
                if (source === "call") {
                  setShowCallModal(true);
                  setCallForm({ remark: "", followUpDate: "", status: currentStatus || "", requirement: "" });
                } else {
                  markSource(source);
                }
              }
            }}
            disabled={disabled}
          >
            <Icon size={size} />
          </button>
        );
      })}
      <button
        type="button"
        className="connect-btn submit"
        title="Save connected source"
        onClick={saveSources}
        disabled={saving}
        style={{
          width: 24,
          height: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: 0,
          borderRadius: "50%",
          padding: 0,
          color: "#fff",
          backgroundColor: saving ? "#94a3b8" : "#176b5b",
          cursor: saving ? "wait" : "pointer",
          flex: "0 0 24px",
        }}
      >
        <Check size={size} />
      </button>

      {showCallModal && (
        <div 
          className="modal-backdrop" 
          style={{ 
            position: "fixed", 
            inset: 0, 
            backgroundColor: "rgba(0,0,0,0.4)", 
            display: "grid", 
            placeItems: "center", 
            zIndex: 11000 
          }}
        >
          <div 
            className="modal" 
            style={{ 
              maxWidth: "400px", 
              width: "95%", 
              backgroundColor: "#fff", 
              borderRadius: "8px", 
              overflow: "hidden",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
            }}
          >
            <div 
              className="modal-head" 
              style={{ 
                backgroundColor: "#176b5b", 
                color: "#fff", 
                padding: "15px 20px", 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center" 
              }}
            >
              <h2 style={{ fontSize: "16px", margin: 0, color: "#fff" }}>Log Call Connection</h2>
              <button 
                type="button"
                onClick={() => setShowCallModal(false)} 
                style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitCallLog} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>
                  Status
                </label>
                <select
                  value={callForm.status}
                  onChange={e => setCallForm({ ...callForm, status: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                >
                  <option value="">-</option>
                  {statusProperty?.options?.filter(o => o.is_active !== false && ["new", "connected", "not_connected", "converted", "not_interested"].includes(o.value)).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {callForm.status === "converted" && (
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>
                    Requirement *
                  </label>
                  <input
                    type="text"
                    required
                    value={callForm.requirement || ""}
                    onChange={e => setCallForm({ ...callForm, requirement: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                    placeholder="Enter customer requirement"
                  />
                </div>
              )}

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>
                  Status Remark *
                </label>
                <textarea
                  required
                  value={callForm.remark}
                  onChange={e => setCallForm({ ...callForm, remark: e.target.value })}
                  style={{ 
                    width: "100%", 
                    padding: "8px", 
                    border: "1px solid #cbd5e1", 
                    borderRadius: "6px", 
                    minHeight: "80px", 
                    fontFamily: "inherit",
                    boxSizing: "border-box"
                  }}
                  placeholder="Enter remark (compulsory)"
                />
              </div>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "5px", color: "#475569" }}>
                  Follow Up Date (Optional)
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={callForm.followUpDate}
                  onChange={e => setCallForm({ ...callForm, followUpDate: e.target.value })}
                  style={{ 
                    width: "100%", 
                    padding: "8px", 
                    border: "1px solid #cbd5e1", 
                    borderRadius: "6px", 
                    boxSizing: "border-box" 
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button 
                  type="button" 
                  className="secondary" 
                  onClick={() => setShowCallModal(false)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="primary" 
                  disabled={!callForm.remark.trim() || saving}
                  style={{ 
                    backgroundColor: "#176b5b", 
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    cursor: (!callForm.remark.trim() || saving) ? "not-allowed" : "pointer",
                    opacity: (!callForm.remark.trim() || saving) ? 0.6 : 1
                  }}
                >
                  {saving ? "Saving..." : "Log Call"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
