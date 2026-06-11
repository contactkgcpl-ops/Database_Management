import React, { useState, useEffect } from "react";
import { Plus, Save, Trash, Send, Search, RefreshCw } from "lucide-react";
import { api } from "../api";

export function HourlyReportsPage({ user }) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [appliedWorkDate, setAppliedWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCallLogReportId, setActiveCallLogReportId] = useState(null);

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
          work_type: "General",
          calls: [],
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
        work_type: "General",
        calls: [],
        isNew: true,
      },
    ]);
  };

  const updateRow = (id, field, value) => {
    setReports((current) =>
      current.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleOpenCallLog = (reportId) => {
    setActiveCallLogReportId(reportId);
  };

  const handleAddCall = (reportId) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    const currentCalls = report.calls || [];
    if (currentCalls.length >= 20) {
      window.dispatchEvent(
        new CustomEvent("erp:notify", {
          detail: { message: "Maximum limit of 20 calls reached for this hour.", type: "warning" },
        })
      );
      return;
    }
    const updatedCalls = [
      ...currentCalls,
      { contact_number: "", contact_person: "", contact_for: "" },
    ];
    updateRow(reportId, "calls", updatedCalls);
  };

  const handleUpdateCall = (reportId, index, field, value) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    const currentCalls = [...(report.calls || [])];
    currentCalls[index] = { ...currentCalls[index], [field]: value };
    updateRow(reportId, "calls", currentCalls);
  };

  const handleDeleteCall = (reportId, index) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    const currentCalls = [...(report.calls || [])];
    currentCalls.splice(index, 1);
    updateRow(reportId, "calls", currentCalls);
  };

  const saveRow = async (row) => {
    const isCalling = row.work_type === "Calling" || row.work_type === "Marketing";
    const isPurchase = row.work_type === "Purchase";
    
    if (isCalling || isPurchase) {
      if (isCalling && (!row.calls || row.calls.length === 0)) {
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Please log at least 1 call detail for Calling/Marketing tasks.", type: "error" },
          })
        );
        return;
      }
      if (row.calls && row.calls.length > 20) {
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Maximum 20 calls can be logged in a single hour slot.", type: "error" },
          })
        );
        return;
      }
      if (row.calls) {
        for (const call of row.calls) {
          if (!call.contact_number.trim() || !call.contact_person.trim() || !call.contact_for.trim()) {
            window.dispatchEvent(
              new CustomEvent("erp:notify", {
                detail: { message: "Please fill in all call details (number, person, and purpose).", type: "error" },
              })
            );
            return;
          }
        }
      }
      if (isPurchase && (!row.calls || row.calls.length === 0) && (!row.description || !row.description.trim())) {
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Work description is required.", type: "error" },
          })
        );
        return;
      }
    } else {
      if (!row.description || !row.description.trim()) {
        window.dispatchEvent(
          new CustomEvent("erp:notify", {
            detail: { message: "Work description is required.", type: "error" },
          })
        );
        return;
      }
    }

    setSaving(true);
    try {
      if (row.isNew) {
        const saved = await api.createHourlyReport({
          work_date: row.work_date,
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description || "",
          status: "Saved",
          work_type: row.work_type || "General",
          calls: row.calls || [],
        });
        setReports((current) => current.map((r) => (r.id === row.id ? saved : r)));
      } else {
        const saved = await api.updateHourlyReport(row.id, {
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description,
          status: "Saved",
          work_type: row.work_type || "General",
          calls: row.calls || [],
        });
        setReports((current) => current.map((r) => (r.id === row.id ? saved : r)));
      }
      window.dispatchEvent(
        new CustomEvent("erp:notify", {
          detail: { message: "Report saved as draft successfully!", type: "success" },
        })
      );
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
      window.dispatchEvent(
        new CustomEvent("erp:notify", { detail: { message: "Reports submitted successfully!", type: "success" } })
      );
    } catch (err) {
      console.error(err);
    }
  };

  const hasDrafts = reports.some((r) => (r.status === "Draft" || r.status === "Saved") && !r.isNew);

  return (
    <div className="stack inquiries-page" style={{ padding: "0px 10px" }}>
      <div className="inquiry-command-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: "700",
              color: "#475569",
            }}
          >
            Work Date
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="filter-input"
              style={{
                padding: "6px 8px",
                border: "1px solid #cbd5e1",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            />
          </label>
          <button
            type="button"
            className="primary icon-button"
            onClick={() => setAppliedWorkDate(workDate)}
            style={{
              backgroundColor: "#176b5b",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              height: "30px",
              padding: "0 14px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            <Search size={14} /> Search
          </button>
          <button
            type="button"
            className="secondary icon-button small-action"
            onClick={loadReports}
            style={{
              height: "30px",
              width: "30px",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="row-actions">
          {!loading && (
            <button
              type="button"
              className="primary icon-button"
              onClick={generateTimeSlots}
              style={{
                backgroundColor: "#16a34a",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "36px",
                padding: "0 14px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              Auto-fill Missing
            </button>
          )}
          {hasDrafts && (
            <button
              type="button"
              className="primary icon-button"
              onClick={submitDay}
              style={{
                backgroundColor: "#176b5b",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "36px",
                padding: "0 14px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
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
                <th style={{ width: "110px" }}>Start Time</th>
                <th style={{ width: "110px" }}>End Time</th>
                <th style={{ width: "180px" }}>Work Category</th>
                <th>Work Details / Description</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "100px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    Loading reports...
                  </td>
                </tr>
              ) : (
                reports.map((row) => {
                  const isCalling = row.work_type === "Calling" || row.work_type === "Marketing";
                  const isPurchase = row.work_type === "Purchase";
                  const callsCount = row.calls?.length || 0;
                  const isSubmitted = row.status === "Submitted";
                  return (
                    <tr key={row.id} className={isSubmitted ? "order-placed-row" : ""}>
                      <td>
                        <input
                          type="time"
                          value={row.start_time}
                          onChange={(e) => updateRow(row.id, "start_time", e.target.value)}
                          className="cell-input"
                          disabled={isSubmitted}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={row.end_time}
                          onChange={(e) => updateRow(row.id, "end_time", e.target.value)}
                          className="cell-input"
                          disabled={isSubmitted}
                        />
                      </td>
                      <td>
                        <select
                          value={row.work_type || "General"}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateRow(row.id, "work_type", val);
                            if ((val === "Calling" || val === "Marketing") && (!row.calls || row.calls.length === 0)) {
                              updateRow(row.id, "calls", [{ contact_number: "", contact_person: "", contact_for: "" }]);
                            }
                          }}
                          className="cell-input"
                          style={{
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            padding: "6px",
                            height: "32px",
                            fontSize: "12px",
                            background: "#fff",
                          }}
                          disabled={isSubmitted}
                        >
                          <option value="General">General</option>
                          <option value="Calling">Calling (Calling Staff)</option>
                          <option value="Marketing">Marketing (Calling / Direct)</option>
                          <option value="Purchase">Purchase (Vendor Dealings)</option>
                          <option value="Back Office">Back Office (Admin Work)</option>
                          <option value="Brochure/Design">Brochure / Graphic Design</option>
                          <option value="Other">Other</option>
                        </select>
                      </td>
                      <td>
                        {isCalling || isPurchase ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenCallLog(row.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: "none",
                                background: callsCount > 0 ? "#176b5b" : (isCalling ? "#dc2626" : "#64748b"),
                                color: "#fff",
                                fontWeight: "600",
                                cursor: "pointer",
                                fontSize: "12px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              📞 Log Calls ({callsCount} / 20)
                            </button>
                            <input
                              type="text"
                              placeholder={isCalling ? "Calling details / comments..." : "Purchase details or supplier/vendor info..."}
                              value={row.description}
                              onChange={(e) => updateRow(row.id, "description", e.target.value)}
                              className="cell-input"
                              disabled={isSubmitted}
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="What did you work on?"
                            value={row.description}
                            onChange={(e) => updateRow(row.id, "description", e.target.value)}
                            className="cell-input"
                            disabled={isSubmitted}
                          />
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${row.status.toLowerCase()}`}>{row.status}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="cell-icon-button"
                            style={{
                              background: "#0ea5e9",
                              opacity: saving || isSubmitted ? 0.5 : 1,
                            }}
                            onClick={() => saveRow(row)}
                            title="Save Draft"
                            disabled={saving || isSubmitted}
                          >
                            <Save size={13} />
                          </button>
                          <button
                            type="button"
                            className="cell-icon-button"
                            style={{ background: "#dc2626", opacity: isSubmitted ? 0.5 : 1 }}
                            onClick={() => deleteRow(row.id, row.isNew)}
                            title="Delete"
                            disabled={isSubmitted}
                          >
                            <Trash size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {!loading && (
                <tr>
                  <td colSpan="6">
                    <button
                      type="button"
                      onClick={addRow}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        color: "#176b5b",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      <Plus size={16} /> Add Row
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeCallLogReportId && (() => {
        const activeReport = reports.find((r) => r.id === activeCallLogReportId);
        if (!activeReport) return null;
        const isSubmitted = activeReport.status === "Submitted";
        const calls = activeReport.calls || [];

        return (
          <div className="modal-backdrop">
            <div className="modal-container">
              <div className="modal-header">
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <h3 style={{ margin: 0, color: "#1e293b", fontSize: "15px", fontWeight: "700" }}>
                    Log Calls ({activeReport.start_time} - {activeReport.end_time})
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Log contacts and details for this hour's calls.
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    color: calls.length >= 20 ? "#ef4444" : "#176b5b",
                    fontWeight: "700",
                    background: calls.length >= 20 ? "#fee2e2" : "#f0fdf4",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {calls.length} / 20 Calls
                </span>
              </div>
              <div className="modal-content">
                {calls.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: "13px" }}>
                    No calls logged for this hour slot. Click "+ Add Call Log" to begin.
                  </div>
                ) : (
                  <div className="table-wrap" style={{ border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                    <table className="company-table" style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: "160px", padding: "10px", background: "#f8fafc" }}>Contact Number</th>
                          <th style={{ width: "160px", padding: "10px", background: "#f8fafc" }}>Contact Person</th>
                          <th style={{ padding: "10px", background: "#f8fafc" }}>Contact Purpose / Details</th>
                          {!isSubmitted && <th style={{ width: "50px", padding: "10px", background: "#f8fafc" }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {calls.map((call, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: "8px" }}>
                              <input
                                type="text"
                                placeholder="e.g. 9876543210"
                                value={call.contact_number}
                                onChange={(e) => handleUpdateCall(activeReport.id, idx, "contact_number", e.target.value)}
                                className="cell-input"
                                style={{ border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff", padding: "6px" }}
                                disabled={isSubmitted}
                              />
                            </td>
                            <td style={{ padding: "8px" }}>
                              <input
                                type="text"
                                placeholder="e.g. John Doe"
                                value={call.contact_person}
                                onChange={(e) => handleUpdateCall(activeReport.id, idx, "contact_person", e.target.value)}
                                className="cell-input"
                                style={{ border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff", padding: "6px" }}
                                disabled={isSubmitted}
                              />
                            </td>
                            <td style={{ padding: "8px" }}>
                              <input
                                type="text"
                                placeholder="e.g. Discussed pricing / brochure"
                                value={call.contact_for}
                                onChange={(e) => handleUpdateCall(activeReport.id, idx, "contact_for", e.target.value)}
                                className="cell-input"
                                style={{ border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff", padding: "6px" }}
                                disabled={isSubmitted}
                              />
                            </td>
                            {!isSubmitted && (
                              <td style={{ padding: "8px", textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="cell-icon-button"
                                  style={{
                                    background: "#dc2626",
                                    padding: "6px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "26px",
                                    height: "26px",
                                  }}
                                  onClick={() => handleDeleteCall(activeReport.id, idx)}
                                  title="Remove Call"
                                >
                                  <Trash size={12} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!isSubmitted && calls.length < 20 && (
                  <button
                    type="button"
                    onClick={() => handleAddCall(activeReport.id)}
                    style={{
                      marginTop: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      border: "1px dashed #176b5b",
                      background: "#f0fdf4",
                      color: "#176b5b",
                      fontWeight: "600",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    <Plus size={14} /> Add Call Log
                  </button>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setActiveCallLogReportId(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#475569",
                  }}
                >
                  Close & Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style
        dangerouslySetInnerHTML={{
          __html: `
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

        .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
        .modal-container { background: #fff; border-radius: 12px; width: 720px; max-width: 95%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); animation: modalFadeIn 0.2s ease-out; }
        .modal-header { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
        .modal-content { padding: 20px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 16px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; }
        @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `,
        }}
      />
    </div>
  );
}
