import React from "react";
import { Check, Mail, MessageCircle, Phone } from "lucide-react";
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
  size = 13,
}) {
  const [selectedSources, setSelectedSources] = React.useState(() => splitValues(connectedSourceValue));
  const [pendingSources, setPendingSources] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
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
              if (!disabled) markSource(source);
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
    </div>
  );
}
