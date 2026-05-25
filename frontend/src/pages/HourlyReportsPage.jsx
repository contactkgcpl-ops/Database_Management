import React, { useState, useEffect } from "react";
import { Plus, Save, Trash, Send } from "lucide-react";
import { api } from "../api";

export function HourlyReportsPage({ user }) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReports();
  }, [workDate]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await api.hourlyReports(`work_date=${workDate}`);
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateTimeSlots = () => {
    const newSlots = [...reports];
    for (let i = 10; i <= 18; i++) {
      const startStr = `${String(i).padStart(2, "0")}:00`;
      const exists = reports.some((r) => r.start_time === startStr);
      if (!exists) {
        newSlots.push({
          id: `temp-${Date.now()}-${i}`,
          work_date: workDate,
          start_time: startStr,
          end_time: `${String(i + 1).padStart(2, "0")}:00`,
          description: "",
          status: "Draft",
          isNew: true,
        });
      }
    }
    newSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
    setReports(newSlots);
  };

  const addRow = () => {
    const lastReport = reports[reports.length - 1];
    let start_time = "10:00";
    let end_time = "11:00";
    if (lastReport) {
      start_time = lastReport.end_time;
      const [h, m] = start_time.split(":");
      end_time = `${String(Number(h) + 1).padStart(2, "0")}:${m}`;
    }
    setReports([
      ...reports,
      {
        id: `temp-${Date.now()}`,
        work_date: workDate,
        start_time,
        end_time,
        description: "",
        status: "Draft",
        isNew: true,
      },
    ]);
  };

  const updateRow = (id, field, value) => {
    setReports((current) =>
      current.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const saveRow = async (row) => {
    if (!row.description.trim()) return;
    setSaving(true);
    try {
      if (row.isNew) {
        const saved = await api.createHourlyReport({
          work_date: row.work_date,
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description,
          status: "Saved",
        });
        setReports((current) => current.map((r) => (r.id === row.id ? saved : r)));
      } else {
        const saved = await api.updateHourlyReport(row.id, {
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description,
          status: "Saved",
        });
        setReports((current) => current.map((r) => (r.id === row.id ? saved : r)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id, isNew) => {
    if (!isNew) {
      if (!confirm("Delete this report?")) return;
      try {
        await api.deleteHourlyReport(id);
      } catch (err) {
        console.error(err);
        return;
      }
    }
    setReports((current) => current.filter((r) => r.id !== id));
  };

  const submitDay = async () => {
    try {
      await api.submitHourlyReports(workDate);
      loadReports();
      window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Reports submitted successfully!", type: "success" } }));
    } catch (err) {
      console.error(err);
    }
  };

  const allSubmitted = reports.length > 0 && reports.every((r) => r.status === "Submitted");
  const hasDrafts = reports.some((r) => (r.status === "Draft" || r.status === "Saved") && !r.isNew);

  return (
    <div className="crm-page reports-page">
      <div className="page-header">
        <div>
          <h1>Hourly Reporting</h1>
          <p>Log your work progress every hour.</p>
        </div>
        <div className="reports-actions">
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="date-picker"
          />
          {!loading && (
            <button type="button" className="primary" onClick={generateTimeSlots}>
              Auto-fill Missing Slots
            </button>
          )}
          {hasDrafts && (
            <button type="button" className="success" onClick={submitDay}>
              <Send size={15} /> Submit Daily Report
            </button>
          )}
        </div>
      </div>

      <div className="sheet-container">
        {loading ? (
          <div className="loading">Loading reports...</div>
        ) : (
          <table className="sheet-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Start Time</th>
                <th style={{ width: "120px" }}>End Time</th>
                <th>Work Description</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "100px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((row) => (
                <tr key={row.id} className={row.status === "Submitted" ? "submitted-row" : ""}>
                  <td>
                    <input
                      type="time"
                      value={row.start_time}
                      onChange={(e) => updateRow(row.id, "start_time", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.end_time}
                      onChange={(e) => updateRow(row.id, "end_time", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="What did you work on?"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, "description", e.target.value)}
                    />
                  </td>
                  <td>
                    <span className={`status-badge ${row.status.toLowerCase()}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => saveRow(row)} title="Save Draft" disabled={saving || !row.description.trim()}>
                        <Save size={20} />
                      </button>
                      <button type="button" onClick={() => deleteRow(row.id, row.isNew)} title="Delete">
                        <Trash size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="5">
                  <button type="button" className="add-row-btn" onClick={addRow}>
                    <Plus size={18} /> Add Row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .reports-page { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .page-header h1 { margin: 0; font-size: 24px; color: #0f172a; }
        .page-header p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
        .reports-actions { display: flex; gap: 12px; align-items: center; }
        .date-picker { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
        
        .sheet-container { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .sheet-table { width: 100%; border-collapse: collapse; text-align: left; }
        .sheet-table th { background: #f8fafc; padding: 12px 16px; font-size: 13px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
        .sheet-table td { padding: 8px 16px; border-bottom: 1px solid #f1f5f9; }
        .sheet-table input { width: 100%; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; font: inherit; background: transparent; transition: all 0.2s; }
        .sheet-table input:hover:not(:disabled) { border-color: #cbd5e1; background: #fff; }
        .sheet-table input:focus:not(:disabled) { border-color: #3b82f6; background: #fff; outline: none; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
        .sheet-table input:disabled { color: #64748b; cursor: not-allowed; }
        
        .submitted-row td { background: #f8fafc; }
        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .status-badge.draft { background: #f1f5f9; color: #64748b; }
        .status-badge.saved { background: #fef3c7; color: #d97706; }
        .status-badge.submitted { background: #dcfce7; color: #166534; }
        
        .row-actions { display: flex; gap: 6px; }
        .row-actions button { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 6px; border: none; background: transparent; cursor: pointer; color: #64748b; transition: all 0.2s; }
        .row-actions button:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
        .row-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .add-row-btn { display: flex; align-items: center; gap: 8px; padding: 12px; width: 100%; border: none; background: transparent; color: #3b82f6; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .add-row-btn:hover { background: #f8fafc; }
        
        .loading { padding: 40px; text-align: center; color: #64748b; }
      ` }} />
    </div>
  );
}
