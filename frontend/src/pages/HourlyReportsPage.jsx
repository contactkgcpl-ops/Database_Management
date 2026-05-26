import React, { useState, useEffect } from "react";
import { Plus, Save, Trash, Send, Search, RefreshCw } from "lucide-react";
import { api } from "../api";

export function HourlyReportsPage({ user }) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [appliedWorkDate, setAppliedWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReports();
  }, [appliedWorkDate]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await api.hourlyReports(`work_date=${appliedWorkDate}`);
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
          work_date: appliedWorkDate,
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
        work_date: appliedWorkDate,
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
      await api.submitHourlyReports(appliedWorkDate);
      loadReports();
      window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Reports submitted successfully!", type: "success" } }));
    } catch (err) {
      console.error(err);
    }
  };

  const allSubmitted = reports.length > 0 && reports.every((r) => r.status === "Submitted");
  const hasDrafts = reports.some((r) => (r.status === "Draft" || r.status === "Saved") && !r.isNew);

  return (
    <div className="stack inquiries-page" style={{ padding: "0px 10px" }}>
      <div className="inquiry-command-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700", color: "#475569" }}>
            Work Date
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="filter-input"
              style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px" }}
            />
          </label>
          <button type="button" className="primary icon-button" onClick={() => setAppliedWorkDate(workDate)} style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            <Search size={14} /> Search
          </button>
          <button type="button" className="secondary icon-button small-action" onClick={loadReports} style={{ height: "30px", width: "30px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="row-actions">
          {!loading && (
            <button type="button" className="primary icon-button" onClick={generateTimeSlots} style={{ backgroundColor: "#16a34a", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
              Auto-fill Missing
            </button>
          )}
          {hasDrafts && (
            <button type="button" className="primary icon-button" onClick={submitDay} style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
              <Send size={15} /> Submit Daily Report
            </button>
          )}
        </div>
      </div>

      <div className="data-grid">
        <div className="table-wrap">
          <table className="company-table">
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
              {loading ? (
                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading reports...</td></tr>
              ) : (
                reports.map((row) => (
                  <tr key={row.id} className={row.status === "Submitted" ? "order-placed-row" : ""}>
                    <td>
                      <input
                        type="time"
                        value={row.start_time}
                        onChange={(e) => updateRow(row.id, "start_time", e.target.value)}
                        className="cell-input"
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={row.end_time}
                        onChange={(e) => updateRow(row.id, "end_time", e.target.value)}
                        className="cell-input"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="What did you work on?"
                        value={row.description}
                        onChange={(e) => updateRow(row.id, "description", e.target.value)}
                        className="cell-input"
                      />
                    </td>
                    <td>
                      <span className={`status-badge ${row.status.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button type="button" className="cell-icon-button" style={{ background: "#0ea5e9", opacity: (saving || !row.description.trim()) ? 0.5 : 1 }} onClick={() => saveRow(row)} title="Save Draft" disabled={saving || !row.description.trim()}>
                          <Save size={13} />
                        </button>
                        <button type="button" className="cell-icon-button" style={{ background: "#dc2626" }} onClick={() => deleteRow(row.id, row.isNew)} title="Delete">
                          <Trash size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!loading && (
                <tr>
                  <td colSpan="5">
                    <button type="button" onClick={addRow} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", width: "100%", border: "none", background: "transparent", color: "#176b5b", fontWeight: "600", cursor: "pointer" }}>
                      <Plus size={16} /> Add Row
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .inquiry-command-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .row-actions { display: flex; align-items: center; gap: 8px; }
        
        .cell-input { padding: 6px 8px; border: 1px solid transparent; border-radius: 4px; font-size: 13px; font-family: inherit; background: transparent; transition: all 0.2s; width: 100%; box-sizing: border-box; }
        .cell-input:hover:not(:disabled) { border-color: #cbd5e1; background: #fff; }
        .cell-input:focus:not(:disabled) { border-color: #176b5b; background: #fff; outline: none; }
        .cell-input:disabled { color: #64748b; cursor: not-allowed; }
        
        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .status-badge.draft { background: #f1f5f9; color: #64748b; }
        .status-badge.saved { background: #fef3c7; color: #d97706; }
        .status-badge.submitted { background: #dcfce7; color: #166534; }
      ` }} />
    </div>
  );
}
