import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle, Plus, Trash, LogOut, Lock, ArrowRight } from "lucide-react";
import { api } from "../api";
import { useNotify } from "./NotificationProvider";

export function StrictReportingManager({ user, onLogout }) {
  const notify = useNotify();
  const [status, setStatus] = useState(null);
  
  // Modals state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  // Daily Plan state
  const [todayTasks, setTodayTasks] = useState([]);
  const [unfinishedTasks, setUnfinishedTasks] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCount, setNewCount] = useState("");
  const [newEta, setNewEta] = useState("1 Hour");
  
  // Progress Report state
  const [todayPlanTasks, setTodayPlanTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [customTaskTitle, setCustomTaskTitle] = useState("");
  const [isCustomTask, setIsCustomTask] = useState(false);
  const [progressDesc, setProgressDesc] = useState("");
  const [nextTaskDesc, setNextTaskDesc] = useState("");
  
  // Logout Checklist state
  const [logoutTasks, setLogoutTasks] = useState([]);
  
  // Anti-spam email trigger guards
  const [emailTriggeredType, setEmailTriggeredType] = useState(null);

  // Request Notification permission
  useEffect(() => {
    if (user && !user.restrict_reporting && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, [user]);

  // Listen for manual open plan event
  useEffect(() => {
    const handleOpenPlan = () => {
      api.todayDailyPlan()
        .then((tasks) => setTodayTasks(tasks.map(t => ({
          work_title: t.work_title,
          description: t.description,
          count: t.count,
          eta_time: t.eta_time
        }))))
        .catch((err) => console.error("Failed to load today's tasks:", err));
      setShowPlanModal(true);
    };
    window.addEventListener("erp:open_plan_modal", handleOpenPlan);
    return () => window.removeEventListener("erp:open_plan_modal", handleOpenPlan);
  }, []);

  // Periodic Status Checking (Every 30 seconds)
  useEffect(() => {
    if (!user || user.restrict_reporting) return;

    const checkStatus = async () => {
      try {
        const data = await api.strictReportingStatus();
        setStatus(data);

        if (data.restrict_reporting) return;

        // Today's Plan Checks
        if (!data.plan_submitted && !data.is_on_break) {
          setShowPlanModal(true);
          setShowProgressModal(false);
          
          // Trigger Notifications & Emails
          handleAlerts(data.alert_level, "plan");
        } else if (data.plan_submitted) {
          setShowPlanModal(false);
          
          // Work Progress Report Checks
          const limit = data.config.report_interval_minutes;
          if (data.minutes_since_last_report >= limit && !data.is_on_break) {
            setShowProgressModal(true);
            handleAlerts(data.alert_level, "report");
          } else {
            setShowProgressModal(false);
          }
        }
      } catch (err) {
        console.error("Strict Reporting check failed:", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch previous unfinished tasks on mount / plan modal open
  useEffect(() => {
    if (showPlanModal) {
      api.previousUnfinishedTasks()
        .then((tasks) => setUnfinishedTasks(tasks))
        .catch((err) => console.error("Failed to load unfinished tasks:", err));
    }
  }, [showPlanModal]);

  // Fetch today's tasks when progress report opens
  useEffect(() => {
    if (showProgressModal) {
      api.todayDailyPlan()
        .then((tasks) => {
          setTodayPlanTasks(tasks);
          if (tasks.length > 0) {
            setSelectedTaskId(String(tasks[0].id));
            setIsCustomTask(false);
          } else {
            setIsCustomTask(true);
          }
        })
        .catch((err) => console.error("Failed to load today's plan tasks:", err));
    }
  }, [showProgressModal]);

  // Alert & Desktop Notification helper
  const handleAlerts = (alertLevel, type) => {
    if (alertLevel <= 0) return;
    
    // HTML5 System Notification
    if ("Notification" in window && Notification.permission === "granted") {
      let bodyText = "";
      if (type === "plan") {
        bodyText = `Your Daily Work Plan is pending! Please submit it immediately.`;
      } else {
        bodyText = `Your 30-Minute Progress Report is due! Screen is locked until submitted.`;
      }

      new Notification("CRM strict reporting alert", {
        body: bodyText,
        requireInteraction: true, // Keep notification until user interacts with it
      });
    }

    // Trigger Email warning if Alert Level 3 is reached
    if (alertLevel === 3 && emailTriggeredType !== type) {
      api.triggerAlertEmail(type)
        .then(() => setEmailTriggeredType(type))
        .catch((e) => console.error("Error triggering alert email:", e));
    }
  };

  // Add task to today's plan draft list
  const addTodayTask = () => {
    if (!newTitle.trim() || !newDesc.trim()) {
      notify("Please fill in work title and description.", "error");
      return;
    }
    setTodayTasks([
      ...todayTasks,
      {
        work_title: newTitle,
        description: newDesc,
        count: newCount ? Number(newCount) : null,
        eta_time: newEta
      }
    ]);
    setNewTitle("");
    setNewDesc("");
    setNewCount("");
  };

  // Remove task from today's plan draft list
  const removeTodayTask = (index) => {
    setTodayTasks(todayTasks.filter((_, i) => i !== index));
  };

  // Carry Over previous task
  const carryOverTask = (task) => {
    setTodayTasks([
      ...todayTasks,
      {
        work_title: task.work_title,
        description: task.description,
        count: task.count,
        eta_time: task.eta_time
      }
    ]);
    // Remove from previous unfinished list
    setUnfinishedTasks(unfinishedTasks.filter((t) => t.id !== task.id));
    notify("Task carried over successfully!", "success");
  };

  // Ignore previous task
  const ignorePreviousTask = (taskId) => {
    setUnfinishedTasks(unfinishedTasks.filter((t) => t.id !== taskId));
  };

  // Submit Daily Plan
  const handlePlanSubmit = async () => {
    let tasksToSubmit = [...todayTasks];
    if (tasksToSubmit.length === 0) {
      if (newTitle.trim() && newDesc.trim()) {
        tasksToSubmit.push({
          work_title: newTitle,
          description: newDesc,
          count: newCount ? Number(newCount) : null,
          eta_time: newEta
        });
      } else {
        notify("Please add at least one planned task for today.", "error");
        return;
      }
    }
    try {
      await api.submitDailyPlan(tasksToSubmit);
      notify("Daily plan submitted successfully!", "success");
      setShowPlanModal(false);
      setEmailTriggeredType(null);
      // Force refresh status
      const data = await api.strictReportingStatus();
      setStatus(data);
    } catch (err) {
      notify("Failed to submit daily plan.", "error");
    }
  };

  // Submit Work Progress Report
  const handleProgressSubmit = async (e) => {
    e.preventDefault();
    if (isCustomTask && !customTaskTitle.trim()) {
      notify("Please enter custom task title.", "error");
      return;
    }
    if (!progressDesc.trim() || !nextTaskDesc.trim()) {
      notify("Please fill progress and next task descriptions.", "error");
      return;
    }
    try {
      await api.submitProgressReport({
        daily_work_plan_id: isCustomTask ? null : Number(selectedTaskId),
        custom_task_title: isCustomTask ? customTaskTitle : null,
        progress_description: progressDesc,
        next_task: nextTaskDesc
      });
      notify("Progress report submitted successfully!", "success");
      setShowProgressModal(false);
      setProgressDesc("");
      setNextTaskDesc("");
      setCustomTaskTitle("");
      setEmailTriggeredType(null);
      
      const data = await api.strictReportingStatus();
      setStatus(data);
    } catch (err) {
      notify("Failed to submit progress report.", "error");
    }
  };

  // Intercepting Logout from AppLayout
  useEffect(() => {
    const handleLogoutRequest = async () => {
      if (user.restrict_reporting) {
        onLogout();
        return;
      }
      try {
        const tasks = await api.todayDailyPlan();
        if (tasks.length > 0) {
          // Initialize logout checklist statuses
          setLogoutTasks(tasks.map(t => ({ id: t.id, work_title: t.work_title, status: "done", ongoing_remark: "" })));
          setShowLogoutModal(true);
        } else {
          onLogout();
        }
      } catch (err) {
        onLogout();
      }
    };
    
    window.addEventListener("erp:request_logout", handleLogoutRequest);
    return () => window.removeEventListener("erp:request_logout", handleLogoutRequest);
  }, [user, onLogout]);

  // Submit EOD Logout Checklist
  const handleLogoutSubmit = async () => {
    // Validate ongoing remarks
    for (const t of logoutTasks) {
      if (t.status === "ongoing" && !t.ongoing_remark.trim()) {
        notify(`Please enter a remark for ongoing task: "${t.work_title}"`, "error");
        return;
      }
    }
    try {
      await api.submitLogoutReport({ tasks: logoutTasks });
      setShowLogoutModal(false);
      onLogout();
    } catch (err) {
      notify("Failed to submit logout checklist.", "error");
    }
  };

  // Hide component if restricted or no status
  if (!user || user.restrict_reporting) return null;

  return (
    <>
      {/* 1. TODAY'S DAILY PLAN SUBMISSION MODAL (SCREEN LOCKING) */}
      {showPlanModal && (
        <div className="strict-blocker-overlay">
          <div className="strict-blocker-card">
            <header className="strict-header">
              <div className="icon-warning-pulse"><Lock size={20} /></div>
              <h2>Submit Your Today's Plan</h2>
              <p>You must outline your tasks for the day before you can access the CRM.</p>
            </header>

            {/* Carry Over Section */}
            {unfinishedTasks.length > 0 && (
              <div className="carry-over-section">
                <h3>Carried-Over Unfinished Tasks</h3>
                <div className="carry-over-list">
                  {unfinishedTasks.map((t) => (
                    <div key={t.id} className="carry-over-item">
                      <div>
                        <strong>{t.work_title}</strong>
                        <p>{t.description}</p>
                      </div>
                      <div className="carry-over-actions">
                        <button type="button" className="success small" onClick={() => carryOverTask(t)}>Carry Over</button>
                        <button type="button" className="danger small" onClick={() => ignorePreviousTask(t.id)}>Ignore</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="add-task-inline-form">
              <h3>Add Today's Tasks</h3>
              <div className="inline-grid-inputs">
                <input
                  type="text"
                  placeholder="Task Title *"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="Count / Targets (Optional)"
                  value={newCount}
                  onChange={(e) => setNewCount(e.target.value)}
                />
                <select value={newEta} onChange={(e) => setNewEta(e.target.value)}>
                  <option value="15 Mins">15 Mins</option>
                  <option value="30 Mins">30 Mins</option>
                  <option value="1 Hour">1 Hour</option>
                  <option value="2 Hours">2 Hours</option>
                  <option value="4 Hours">4 Hours</option>
                  <option value="Full Day">Full Day</option>
                </select>
              </div>
              <textarea
                placeholder="Describe what you plan to accomplish... *"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
              />
              <button type="button" className="secondary" onClick={addTodayTask}>
                <Plus size={14} /> Add to Today's List
              </button>
            </div>

            {/* List of Added Tasks */}
            {todayTasks.length > 0 && (
              <div className="added-tasks-list">
                <h3>Your Planned Tasks ({todayTasks.length})</h3>
                <div className="tasks-scroll-area">
                  {todayTasks.map((task, idx) => (
                    <div key={idx} className="added-task-item">
                      <div>
                        <strong>{task.work_title}</strong>
                        <p>{task.description}</p>
                        <small>ETA: {task.eta_time} {task.count ? `| Target: ${task.count}` : ""}</small>
                      </div>
                      <button type="button" className="icon-btn danger" onClick={() => removeTodayTask(idx)}>
                        <Trash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <footer className="strict-footer">
              <button type="button" className="primary full-width" onClick={handlePlanSubmit}>
                <CheckCircle size={16} /> Submit & Unlock CRM
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 2. 30-MINUTES WORK PROGRESS REPORT MODAL (SCREEN LOCKING) */}
      {showProgressModal && (
        <div className="strict-blocker-overlay">
          <div className="strict-blocker-card">
            <header className="strict-header">
              <div className="icon-warning-pulse"><Clock size={20} /></div>
              <h2>Work Progress Report Due!</h2>
              <p>Please log your progress report. Navigation is locked until submitted.</p>
            </header>

            <form onSubmit={handleProgressSubmit} className="strict-report-form">
              <div className="form-group">
                <label>Select Task from Today's Plan</label>
                <div className="task-select-wrapper">
                  {!isCustomTask ? (
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      disabled={todayPlanTasks.length === 0}
                    >
                      {todayPlanTasks.map((t) => (
                        <option key={t.id} value={t.id}>{t.work_title}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Enter custom task name..."
                      value={customTaskTitle}
                      onChange={(e) => setCustomTaskTitle(e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => setIsCustomTask(!isCustomTask)}
                  >
                    {isCustomTask ? "Select Planned Task" : "Add Other Task"}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>What progress did you make? *</label>
                <textarea
                  placeholder="Describe your progress, calls made, or accomplishments..."
                  value={progressDesc}
                  onChange={(e) => setProgressDesc(e.target.value)}
                  required
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>What will you work on next? *</label>
                <textarea
                  placeholder="What is your next priority task?"
                  value={nextTaskDesc}
                  onChange={(e) => setNextTaskDesc(e.target.value)}
                  required
                  rows={2}
                />
              </div>

              <button className="primary full-width">
                <CheckCircle size={16} /> Submit Progress Report
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. END-OF-DAY LOGOUT REPORT MODAL */}
      {showLogoutModal && (
        <div className="strict-blocker-overlay">
          <div className="strict-blocker-card wide">
            <header className="strict-header">
              <div className="icon-warning-pulse"><LogOut size={20} /></div>
              <h2>End-of-Day Task Checklist</h2>
              <p>Select the status and provide comments for each planned task before logging out.</p>
            </header>

            <div className="logout-checklist-table-wrapper">
              <table className="logout-checklist-table">
                <thead>
                  <tr>
                    <th>Task Name</th>
                    <th>Status</th>
                    <th>Remark (Required for Ongoing)</th>
                  </tr>
                </thead>
                <tbody>
                  {logoutTasks.map((t, idx) => (
                    <tr key={t.id}>
                      <td><strong>{t.work_title}</strong></td>
                      <td>
                        <select
                          value={t.status}
                          onChange={(e) => {
                            const updated = [...logoutTasks];
                            updated[idx].status = e.target.value;
                            setLogoutTasks(updated);
                          }}
                        >
                          <option value="done">Done</option>
                          <option value="pending">Pending</option>
                          <option value="ongoing">Ongoing</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder={t.status === "ongoing" ? "Enter ongoing details... *" : "Optional comments"}
                          value={t.ongoing_remark}
                          onChange={(e) => {
                            const updated = [...logoutTasks];
                            updated[idx].ongoing_remark = e.target.value;
                            setLogoutTasks(updated);
                          }}
                          required={t.status === "ongoing"}
                          disabled={t.status !== "ongoing"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="strict-footer split">
              <button type="button" className="secondary" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleLogoutSubmit}>
                <CheckCircle size={16} /> Submit Report & Logout
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Injecting Blocker Styles */}
      <style>{`
        .strict-blocker-overlay {
          position: fixed;
          z-index: 9999999;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(5px);
        }

        .strict-blocker-card {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: scaleUpSR 0.25s ease-out;
        }

        .strict-blocker-card.wide {
          max-width: 800px;
        }

        @keyframes scaleUpSR {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .strict-header {
          padding: 24px;
          border-bottom: 1px solid #f1f5f9;
          text-align: center;
        }

        .strict-header h2 {
          margin: 12px 0 6px 0;
          font-size: 1.25rem;
          color: #0f172a;
          font-weight: 700;
        }

        .strict-header p {
          margin: 0;
          font-size: 0.875rem;
          color: #64748b;
        }

        .icon-warning-pulse {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #fee2e2;
          color: #ef4444;
          animation: pulseSR 2s infinite;
        }

        @keyframes pulseSR {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        .carry-over-section {
          padding: 16px 24px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .carry-over-section h3 {
          margin: 0 0 10px 0;
          font-size: 0.875rem;
          color: #475569;
          font-weight: 600;
        }

        .carry-over-list {
          max-height: 120px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .carry-over-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          font-size: 0.8125rem;
        }

        .carry-over-item p {
          margin: 2px 0 0 0;
          color: #64748b;
          font-size: 0.75rem;
        }

        .carry-over-actions {
          display: flex;
          gap: 6px;
        }

        .add-task-inline-form {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }

        .add-task-inline-form h3 {
          margin: 0 0 12px 0;
          font-size: 0.9375rem;
          color: #334155;
          font-weight: 600;
        }

        .inline-grid-inputs {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .inline-grid-inputs input, .inline-grid-inputs select, .strict-report-form select, .strict-report-form input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .add-task-inline-form textarea, .strict-report-form textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 0.875rem;
          margin-bottom: 10px;
          resize: vertical;
        }

        .added-tasks-list {
          padding: 16px 24px;
          background: #fafafa;
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .added-tasks-list h3 {
          margin: 0 0 10px 0;
          font-size: 0.875rem;
          color: #475569;
          font-weight: 600;
        }

        .tasks-scroll-area {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .added-task-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
        }

        .added-task-item strong {
          display: block;
          font-size: 0.875rem;
          color: #0f172a;
        }

        .added-task-item p {
          margin: 2px 0 4px 0;
          font-size: 0.8125rem;
          color: #64748b;
        }

        .added-task-item small {
          color: #94a3b8;
          font-size: 0.75rem;
        }

        .strict-footer {
          padding: 16px 24px;
          border-top: 1px solid #f1f5f9;
          background: #f8fafc;
        }

        .strict-footer.split {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .strict-report-form {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
        }

        .task-select-wrapper {
          display: flex;
          gap: 8px;
        }

        .logout-checklist-table-wrapper {
          padding: 20px 24px;
          overflow-y: auto;
          max-height: 400px;
        }

        .logout-checklist-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .logout-checklist-table th, .logout-checklist-table td {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
        }

        .logout-checklist-table th {
          background: #f8fafc;
          font-weight: 600;
          color: #475569;
        }

        .logout-checklist-table select {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
        }

        .logout-checklist-table input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
        }

        /* Generic buttons mapping */
        .strict-blocker-overlay button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .strict-blocker-overlay button.primary {
          background: #2563eb;
          color: #ffffff;
          padding: 10px 16px;
          font-size: 0.9375rem;
        }

        .strict-blocker-overlay button.primary:hover {
          background: #1d4ed8;
        }

        .strict-blocker-overlay button.secondary {
          background: #f1f5f9;
          color: #334155;
          padding: 8px 12px;
          font-size: 0.8125rem;
        }

        .strict-blocker-overlay button.secondary:hover {
          background: #e2e8f0;
        }

        .strict-blocker-overlay button.success {
          background: #16a34a;
          color: #ffffff;
          border: none;
        }

        .strict-blocker-overlay button.danger {
          background: #ef4444;
          color: #ffffff;
          border: none;
        }

        .strict-blocker-overlay button.small {
          padding: 4px 8px;
          font-size: 0.75rem;
        }

        .strict-blocker-overlay button.full-width {
          width: 100%;
        }

        .strict-blocker-overlay button.icon-btn {
          padding: 6px;
          border-radius: 6px;
        }
      `}</style>
    </>
  );
}
