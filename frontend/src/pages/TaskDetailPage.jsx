import React, { useState, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  Save,
  X,
  MessageSquare,
  History,
  Clock,
  User,
  Calendar,
  Edit2,
  ChevronDown,
  ChevronUp,
  Hourglass,
  ArrowLeft,
  Plus,
  RefreshCw,
  Square
} from "lucide-react";
import { api } from "../api";

function parseUTCDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    let str = val.trim();
    if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) {
      return new Date(str);
    }
    if (str.includes(":")) {
      if (str.includes(" ") && !str.includes("T")) {
        str = str.replace(" ", "T");
      }
      return new Date(str + "Z");
    }
  }
  return new Date(val);
}

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function formatDateTime(val) {
  if (!val) return "-";
  const date = parseUTCDate(val);
  if (!date) return "-";
  const day = date.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // convert 0 to 12
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

function formatDateOnly(val) {
  if (!val) return "-";
  return formatDateTime(val);
}

function formatEta(hours = 0) {
  if (!hours) return "-";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getPriorityColor(p) {
  switch (p) {
    case "Low":
      return "#10b981"; // green
    case "Normal":
      return "#f59e0b"; // yellow/orange
    case "High":
      return "#ef4444"; // red
    case "Urgent":
      return "#7f1d1d"; // dark red
    default:
      return "#f59e0b";
  }
}

export function TaskDetailPage({ taskId, onBack, currentUser }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Timer States
  const [activeLog, setActiveLog] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [workType, setWorkType] = useState("Development");
  const [showStopModal, setShowStopModal] = useState(false);
  const [workDescription, setWorkDescription] = useState("");

  // Comments State
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [etaHours, setEtaHours] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [dueDateDate, setDueDateDate] = useState("");
  const [dueDateTimeHour, setDueDateTimeHour] = useState("12");
  const [dueDateTimeMinute, setDueDateTimeMinute] = useState("00");
  const [dueDateTimeAmpm, setDueDateTimeAmpm] = useState("PM");
  const [status, setStatus] = useState("TODO");

  // UI Interactive States
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    loadTask();
    loadUsers();
  }, [taskId]);

  const loadUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users", err);
    }
  };

  const loadTask = async () => {
    setLoading(true);
    try {
      const data = await api.taskDetails(taskId);
      setTask(data);

      // Seed editable states
      setTitle(data.title || "");
      setDescription(data.description || "");
      setAssignedToId(data.assigned_to_id || "");
      setPriority(data.priority || "Normal");
      setEtaHours(data.eta_hours || 0);
      setStatus(data.status || "TODO");

      if (data.due_date) {
        const d = parseUTCDate(data.due_date);
        if (d && !isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const date = String(d.getDate()).padStart(2, "0");
          setDueDateDate(`${year}-${month}-${date}`);

          let hours = d.getHours();
          const ampm = hours >= 12 ? "PM" : "AM";
          hours = hours % 12;
          hours = hours ? hours : 12;
          setDueDateTimeHour(String(hours).padStart(2, "0"));

          const minutes = d.getMinutes();
          const roundedMinutes = Math.round(minutes / 5) * 5;
          const displayMinutes = roundedMinutes >= 60 ? 55 : roundedMinutes;
          setDueDateTimeMinute(String(displayMinutes).padStart(2, "0"));
          setDueDateTimeAmpm(ampm);
          setDueDate(d.toISOString());
        } else {
          setDueDateDate("");
          setDueDateTimeHour("12");
          setDueDateTimeMinute("00");
          setDueDateTimeAmpm("PM");
          setDueDate("");
        }
      } else {
        setDueDateDate("");
        setDueDateTimeHour("12");
        setDueDateTimeMinute("00");
        setDueDateTimeAmpm("PM");
        setDueDate("");
      }

      // Check if current user has an active running timer on this task
      const active = (data.timer_logs || []).find(
        (log) => !log.end_time && currentUser && Number(log.user_id) === Number(currentUser.id)
      );
      if (active) {
        setActiveLog(active);
        const elapsed = Math.floor((Date.now() - parseUTCDate(active.start_time).getTime()) / 1000);
        setTimerSeconds(elapsed);
      } else {
        setActiveLog(null);
        setTimerSeconds(0);
      }
    } catch (err) {
      console.error("Failed to load task details", err);
    } finally {
      setLoading(false);
    }
  };

  // Timer Tick
  useEffect(() => {
    if (!activeLog) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeLog]);

  // Sync split due date components back to single dueDate state
  useEffect(() => {
    if (dueDateDate) {
      let hour24 = Number(dueDateTimeHour);
      if (dueDateTimeAmpm === "PM" && hour24 < 12) {
        hour24 += 12;
      } else if (dueDateTimeAmpm === "AM" && hour24 === 12) {
        hour24 = 0;
      }
      const timeString = `${String(hour24).padStart(2, "0")}:${dueDateTimeMinute}:00`;
      try {
        const localDate = new Date(`${dueDateDate}T${timeString}`);
        if (!isNaN(localDate.getTime())) {
          setDueDate(localDate.toISOString());
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      setDueDate("");
    }
  }, [dueDateDate, dueDateTimeHour, dueDateTimeMinute, dueDateTimeAmpm]);

  const handleStartTimer = async () => {
    try {
      const log = await api.startTaskTimer(taskId, workType);
      setActiveLog(log);
      setTimerSeconds(0);
      loadTask();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopTimer = async () => {
    try {
      await api.stopTaskTimer(taskId, workDescription, workType);
      setActiveLog(null);
      setTimerSeconds(0);
      setWorkDescription("");
      setShowStopModal(false);
      loadTask();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSidebar = async () => {
    if (!title.trim()) {
      window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Task Title is required!", type: "error" } }));
      return;
    }
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to_id: assignedToId ? Number(assignedToId) : null,
        eta_hours: Number(etaHours),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status: status,
      };
      await api.updateTask(taskId, payload);
      window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Task details updated!", type: "success" } }));
      loadTask();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await api.addTaskComment(taskId, newComment.trim());
      setNewComment("");
      loadTask();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const totalWorkedSeconds = useMemo(() => {
    if (!task || !task.timer_logs) return 0;
    return task.timer_logs.reduce((acc, log) => {
      if (log.end_time) {
        return acc + (log.duration_seconds || 0);
      }
      return acc + timerSeconds;
    }, 0);
  }, [task, timerSeconds]);

  const remainingSeconds = useMemo(() => {
    const estSeconds = (Number(etaHours) || 0) * 3600;
    return Math.max(0, estSeconds - totalWorkedSeconds);
  }, [etaHours, totalWorkedSeconds]);

  const statusProgressPercent = useMemo(() => {
    if (status === "Completed") return 100;
    if (status === "Ongoing") return 50;
    if (status === "Hold") return 25;
    return 0; // TODO
  }, [status]);

  const timeProgressPercent = useMemo(() => {
    const estSecs = (Number(etaHours) || 0) * 3600;
    if (estSecs <= 0) return 0;
    return Math.min(100, Math.round((totalWorkedSeconds / estSecs) * 100));
  }, [etaHours, totalWorkedSeconds]);

  const historyEntries = task ? (task.history_entries || []) : [];

  const timelineFiltered = useMemo(() => {
    return historyEntries.filter(
      (h) => h.action !== "timer_started" && h.action !== "timer_stopped"
    );
  }, [historyEntries]);

  const timerLogsSorted = useMemo(() => {
    const logs = task ? (task.timer_logs || []) : [];
    return [...logs].sort((a, b) => 
      parseUTCDate(a.start_time).getTime() - parseUTCDate(b.start_time).getTime()
    );
  }, [task]);

  if (loading || !task) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading task details...</div>;
  }

  const showTimer = currentUser && task && Number(currentUser.id) === Number(task.assigned_to_id);
  const isEditable = task.can_edit_details;

  // Status Dropdown mappings
  const statusOptions = [
    { value: "TODO", label: "To Do", color: "#64748b" },
    { value: "Ongoing", label: "In Progress", color: "#10b981" },
    { value: "Hold", label: "On Hold", color: "#f59e0b" },
    { value: "Completed", label: "Completed", color: "#3b82f6" },
  ];
  const currentStatusOpt = statusOptions.find((o) => o.value === status) || statusOptions[0];

  const displayedActivities = showAllActivities ? timelineFiltered : timelineFiltered.slice(-5);
  const displayedWorkHistory = showAllHistory ? timerLogsSorted : timerLogsSorted.slice(-3);

  // Helper functions for timeline icon mapping
  function getTimelineIconProps(hist) {
    const action = hist.action;
    const details = (hist.details || "").toLowerCase();

    if (action === "created") {
      return { bgColor: "#e6f4ea", iconColor: "#137333", icon: "plus" };
    } else if (action === "timer_started" || details.includes("timer started")) {
      return { bgColor: "#f3e5f5", iconColor: "#7b1fa2", icon: "play" };
    } else if (action === "timer_stopped" || details.includes("timer stopped")) {
      return { bgColor: "#fff3e0", iconColor: "#e65100", icon: "square" };
    } else if (details.includes("due date changed") || details.includes("due date updated")) {
      return { bgColor: "#e8f0fe", iconColor: "#1a73e8", icon: "calendar" };
    } else if (action === "status_changed" || details.includes("status changed")) {
      return { bgColor: "#e0f7fa", iconColor: "#00838f", icon: "refresh" };
    } else {
      return { bgColor: "#f1f3f4", iconColor: "#5f6368", icon: "edit" };
    }
  }

  function renderTimelineIcon(hist) {
    const { bgColor, iconColor, icon } = getTimelineIconProps(hist);
    const style = { backgroundColor: bgColor, color: iconColor };

    switch (icon) {
      case "plus":
        return <div className="timeline-node-icon" style={style}><Plus size={14} /></div>;
      case "play":
        return <div className="timeline-node-icon" style={style}><Play size={12} fill="currentColor" /></div>;
      case "square":
        return <div className="timeline-node-icon" style={style}><Square size={12} fill="currentColor" /></div>;
      case "calendar":
        return <div className="timeline-node-icon" style={style}><Calendar size={14} /></div>;
      case "refresh":
        return <div className="timeline-node-icon" style={style}><RefreshCw size={14} /></div>;
      default:
        return <div className="timeline-node-icon" style={style}><Edit2 size={12} /></div>;
    }
  }

  function parseWorkDetails(h) {
    const details = h.details || "";
    if (h.action === "status_changed") {
      const match = details.match(/from\s+(\w+)\s+to\s+(\w+)/i);
      if (match) {
        const fromVal = match[1] === "TODO" ? "To Do" : match[1] === "Ongoing" ? "In Progress" : match[1] === "Hold" ? "On Hold" : match[1];
        const toVal = match[2] === "TODO" ? "To Do" : match[2] === "Ongoing" ? "In Progress" : match[2] === "Hold" ? "On Hold" : match[2];
        return <span className="work-pill pill-status">{fromVal} → {toVal}</span>;
      }
      return <span className="work-pill pill-status">{details}</span>;
    }
    if (h.action === "timer_stopped") {
      const match = details.match(/Duration:\s*([^\)]+)/i);
      const durationText = match ? match[1] : details;
      return <span className="work-pill pill-timer">{durationText}</span>;
    }
    if (h.action === "timer_started") {
      const match = details.match(/work type:\s*(.+)/i);
      return <span className="work-pill pill-timer-started">{match ? match[1] : "Started"}</span>;
    }
    return <span className="work-text-details">{details}</span>;
  }

  function formatWorkAction(action) {
    switch (action) {
      case "created": return "Task Created";
      case "status_changed": return "Status Changed";
      case "timer_started": return "Timer Started";
      case "timer_stopped": return "Timer Stopped";
      default: return action;
    }
  }

  return (
    <div className="task-detail-container">
      {/* Top Header Navigation */}
      <div className="task-detail-header-nav">
        <div className="header-nav-left">
          <button type="button" onClick={onBack} className="btn-back-link">
            <ArrowLeft size={16} /> Back to Tasks
          </button>
        </div>
      </div>

      {/* Header Info and Actions Row */}
      <div className="task-detail-header-bar">
        <div className="header-info-group">
          <span className="task-id-pill">SAL-{task.id}</span>
          <div className="task-title-editor-wrapper">
            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingTitle(false);
                }}
                className="task-title-input-field"
                autoFocus
              />
            ) : (
              <div className="task-title-text-group" onClick={() => isEditable && setIsEditingTitle(true)}>
                <h1 className="task-title-label">{title}</h1>
                {isEditable && <Edit2 size={16} className="title-edit-pencil" />}
              </div>
            )}
          </div>
        </div>

        <div className="header-actions-group">
          {/* Status Dropdown */}
          <div className="custom-dropdown-container">
            <button
              type="button"
              className="status-dropdown-btn"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              <span className="status-indicator-dot" style={{ backgroundColor: currentStatusOpt.color }}></span>
              {currentStatusOpt.label}
              <ChevronDown size={14} />
            </button>
            {showStatusDropdown && (
              <div className="status-dropdown-menu">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`status-dropdown-item ${status === opt.value ? "active" : ""}`}
                    onClick={async () => {
                      setStatus(opt.value);
                      setShowStatusDropdown(false);
                      try {
                        await api.updateTask(taskId, { status: opt.value });
                        window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: `Status updated to ${opt.label}!`, type: "success" } }));
                        loadTask();
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    <span className="status-indicator-dot" style={{ backgroundColor: opt.color }}></span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Save Changes Button */}
          {isEditable && (
            <button type="button" onClick={handleSaveSidebar} className="btn-action btn-save-changes">
              <Save size={16} /> Save Changes
            </button>
          )}

          {/* Stopwatch controls */}
          {showTimer && (
            activeLog ? (
              <button type="button" className="btn-action btn-stop-timer" onClick={() => setShowStopModal(true)}>
                <Pause size={16} fill="currentColor" /> Stop Timer ({formatDuration(timerSeconds)})
              </button>
            ) : (
              <button type="button" className="btn-action btn-start-timer" onClick={handleStartTimer}>
                <Play size={16} fill="currentColor" /> Start Timer
              </button>
            )
          )}
        </div>
      </div>

      {/* 5-Column Horizontal Metadata Row */}
      <div className="metadata-metrics-row">
        <div className="metadata-metric-col">
          <span className="metric-label">Priority</span>
          <div className="metric-val-wrapper">
            <span className="priority-indicator-dot" style={{ backgroundColor: getPriorityColor(priority) }}></span>
            <span className="metric-val-text">{priority}</span>
          </div>
        </div>

        <div className="metadata-metric-col">
          <span className="metric-label">Assigned By</span>
          <div className="metric-val-wrapper">
            <User size={16} className="metric-val-icon" />
            <span className="metric-val-text">{task.created_by?.name || "System"}</span>
          </div>
        </div>

        <div className="metadata-metric-col">
          <span className="metric-label">Assigned To</span>
          <div className="metric-val-wrapper">
            <User size={16} className="metric-val-icon" />
            <span className="metric-val-text">{task.assigned_to?.name || "Unassigned"}</span>
          </div>
        </div>

        <div className="metadata-metric-col">
          <span className="metric-label">Due Date</span>
          <div className="metric-val-wrapper">
            <Calendar size={16} className="metric-val-icon" />
            <span className="metric-val-text">{formatDateOnly(dueDate)}</span>
          </div>
        </div>

        <div className="metadata-metric-col">
          <span className="metric-label">ETA</span>
          <div className="metric-val-wrapper">
            <Clock size={16} className="metric-val-icon" />
            <span className="metric-val-text">{formatEta(etaHours)}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Body */}
      <div className="task-detail-grid-layout">
        {/* Left Column */}
        <div className="task-detail-grid-left">
          {/* Description Block */}
          <div className="details-card-block">
            <h3 className="card-block-title">Description</h3>
            {isEditable ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a description for this task..."
                className="description-editor-textarea"
                rows={6}
              />
            ) : (
              <div className="description-static-view">
                {task.description || <span className="empty-text-italic">No description provided.</span>}
              </div>
            )}
          </div>



          {/* Work History Timeline Block */}
          <div className="details-card-block">
            <h3 className="card-block-title">
              <History size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
              Work History
            </h3>
            
            <div className="timeline-events-wrapper">
              {timerLogsSorted.length === 0 ? (
                <div className="empty-text-italic">No work logged yet.</div>
              ) : (
                <div className="timeline-flow-connector">
                  {displayedWorkHistory.map((log) => (
                    <div key={log.id} className="timeline-event-item">
                      <div className="timeline-node-holder">
                        <div
                          className="timeline-node-icon"
                          style={{
                            backgroundColor: log.end_time ? "#e6f4ea" : "#fff3e0",
                            color: log.end_time ? "#137333" : "#e65100"
                          }}
                        >
                          {log.end_time ? (
                            <Square size={12} fill="currentColor" />
                          ) : (
                            <Play size={12} fill="currentColor" style={{ animation: "blink 1.5s infinite" }} />
                          )}
                        </div>
                      </div>
                      <div className="timeline-item-body">
                        <div className="timeline-item-content" style={{ width: "100%" }}>
                          <div className="timeline-action-text" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", width: "100%" }}>
                            <span>Work logged by <strong>{log.user_name}</strong></span>
                            <span className={`work-pill ${log.end_time ? 'pill-timer' : 'pill-timer-started'}`}>
                              {log.end_time 
                                ? formatDuration(log.duration_seconds) 
                                : `${formatDuration(timerSeconds)} (Running...)`
                              }
                            </span>
                          </div>
                          {log.work_description && (
                            <p style={{ margin: "6px 0 4px 0", color: "#475569", fontSize: "13px", lineHeight: "1.4" }}>
                              {log.work_description}
                            </p>
                          )}
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                            <strong>Start:</strong> {formatDateTime(log.start_time)} | <strong>End:</strong> {log.end_time ? formatDateTime(log.end_time) : "Active Now"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {timerLogsSorted.length > 3 && (
              <div className="timeline-expander-row">
                <button
                  type="button"
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="btn-expander-toggle"
                >
                  {showAllHistory ? (
                    <>View Less History <ChevronUp size={14} /></>
                  ) : (
                    <>View All History <ChevronDown size={14} /></>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Activity Timeline Block */}
          <div className="details-card-block">
            <h3 className="card-block-title">
              <History size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
              Activity Timeline
            </h3>
            
            <div className="timeline-events-wrapper">
              {timelineFiltered.length === 0 ? (
                <div className="empty-text-italic">No activities logged.</div>
              ) : (
                <div className="timeline-flow-connector">
                  {displayedActivities.map((hist) => (
                    <div key={hist.id} className="timeline-event-item">
                      <div className="timeline-node-holder">
                        {renderTimelineIcon(hist)}
                      </div>
                      <div className="timeline-item-body">
                        <div className="timeline-item-content">
                          <span className="timeline-action-text">
                            {hist.details || formatWorkAction(hist.action)}
                          </span>
                          <span className="timeline-user-author">{hist.user_name || "System"}</span>
                        </div>
                        <div className="timeline-item-timestamp">
                          {formatDateTime(hist.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {timelineFiltered.length > 5 && (
              <div className="timeline-expander-row">
                <button
                  type="button"
                  onClick={() => setShowAllActivities(!showAllActivities)}
                  className="btn-expander-toggle"
                >
                  {showAllActivities ? (
                    <>View Less Activities <ChevronUp size={14} /></>
                  ) : (
                    <>View All Activities <ChevronDown size={14} /></>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Sidebar) */}
        <div className="task-detail-grid-right">
          {/* Time Summary Widget */}
          <div className="details-card-block">
            <h3 className="card-block-title">Time Summary</h3>
            <div className="details-vertical-table">
              <div className="details-table-row">
                <span className="table-row-label">Estimated Time</span>
                <span className="table-row-value font-bold">{formatEta(etaHours)}</span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Time Worked</span>
                <span className="table-row-value font-bold text-success">{formatDuration(totalWorkedSeconds)}</span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Remaining Time</span>
                <span className="table-row-value font-bold">{formatDuration(remainingSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Task Details Widget */}
          <div className="details-card-block">
            <h3 className="card-block-title">Task Details</h3>
            <div className="details-vertical-table">
              <div className="details-table-row">
                <span className="table-row-label">Created By</span>
                <span className="table-row-value font-bold">{task.created_by?.name || "System"}</span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Created On</span>
                <span className="table-row-value">{formatDateTime(task.created_at)}</span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Start Date</span>
                <span className="table-row-value">{formatDateTime(task.created_at)}</span>
              </div>
              <div className="details-table-row" style={{ alignItems: "flex-start" }}>
                <span className="table-row-label" style={{ paddingTop: "6px" }}>Due Date</span>
                <span className="table-row-value flex-align-center">
                  {isEditable ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "180px" }}>
                      <div className="relative-input-wrapper" style={{ width: "100%" }}>
                        <input
                          type="date"
                          value={dueDateDate}
                          onChange={(e) => setDueDateDate(e.target.value)}
                          className="details-table-input"
                          style={{ width: "100%", paddingRight: "8px" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "4px", width: "100%" }}>
                        <select
                          value={dueDateTimeHour}
                          onChange={(e) => setDueDateTimeHour(e.target.value)}
                          className="details-table-select"
                          style={{ flex: 1, padding: "4px", minWidth: "0", width: "auto" }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                            <option key={h} value={String(h).padStart(2, "0")}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={dueDateTimeMinute}
                          onChange={(e) => setDueDateTimeMinute(e.target.value)}
                          className="details-table-select"
                          style={{ flex: 1, padding: "4px", minWidth: "0", width: "auto" }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
                            const mStr = String(m).padStart(2, "0");
                            return <option key={m} value={mStr}>{mStr}</option>;
                          })}
                        </select>
                        <select
                          value={dueDateTimeAmpm}
                          onChange={(e) => setDueDateTimeAmpm(e.target.value)}
                          className="details-table-select"
                          style={{ flex: 1, padding: "4px", minWidth: "0", width: "auto" }}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    formatDateTime(dueDate)
                  )}
                </span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Priority</span>
                <span className="table-row-value">
                  {isEditable ? (
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="details-table-select"
                    >
                      <option value="Low">Low</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  ) : (
                    <div className="flex-align-center">
                      <span className="priority-indicator-dot" style={{ backgroundColor: getPriorityColor(priority) }}></span>
                      {priority}
                    </div>
                  )}
                </span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">ETA (Hours)</span>
                <span className="table-row-value">
                  {isEditable ? (
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={etaHours}
                      onChange={(e) => setEtaHours(e.target.value)}
                      className="details-table-input number-input"
                    />
                  ) : (
                    formatEta(etaHours)
                  )}
                </span>
              </div>
              <div className="details-table-row">
                <span className="table-row-label">Last Updated</span>
                <span className="table-row-value">{formatDateTime(task.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Comments & Discussion */}
          <div className="details-card-block">
            <h3 className="card-block-title">
              <MessageSquare size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
              Comments & Discussion
            </h3>
            
            <form onSubmit={handleAddComment} className="comment-post-form">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment or mention someone..."
                required
                rows={3}
                className="comment-form-textarea"
              />
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim()}
                className="btn-comment-submit"
              >
                {submittingComment ? "Submitting..." : "Add Comment"}
              </button>
            </form>

            <div className="comments-history-feed">
              {(task.comments || []).length > 0 && (
                <div className="comments-bubbles-list">
                  {(task.comments || []).map((c) => (
                    <div key={c.id} className="comment-speech-bubble">
                      <div className="comment-bubble-meta">
                        <span className="comment-bubble-author">{c.user_name}</span>
                        <span className="comment-bubble-time">{formatDateTime(c.created_at)}</span>
                      </div>
                      <p className="comment-bubble-text">{c.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stop Timer Description Modal */}
      {showStopModal && (
        <div className="timer-modal-backdrop">
          <div className="timer-modal-container">
            <h3 className="timer-modal-title">Log Work Details</h3>
            <div className="timer-modal-body">
              <label className="timer-modal-label">Work Done Description</label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={4}
                className="timer-modal-textarea"
                required
              />
            </div>
            <div className="timer-modal-footer">
              <button type="button" onClick={() => setShowStopModal(false)} className="btn-modal-cancel">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStopTimer}
                disabled={!workDescription.trim()}
                className="btn-modal-submit"
              >
                Log Time & Pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Overhauled CSS styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        .task-detail-container {
          padding: 24px;
          background-color: #f8fafc;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #334155;
        }

        /* Top Header Nav */
        .task-detail-header-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .btn-back-link {
          background: none;
          border: none;
          color: #176b5b;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .btn-back-link:hover {
          background-color: #f1f5f9;
        }
        .alert-bell-wrapper {
          width: 32px;
          height: 32px;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .bell-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 8px;
          height: 8px;
          background-color: #ef4444;
          border-radius: 50%;
          border: 1px solid #ffffff;
        }

        /* Header Info & Actions */
        .task-detail-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
        }
        .header-info-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .task-id-pill {
          background-color: #e2f0ed;
          color: #176b5b;
          font-size: 14px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid #bce1da;
          white-space: nowrap;
        }
        .task-title-editor-wrapper {
          flex: 1;
        }
        .task-title-text-group {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .task-title-label {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .title-edit-pencil {
          color: #94a3b8;
          opacity: 0.7;
          transition: opacity 0.2s, color 0.2s;
        }
        .task-title-text-group:hover .title-edit-pencil {
          opacity: 1;
          color: #176b5b;
        }
        .task-title-input-field {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 8px;
          width: 100%;
          outline: none;
          background-color: #ffffff;
        }
        .task-title-input-field:focus {
          border-color: #176b5b;
          box-shadow: 0 0 0 2px rgba(23, 107, 91, 0.1);
        }

        .header-actions-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Custom Status Dropdown */
        .custom-dropdown-container {
          position: relative;
        }
        .status-dropdown-btn {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          transition: background-color 0.2s, border-color 0.2s;
        }
        .status-dropdown-btn:hover {
          background-color: #f8fafc;
          border-color: #94a3b8;
        }
        .status-indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .status-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
          z-index: 50;
          min-width: 150px;
          padding: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .status-dropdown-item {
          background: none;
          border: none;
          padding: 8px 12px;
          font-size: 13px;
          color: #334155;
          text-align: left;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background-color 0.15s;
        }
        .status-dropdown-item:hover {
          background-color: #f1f5f9;
        }
        .status-dropdown-item.active {
          background-color: #f1f5f9;
          font-weight: 600;
        }

        .btn-action {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .btn-save-changes {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
        }
        .btn-save-changes:hover {
          background-color: #f8fafc;
          border-color: #94a3b8;
        }
        .btn-start-timer {
          background-color: #176b5b;
          border: 1px solid #125447;
          color: #ffffff;
        }
        .btn-start-timer:hover {
          background-color: #125447;
        }
        .btn-stop-timer {
          background-color: #7f1d1d;
          border: 1px solid #991b1b;
          color: #ffffff;
        }
        .btn-stop-timer:hover {
          background-color: #991b1b;
        }

        /* 5-Column Metadata metrics row */
        .metadata-metrics-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          margin-bottom: 24px;
          padding: 16px 0;
        }
        .metadata-metric-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 0 24px;
          border-right: 1px solid #e2e8f0;
        }
        .metadata-metric-col:last-child {
          border-right: none;
        }
        .metric-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .metric-val-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #1e293b;
          font-size: 14px;
          font-weight: 600;
        }
        .priority-indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .metric-val-icon {
          color: #64748b;
        }

        /* Grid layouts */
        .task-detail-grid-layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 24px;
          align-items: start;
        }
        .task-detail-grid-left {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .task-detail-grid-right {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .details-card-block {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .card-block-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
        }

        /* Description block */
        .description-editor-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 12px;
          font-size: 14px;
          color: #334155;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }
        .description-editor-textarea:focus {
          border-color: #176b5b;
          box-shadow: 0 0 0 2px rgba(23, 107, 91, 0.1);
        }
        .description-static-view {
          font-size: 14px;
          line-height: 1.6;
          color: #334155;
          white-space: pre-wrap;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
        }
        .empty-text-italic {
          font-style: italic;
          color: #94a3b8;
          font-size: 13px;
        }

        /* Time Summary block */
        .time-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .time-summary-widget {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .summary-widget-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .summary-widget-val-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .summary-icon-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .summary-icon-circle.bg-muted {
          background-color: #e2e8f0;
          color: #475569;
        }
        .summary-icon-circle.bg-success {
          background-color: #d1fae5;
          color: #065f46;
        }
        .summary-icon-circle.bg-warning {
          background-color: #fef3c7;
          color: #92400e;
        }
        .summary-widget-val-text {
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
        }
        .text-success {
          color: #059669 !important;
        }
        .progress-gauge-row {
          gap: 12px !important;
        }
        .progress-gauge-indicator {
          display: flex;
          align-items: center;
        }
        .circular-progress-svg {
          transform: rotate(-90deg);
        }
        .circle-bg-track {
          stroke: #e2e8f0;
        }
        .circle-progress-filled {
          stroke: #176b5b;
          transition: stroke-dasharray 0.3s ease;
        }
        .progress-percentages-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pct-title {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
        }
        .pct-subtitle {
          font-size: 12px;
          color: #64748b;
        }

        /* Activity Timeline */
        .timeline-events-wrapper {
          position: relative;
          padding-left: 8px;
          margin-top: 12px;
        }
        .timeline-flow-connector {
          position: relative;
        }
        .timeline-flow-connector::before {
          content: "";
          position: absolute;
          left: 16px;
          top: 10px;
          bottom: 10px;
          width: 2px;
          background-color: #e2e8f0;
        }
        .timeline-event-item {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
          position: relative;
        }
        .timeline-event-item:last-child {
          margin-bottom: 0;
        }
        .timeline-node-holder {
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .timeline-node-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .timeline-item-body {
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background-color: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 12px;
        }
        .timeline-item-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .timeline-action-text {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }
        .timeline-user-author {
          font-size: 12px;
          color: #64748b;
        }
        .timeline-item-timestamp {
          font-size: 11px;
          color: #94a3b8;
          white-space: nowrap;
        }
        .timeline-expander-row {
          display: flex;
          justify-content: center;
          margin-top: 16px;
          border-top: 1px solid #f1f5f9;
          padding-top: 12px;
        }
        .btn-expander-toggle {
          background: none;
          border: none;
          color: #176b5b;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 4px;
        }
        .btn-expander-toggle:hover {
          background-color: #f8fafc;
        }

        /* Sidebar Task Details Widget */
        .details-vertical-table {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .details-table-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .details-table-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .table-row-label {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }
        .table-row-value {
          font-size: 13px;
          color: #1e293b;
          font-weight: 600;
          text-align: right;
        }
        .flex-align-center {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .relative-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .details-table-input {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 28px 6px 8px;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          width: 170px;
          outline: none;
          box-sizing: border-box;
        }
        .details-table-input:focus {
          border-color: #176b5b;
        }
        .input-calendar-picker-icon {
          position: absolute;
          right: 8px;
          color: #64748b;
          pointer-events: none;
        }
        .details-table-select {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          width: 120px;
          outline: none;
          background-color: #ffffff;
          cursor: pointer;
        }
        .details-table-select:focus {
          border-color: #176b5b;
        }
        .number-input {
          padding-right: 8px !important;
          width: 80px !important;
          text-align: right;
        }

        /* Comments Block */
        .comment-post-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .comment-form-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }
        .comment-form-textarea:focus {
          border-color: #176b5b;
          box-shadow: 0 0 0 2px rgba(23, 107, 91, 0.1);
        }
        .btn-comment-submit {
          align-self: flex-end;
          background-color: #176b5b;
          border: none;
          color: #ffffff;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .btn-comment-submit:hover:not(:disabled) {
          background-color: #125447;
        }
        .btn-comment-submit:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }
        .comments-history-feed {
          max-height: 280px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .comments-bubbles-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .comment-speech-bubble {
          background-color: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 8px;
          padding: 12px;
        }
        .comment-bubble-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .comment-bubble-author {
          font-size: 12px;
          font-weight: 700;
          color: #1e293b;
        }
        .comment-bubble-time {
          font-size: 10px;
          color: #94a3b8;
        }
        .comment-bubble-text {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #475569;
        }

        /* Work History block */
        .work-history-table-container {
          overflow-x: auto;
        }
        .work-history-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: left;
        }
        .work-history-table th {
          color: #64748b;
          font-weight: 600;
          padding: 8px 6px;
          border-bottom: 1px solid #e2e8f0;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
        }
        .work-history-table td {
          padding: 10px 6px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .work-history-table tr:last-child td {
          border-bottom: none;
        }
        .work-pill {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          white-space: nowrap;
        }
        .pill-status {
          background-color: #e0f2fe;
          color: #0369a1;
        }
        .pill-timer {
          background-color: #d1fae5;
          color: #065f46;
        }
        .pill-timer-started {
          background-color: #f3e5f5;
          color: #7b1fa2;
        }
        .work-text-details {
          color: #475569;
        }
        .work-history-expander-row {
          display: flex;
          justify-content: center;
          margin-top: 10px;
          border-top: 1px solid #f1f5f9;
          padding-top: 8px;
        }

        /* Timer Description Modal overlay */
        .timer-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .timer-modal-container {
          background-color: #ffffff;
          border-radius: 12px;
          width: 440px;
          padding: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .timer-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
        }
        .timer-modal-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 20px;
        }
        .timer-modal-label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .timer-modal-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          resize: none;
          outline: none;
          box-sizing: border-box;
        }
        .timer-modal-textarea:focus {
          border-color: #176b5b;
        }
        .timer-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .btn-modal-cancel {
          background: none;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }
        .btn-modal-cancel:hover {
          background-color: #f8fafc;
        }
        .btn-modal-submit {
          background-color: #176b5b;
          border: none;
          border-radius: 6px;
          color: #ffffff;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-modal-submit:hover:not(:disabled) {
          background-color: #125447;
        }
        .btn-modal-submit:disabled {
          background-color: #cbd5e1;
          cursor: not-allowed;
        }
      ` }} />
    </div>
  );
}
