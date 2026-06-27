import React, { useState, useEffect } from "react";
import { 
  Download, 
  Settings, 
  Send, 
  Plus, 
  Trash2, 
  Calendar, 
  Save, 
  CheckCircle, 
  XCircle, 
  Clock,
  Loader
} from "lucide-react";
import { api } from "../api";

export function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [config, setConfig] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    to_emails: [],
    schedule_time: "20:00",
    is_active: false,
    has_password: false
  });
  const [newEmail, setNewEmail] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadConfig();
    loadLogs();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.reportsConfig();
      if (res) {
        setConfig(res);
      }
    } catch (err) {
      console.error("Failed to load report config", err);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await api.reportsLogs();
      if (res) {
        setLogs(res);
      }
    } catch (err) {
      console.error("Failed to load report logs", err);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      await api.downloadReportCsv(selectedDate);
    } catch (err) {
      console.error("Failed to download report", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateReportsConfig(config);
      if (res) {
        setConfig(res);
        setNewEmail("");
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Report settings saved successfully!", type: "success" }
          })
        );
      }
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const res = await api.sendReportNow(selectedDate);
      if (res) {
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Test report email sent successfully!", type: "success" }
          })
        );
        loadLogs();
      }
    } catch (err) {
      console.error("Failed to send test report", err);
    } finally {
      setSendingTest(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return;
    const emailToAdd = newEmail.trim();
    if (config.to_emails.includes(emailToAdd)) {
      window.dispatchEvent(
        new CustomEvent("erp:notify", {
          detail: { message: "Email is already in list", type: "error" }
        })
      );
      return;
    }
    const updatedEmails = [...config.to_emails, emailToAdd];
    setConfig({
      ...config,
      to_emails: updatedEmails
    });
    setNewEmail("");
    
    try {
      const res = await api.updateReportsConfig({
        ...config,
        to_emails: updatedEmails
      });
      if (res) {
        setConfig(res);
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Recipient email added and saved!", type: "success" }
          })
        );
      }
    } catch (err) {
      console.error("Failed to save email add", err);
    }
  };

  const handleRemoveEmail = async (email) => {
    const updatedEmails = config.to_emails.filter((e) => e !== email);
    setConfig({
      ...config,
      to_emails: updatedEmails
    });
    
    try {
      const res = await api.updateReportsConfig({
        ...config,
        to_emails: updatedEmails
      });
      if (res) {
        setConfig(res);
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Recipient email deleted and saved!", type: "success" }
          })
        );
      }
    } catch (err) {
      console.error("Failed to save email delete", err);
    }
  };

  return (
    <div className="reports-page" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px", color: "#1F4E78" }}>📊 Activity & Performance Reports</h2>
          <p style={{ margin: "4px 0 0 0", color: "#666", fontSize: "14px" }}>Generate Excel reports and schedule daily email notifications.</p>
        </div>
      </div>

      {/* Grid Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column: Download & Manual Generation */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Generate Report Box */}
          <div style={{ background: "#fff", borderRadius: "8px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={20} color="#1F4E78" /> Download Activity Report
            </h3>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>SELECT DATE</label>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>
              <button 
                onClick={handleDownload}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  background: "#1F4E78",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  height: "41px"
                }}
              >
                {loading ? <Loader className="spin" size={16} /> : <Download size={16} />}
                Download Excel
              </button>
            </div>
          </div>

          {/* Email Send Log */}
          <div style={{ background: "#fff", borderRadius: "8px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", flex: 1, display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock size={20} color="#375623" /> Email Send History Log
            </h3>
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "400px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                    <th style={{ padding: "12px 8px", color: "#666" }}>Date</th>
                    <th style={{ padding: "12px 8px", color: "#666" }}>Sent At</th>
                    <th style={{ padding: "12px 8px", color: "#666" }}>Status</th>
                    <th style={{ padding: "12px 8px", color: "#666" }}>Recipients</th>
                    <th style={{ padding: "12px 8px", color: "#666" }}>Error Info</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: "20px 8px", textAlign: "center", color: "#999" }}>No email reports sent yet.</td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                        <td style={{ padding: "12px 8px", fontWeight: "bold" }}>{log.report_date}</td>
                        <td style={{ padding: "12px 8px", color: "#555" }}>
                          {new Date(log.sent_at).toLocaleString()}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          {log.status === "success" ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#28a745", fontWeight: "bold" }}>
                              <CheckCircle size={14} /> Sent
                            </span>
                          ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#dc3545", fontWeight: "bold" }}>
                              <XCircle size={14} /> Failed
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.recipients}>
                          {log.recipients || "—"}
                        </td>
                        <td style={{ padding: "12px 8px", color: "#dc3545", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.error_message}>
                          {log.error_message || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Settings */}
        <div style={{ background: "#fff", borderRadius: "8px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
            <Settings size={20} color="#C65911" /> Outlook SMTP & Schedule Settings
          </h3>
          
          <form onSubmit={handleSaveConfig} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", gap: "16px" }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>SMTP SERVER</label>
                <input 
                  type="text" 
                  value={config.smtp_host}
                  onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
                  placeholder="smtp.office365.com"
                  required
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>PORT</label>
                <input 
                  type="number" 
                  value={config.smtp_port}
                  onChange={(e) => setConfig({ ...config, smtp_port: parseInt(e.target.value) || 587 })}
                  placeholder="587"
                  required
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>FROM EMAIL ADDRESS</label>
              <input 
                type="email" 
                value={config.smtp_user}
                onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
                placeholder="reports@yourcompany.com"
                required
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>SMTP PASSWORD</label>
              <input 
                type="password" 
                value={config.smtp_password}
                onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })}
                placeholder={config.has_password ? "Saved (Enter new password to update)" : "Outlook/Gmail SMTP App Password"}
                required={!config.has_password}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>

            {/* Recipient Emails Multi-select list */}
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>TO RECIPIENT EMAILS (+ click Save Settings to save)</label>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <input 
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Add recipient email address"
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
                />
                <button 
                  type="button"
                  onClick={handleAddEmail}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "41px",
                    height: "41px",
                    background: "#375623",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer"
                  }}
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Recipient List display */}
              <div style={{ 
                border: "1px solid #ccc", 
                borderRadius: "6px", 
                maxHeight: "150px", 
                overflowY: "auto", 
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                background: "#fdfdfd"
              }}>
                {config.to_emails.length === 0 ? (
                  <span style={{ fontSize: "12px", color: "#999", padding: "4px" }}>No recipients added. Add at least one email address.</span>
                ) : (
                  config.to_emails.map((email) => (
                    <div 
                      key={email}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        background: "#f0f4f0",
                        borderRadius: "4px",
                        fontSize: "13px"
                      }}
                    >
                      <span style={{ color: "#333" }}>{email}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveEmail(email)}
                        style={{ border: "none", background: "none", color: "#dc3545", cursor: "pointer", padding: "2px" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Schedule Info */}
            <div style={{ display: "flex", gap: "16px", alignItems: "center", background: "#fcf8f2", padding: "12px", borderRadius: "6px", border: "1px solid #f5e6d3" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#666", fontWeight: "bold" }}>DAILY SCHEDULE TIME (IST)</label>
                <input 
                  type="time" 
                  value={config.schedule_time}
                  onChange={(e) => setConfig({ ...config, schedule_time: e.target.value })}
                  required
                  style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px" }}>
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={config.is_active}
                  onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label htmlFor="isActive" style={{ fontWeight: "bold", fontSize: "14px", cursor: "pointer", color: "#333" }}>Active Scheduling</label>
              </div>
            </div>

            {/* Form actions */}
            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <button 
                type="submit" 
                disabled={saving}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px",
                  background: "#375623",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "14px"
                }}
              >
                {saving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                Save Settings
              </button>

              <button 
                type="button" 
                onClick={handleSendTest}
                disabled={sendingTest || config.to_emails.length === 0}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px",
                  background: "#C65911",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "14px"
                }}
              >
                {sendingTest ? <Loader className="spin" size={16} /> : <Send size={16} />}
                Send Test Email
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
