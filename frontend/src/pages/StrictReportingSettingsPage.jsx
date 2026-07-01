import React, { useState, useEffect } from "react";
import { Save, Settings, Users, ShieldAlert, Mail } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";

export function StrictReportingSettingsPage() {
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  
  // Settings Form State
  const [planLimit, setPlanLimit] = useState(15);
  const [reportInterval, setReportInterval] = useState(30);
  const [alert1, setAlert1] = useState(5);
  const [alert2, setAlert2] = useState(10);
  const [alert3, setAlert3] = useState(15);
  const [cutoffTime, setCutoffTime] = useState("19:00");
  const [defaultCc, setDefaultCc] = useState("");
  
  // Per-user CC Email lists
  const [usersList, setUsersList] = useState([]);
  const [userCcMap, setUserCcMap] = useState({});

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const config = await api.strictReportingConfig();
        setPlanLimit(config.plan_submission_limit_minutes);
        setReportInterval(config.report_interval_minutes);
        setAlert1(config.alert_interval_1_minutes);
        setAlert2(config.alert_interval_2_minutes);
        setAlert3(config.alert_interval_3_minutes);
        setCutoffTime(config.logout_report_cutoff_time);
        
        let ccJson = {};
        if (config.cc_emails_json) {
          try {
            ccJson = JSON.parse(config.cc_emails_json);
          } catch (e) {
            ccJson = {};
          }
        }
        
        setDefaultCc((ccJson.default || []).join(", "));
        setUserCcMap(ccJson);
        
        // Load all users
        const allUsers = await api.users({ include_inactive: false });
        setUsersList(allUsers);
      } catch (err) {
        notify("Failed to load settings configuration.", "error");
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleUserCcChange = (userId, value) => {
    setUserCcMap({
      ...userCcMap,
      [userId]: value.split(",").map(email => email.trim())
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const finalCcJson = {
        ...userCcMap,
        default: defaultCc.split(",").map(email => email.trim()).filter(email => email !== "")
      };
      
      await api.updateStrictReportingConfig({
        plan_submission_limit_minutes: Number(planLimit),
        report_interval_minutes: Number(reportInterval),
        alert_interval_1_minutes: Number(alert1),
        alert_interval_2_minutes: Number(alert2),
        alert_interval_3_minutes: Number(alert3),
        logout_report_cutoff_time: cutoffTime,
        cc_emails_json: JSON.stringify(finalCcJson)
      });
      notify("Strict reporting configurations saved successfully!", "success");
    } catch (err) {
      notify("Failed to update strict reporting configurations.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading && usersList.length === 0) {
    return (
      <div className="crm-loading-placeholder">
        <p>Loading settings configuration...</p>
      </div>
    );
  }

  return (
    <div className="crm-page">
      <section className="strict-settings-view">
        <header className="settings-header-banner">
          <div>
            <h1>Strict Monitoring Settings</h1>
            <p className="muted">Configure work plan deadlines, interval reporting warnings, and warning email alert paths.</p>
          </div>
          <button className="icon-button" onClick={handleSave} disabled={loading}>
            <Save size={15} /> Save Configurations
          </button>
        </header>

        <form onSubmit={handleSave} className="settings-grid-layout">
          {/* Timing Threshold Config */}
          <div className="settings-card">
            <div className="card-heading">
              <Settings size={18} />
              <h2>Reporting Limits & Intervals</h2>
            </div>
            <div className="card-body-form">
              <div className="form-group-row">
                <label>
                  <span>Work Plan Submission Deadline (Mins)</span>
                  <input
                    type="number"
                    value={planLimit}
                    onChange={(e) => setPlanLimit(e.target.value)}
                    required
                    min={1}
                  />
                  <small>Maximum minutes allowed after clock-in to submit morning work plans.</small>
                </label>
              </div>

              <div className="form-group-row">
                <label>
                  <span>Progress Report Interval (Mins)</span>
                  <input
                    type="number"
                    value={reportInterval}
                    onChange={(e) => setReportInterval(e.target.value)}
                    required
                    min={5}
                  />
                  <small>Minutes between mandatory progress reports during active working hours.</small>
                </label>
              </div>

              <div className="form-group-row">
                <label>
                  <span>End-of-Day Cutoff Time</span>
                  <input
                    type="text"
                    value={cutoffTime}
                    onChange={(e) => setCutoffTime(e.target.value)}
                    required
                    placeholder="e.g. 19:00"
                  />
                  <small>Target time (24h format) for submitting the final EOD logout report.</small>
                </label>
              </div>
            </div>
          </div>

          {/* Alarm Intervals Config */}
          <div className="settings-card">
            <div className="card-heading">
              <ShieldAlert size={18} />
              <h2>Escalation Alert Offsets</h2>
            </div>
            <div className="card-body-form">
              <div className="form-group-row">
                <label>
                  <span>Alert Level 1 Offset (Mins)</span>
                  <input
                    type="number"
                    value={alert1}
                    onChange={(e) => setAlert1(e.target.value)}
                    required
                    min={1}
                  />
                  <small>Minutes overdue before showing the 1st desktop notification warning.</small>
                </label>
              </div>

              <div className="form-group-row">
                <label>
                  <span>Alert Level 2 Offset (Mins)</span>
                  <input
                    type="number"
                    value={alert2}
                    onChange={(e) => setAlert2(e.target.value)}
                    required
                    min={1}
                  />
                  <small>Minutes overdue before showing the 2nd desktop notification warning.</small>
                </label>
              </div>

              <div className="form-group-row">
                <label>
                  <span>Alert Level 3 Offset (Mins) - Send Email</span>
                  <input
                    type="number"
                    value={alert3}
                    onChange={(e) => setAlert3(e.target.value)}
                    required
                    min={1}
                  />
                  <small>Minutes overdue before triggering the Critical level 3 alert email.</small>
                </label>
              </div>
            </div>
          </div>

          {/* User Specific CC settings */}
          <div className="settings-card full-width">
            <div className="card-heading">
              <Users size={18} />
              <h2>Employee Alert CC Configurations</h2>
            </div>
            <div className="card-body-form">
              <div className="form-group-row global-cc">
                <label>
                  <span>Default CC Email Addresses (comma separated)</span>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input
                      type="text"
                      placeholder="e.g. boss@salvin.com, admin@salvin.com"
                      value={defaultCc}
                      onChange={(e) => setDefaultCc(e.target.value)}
                    />
                  </div>
                  <small>Used as CC for all employees who do not have custom CC rules configured below.</small>
                </label>
              </div>

              <div className="user-cc-table-wrapper">
                <table className="user-cc-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Notification Email ID</th>
                      <th>CC Email Addresses (comma separated)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((usr) => (
                      <tr key={usr.id}>
                        <td><strong>{usr.name}</strong></td>
                        <td><span className="designation-chip">{usr.role_name}</span></td>
                        <td><code>{usr.crm_notification_email || usr.email}</code></td>
                        <td>
                          <input
                            type="text"
                            placeholder="default fallback"
                            value={(userCcMap[usr.id] || []).join(", ")}
                            onChange={(e) => handleUserCcChange(usr.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </form>
      </section>

      <style>{`
        .strict-settings-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
        }

        .settings-header-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 24px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .settings-header-banner h1 {
          margin: 0 0 6px 0;
          font-size: 1.5rem;
          color: #0f172a;
          font-weight: 700;
        }

        .settings-grid-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .settings-card {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          overflow: hidden;
        }

        .settings-card.full-width {
          grid-column: span 2;
        }

        .card-heading {
          padding: 16px 24px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #0f172a;
        }

        .card-heading h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }

        .card-body-form {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group-row label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group-row label span {
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
        }

        .form-group-row input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .form-group-row input:focus {
          border-color: #2563eb;
        }

        .form-group-row small {
          font-size: 0.75rem;
          color: #64748b;
        }

        .global-cc {
          margin-bottom: 16px;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-icon svg {
          position: absolute;
          left: 12px;
          color: #94a3b8;
        }

        .input-with-icon input {
          padding-left: 36px;
        }

        .user-cc-table-wrapper {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }

        .user-cc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .user-cc-table th, .user-cc-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
        }

        .user-cc-table th {
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
        }

        .user-cc-table input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
        }

        .user-cc-table input:focus {
          border-color: #2563eb;
        }

        .designation-chip {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .crm-loading-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
