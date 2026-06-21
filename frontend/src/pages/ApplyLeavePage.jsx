import React, { useEffect, useState } from "react";
import { ArrowLeft, Upload, Check, Calendar, X, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export function ApplyLeavePage({ setPage, editingId, setEditingId }) {
  const { user: currentUser } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvers, setApprovers] = useState([]);

  // Calendar states
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(today));
  const [calendarView, setCalendarView] = useState("Month"); // Month, Week, List
  const [selectedDates, setSelectedDates] = useState({});
  const [calculatedDays, setCalculatedDays] = useState(0);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Helper to get Monday of the week for a given date
  function getWeekStart(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  const [myLeaves, setMyLeaves] = useState([]);

  // Fetch user's leaves on mount or target user change to support cross-request sandwich calculations
  useEffect(() => {
    api.myLeaves(targetUserId || undefined)
      .then((data) => {
        setMyLeaves(data || []);
      })
      .catch((err) => console.error(err));
  }, [targetUserId]);

  // Fetch leave details on mount if editingId is set
  useEffect(() => {
    if (editingId) {
      api.leaveDetails(editingId)
        .then((data) => {
          setTitle(data.title);
          setDescription(data.description);
          if (data.attachment) {
            setAttachment(data.attachment);
            setAttachmentName(data.attachment.split("/").pop());
          }
          if (data.half_day_details) {
            try {
              setSelectedDates(JSON.parse(data.half_day_details));
            } catch (e) {
              console.error(e);
            }
          } else {
            // Fallback: build selectedDates map from range and half_day flags
            const datesMap = {};
            let curr = new Date(data.from_date);
            const end = new Date(data.to_date);
            while (curr <= end) {
              const yStr = curr.getFullYear();
              const mStr = String(curr.getMonth() + 1).padStart(2, '0');
              const dStr = String(curr.getDate()).padStart(2, '0');
              const dateStr = `${yStr}-${mStr}-${dStr}`;
              if (curr.getDay() !== 0) { // Skip Sunday
                let type = "Full Day";
                if (dateStr === data.from_date && data.start_half_day) {
                  type = "First Half"; // default
                } else if (dateStr === data.to_date && data.end_half_day) {
                  type = "First Half"; // default
                }
                if (data.leave_type === "Half Day") {
                  type = data.half_day_type || "First Half";
                }
                datesMap[dateStr] = type;
              }
              curr.setDate(curr.getDate() + 1);
            }
            setSelectedDates(datesMap);
          }
          if (data.approvals) {
            setApprovers(data.approvals);
          }
          if (data.user_id) {
            setTargetUserId(data.user_id);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [editingId]);

  // Fetch predicted approvers if not editing, whenever target user changes
  useEffect(() => {
    if (!editingId) {
      api.myApprovers(targetUserId || undefined)
        .then((data) => {
          const mapped = data.map((appr) => ({
            id: appr.id,
            approver_name: appr.name,
            approver_role: appr.role_name,
            status: "Pending",
          }));
          setApprovers(mapped);
        })
        .catch((err) => console.error(err));
    }
  }, [editingId, targetUserId]);

  // Fetch active users list for behalf-of dropdown if user has leave.manage permission
  useEffect(() => {
    if (currentUser?.permissions?.includes("leave.manage")) {
      api.users()
        .then((data) => {
          const activeUsers = (data || []).filter((u) => u.is_active && u.id !== currentUser.id);
          setUsersList(activeUsers);
        })
        .catch((err) => console.error(err));
    }
  }, [currentUser]);

  const getExistingLeavesForDate = (dateStr) => {
    const list = [];
    const [y, m, d] = dateStr.split("-");
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const isSunday = dateObj.getDay() === 0;

    for (const leave of myLeaves) {
      if (leave.status === "Rejected" || leave.status === "Cancelled") continue;
      if (editingId && leave.id === Number(editingId)) continue;

      if (dateStr >= leave.from_date && dateStr <= leave.to_date) {
        // If Sunday, only count if explicitly part of details
        if (isSunday) {
          if (leave.half_day_details) {
            try {
              const details = JSON.parse(leave.half_day_details);
              if (details[dateStr] && details[dateStr] !== "No Leave" && details[dateStr] !== "Week Off") {
                list.push({ type: details[dateStr], status: leave.status, leave });
              }
            } catch (e) { }
          }
          continue;
        }

        if (leave.half_day_details) {
          try {
            const details = JSON.parse(leave.half_day_details);
            if (details[dateStr]) {
              if (details[dateStr] !== "No Leave" && details[dateStr] !== "Week Off") {
                list.push({ type: details[dateStr], status: leave.status, leave });
              }
              continue;
            }
          } catch (e) { }
        }

        // Fallback logic
        const isFromDate = dateStr === leave.from_date;
        const isToDate = dateStr === leave.to_date;
        let type = "Full Day";
        if (isFromDate && leave.start_half_day) {
          type = "First Half";
        } else if (isToDate && leave.end_half_day) {
          type = "First Half";
        }
        if (leave.leave_type === "Half Day") {
          type = leave.half_day_type || "First Half";
        }
        list.push({ type, status: leave.status, leave });
      }
    }
    return list;
  };

  const getCellState = (dateStr) => {
    const existing = getExistingLeavesForDate(dateStr);
    const selected = selectedDates[dateStr]; // from current request

    // Existing leave statuses
    const isApproved = existing.some(e => e.status === "Approved");
    const isPending = existing.some(e => e.status === "Pending");

    // Existing types
    const existingTypes = existing.map(e => e.type);

    // Determine allowed types
    let allowedTypes = ["Full Day", "First Half", "Second Half"];
    const d = new Date(dateStr);
    const isSunday = d.getDay() === 0;

    if (isSunday) {
      allowedTypes = [];
    } else if (existingTypes.includes("Full Day")) {
      allowedTypes = [];
    } else {
      if (existingTypes.includes("First Half") || existingTypes.includes("Half Day")) {
        allowedTypes = ["Second Half"];
      } else if (existingTypes.includes("Second Half")) {
        allowedTypes = ["First Half"];
      }
    }

    const isFullyBooked = allowedTypes.length === 0;

    // Background style
    let leftSide = null; // null, "selected", "approved", "pending"
    let rightSide = null; // null, "selected", "approved", "pending"

    if (existingTypes.includes("Full Day")) {
      const status = existing.find(e => e.type === "Full Day")?.status || "Pending";
      leftSide = status.toLowerCase();
      rightSide = status.toLowerCase();
    }
    if (existingTypes.includes("First Half") || existingTypes.includes("Half Day")) {
      const status = existing.find(e => e.type === "First Half" || e.type === "Half Day")?.status || "Pending";
      leftSide = status.toLowerCase();
    }
    if (existingTypes.includes("Second Half")) {
      const status = existing.find(e => e.type === "Second Half")?.status || "Pending";
      rightSide = status.toLowerCase();
    }

    if (selected === "Full Day") {
      leftSide = "selected";
      rightSide = "selected";
    } else if (selected === "First Half") {
      leftSide = "selected";
    } else if (selected === "Second Half") {
      rightSide = "selected";
    }

    // Colors mapping
    const getColor = (sideState) => {
      if (sideState === "selected") return "#e6f4f1";
      if (sideState === "approved") return "#cbd5e1"; // slate/grey
      if (sideState === "pending") return "#fed7aa"; // light orange/amber
      return "#ffffff";
    };

    const leftColor = getColor(leftSide);
    const rightColor = getColor(rightSide);

    let background = "";
    if (leftColor !== "#ffffff" || rightColor !== "#ffffff") {
      background = `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%)`;
    }

    return {
      existing,
      selected,
      isApproved,
      isPending,
      isFullyBooked,
      allowedTypes,
      background,
      leftSide,
      rightSide
    };
  };

  const isDateALeave = (dateStr) => {
    // 1. Check if selected in current request
    if (selectedDates[dateStr]) {
      return selectedDates[dateStr] !== "No Leave";
    }

    // 2. Check if selected in already submitted leaves
    const targetDateObj = new Date(dateStr);
    return myLeaves.some((leave) => {
      if (leave.status === "Rejected" || leave.status === "Cancelled") return false;
      if (editingId && leave.id === Number(editingId)) return false;
      const start = new Date(leave.from_date);
      const end = new Date(leave.to_date);
      if (targetDateObj >= start && targetDateObj <= end) {
        if (targetDateObj.getDay() === 0) {
          if (leave.half_day_details) {
            try {
              const details = JSON.parse(leave.half_day_details);
              return details[dateStr] && details[dateStr] !== "No Leave";
            } catch (e) { }
            return false;
          }
          return false;
        }
        return true;
      }
      return false;
    });
  };

  // Calculate dynamic leave duration (with sandwich leave rules)
  useEffect(() => {
    let total = 0;

    // Sum up selected dates
    Object.values(selectedDates).forEach((val) => {
      if (val === "Full Day") total += 1.0;
      else if (val === "First Half" || val === "Second Half") total += 0.5;
    });

    const addSandwichDay = (sunStr) => {
      const currentVal = selectedDates[sunStr];
      if (!currentVal || currentVal === "No Leave") return 1.0;
      if (currentVal === "First Half" || currentVal === "Second Half") return 0.5;
      return 0.0;
    };

    const dates = Object.keys(selectedDates).sort();
    if (dates.length > 0) {
      const firstDateStr = dates[0];
      const lastDateStr = dates[dates.length - 1];

      const firstDate = new Date(firstDateStr);
      const lastDate = new Date(lastDateStr);

      // Check adjacent Sunday before selection range (Monday start)
      if (firstDate.getDay() === 1) {
        const sunday = new Date(firstDate);
        sunday.setDate(firstDate.getDate() - 1);
        const saturday = new Date(firstDate);
        saturday.setDate(firstDate.getDate() - 2);

        const sunStr = sunday.toISOString().split('T')[0];
        const satStr = saturday.toISOString().split('T')[0];

        if (isDateALeave(satStr) && !selectedDates[sunStr]) {
          total += addSandwichDay(sunStr);
        }
      }

      // Check adjacent Sunday after selection range (Saturday end)
      if (lastDate.getDay() === 6) {
        const sunday = new Date(lastDate);
        sunday.setDate(lastDate.getDate() + 1);
        const monday = new Date(lastDate);
        monday.setDate(lastDate.getDate() + 2);

        const sunStr = sunday.toISOString().split('T')[0];
        const monStr = monday.toISOString().split('T')[0];

        if (isDateALeave(monStr) && !selectedDates[sunStr]) {
          total += addSandwichDay(sunStr);
        }
      }

      // Check internal Sundays in selection range
      let curr = new Date(firstDate);
      while (curr < lastDate) {
        curr.setDate(curr.getDate() + 1);
        if (curr.getDay() === 0) { // Sunday
          const sunStr = curr.toISOString().split('T')[0];
          const sat = new Date(curr);
          sat.setDate(curr.getDate() - 1);
          const mon = new Date(curr);
          mon.setDate(curr.getDate() + 1);

          const satStr = sat.toISOString().split('T')[0];
          const monStr = mon.toISOString().split('T')[0];

          if (isDateALeave(satStr) && isDateALeave(monStr)) {
            total += addSandwichDay(sunStr);
          }
        }
      }
    }

    setCalculatedDays(total);
  }, [selectedDates, myLeaves]);

  // Navigate calendar months/weeks
  const handlePrev = () => {
    if (calendarView === "Week") {
      setCurrentWeekStart((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() - 7);
        // Sync month/year labels if week boundary crosses
        setCurrentMonth(next.getMonth());
        setCurrentYear(next.getFullYear());
        return next;
      });
    } else {
      setCurrentMonth((prev) => {
        if (prev === 0) {
          setCurrentYear((y) => y - 1);
          return 11;
        }
        return prev - 1;
      });
    }
  };

  const handleNext = () => {
    if (calendarView === "Week") {
      setCurrentWeekStart((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + 7);
        setCurrentMonth(next.getMonth());
        setCurrentYear(next.getFullYear());
        return next;
      });
    } else {
      setCurrentMonth((prev) => {
        if (prev === 11) {
          setCurrentYear((y) => y + 1);
          return 0;
        }
        return prev + 1;
      });
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setCurrentWeekStart(getWeekStart(now));
  };

  // Generate days in month grid
  const getDaysInMonth = (year, month) => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    const days = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthTotalDays - i,
        month: month === 0 ? 11 : month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true
      });
    }

    // Next month padding (total 42 cells)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        month: month === 11 ? 0 : month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false
      });
    }

    return days;
  };

  // Generate days for week view
  const getDaysInWeek = (startDate) => {
    const days = [];
    const curr = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  };

  // Date selection click handler
  const handleDateClick = (day, month, year) => {
    const yStr = String(year);
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    const state = getCellState(dateStr);
    if (state.isFullyBooked) {
      return; // disabled/unclickable
    }

    setSelectedDates((prev) => {
      const next = { ...prev };
      const currentSelection = next[dateStr];

      const cycle = [undefined, ...state.allowedTypes];
      const currentIndex = cycle.indexOf(currentSelection);

      const nextIndex = (currentIndex + 1) % cycle.length;
      const nextSelection = cycle[nextIndex];

      if (nextSelection === undefined) {
        delete next[dateStr];
      } else {
        next[dateStr] = nextSelection;
      }
      return next;
    });
  };

  const handleRemoveDate = (dateStr) => {
    setSelectedDates((prev) => {
      const next = { ...prev };
      delete next[dateStr];
      return next;
    });
  };

  const handleReset = () => {
    setTitle("");
    setDescription("");
    setAttachment("");
    setAttachmentName("");
    setSelectedDates({});
    if (!editingId) {
      setTargetUserId("");
    }
  };

  // File Upload Handlers
  const uploadFile = async (file) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.uploadLeaveAttachment(formData);
      setAttachment(res.filename);
      setAttachmentName(file.name);
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: "File uploaded successfully!", type: "success" }
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const dates = Object.keys(selectedDates);
    if (dates.length === 0) {
      window.dispatchEvent(new CustomEvent("erp:notify", {
        detail: { message: "Please select at least one leave date on the calendar.", type: "error" }
      }));
      return;
    }

    setSubmitting(true);
    const sortedDates = dates.sort();
    const fromDate = sortedDates[0];
    const toDate = sortedDates[sortedDates.length - 1];

    const startIsHalf = selectedDates[fromDate] === "First Half" || selectedDates[fromDate] === "Second Half";
    const endIsHalf = selectedDates[toDate] === "First Half" || selectedDates[toDate] === "Second Half";

    const payload = {
      title,
      leave_type: dates.length === 1 && selectedDates[fromDate] !== "Full Day" ? "Half Day" : "Full Day",
      half_day_type: dates.length === 1 && selectedDates[fromDate] !== "Full Day" ? selectedDates[fromDate] : null,
      from_date: fromDate,
      to_date: toDate,
      description,
      attachment: attachment || null,
      start_half_day: startIsHalf,
      end_half_day: endIsHalf,
      half_day_details: JSON.stringify(selectedDates),
      user_id: targetUserId ? Number(targetUserId) : null
    };

    try {
      if (editingId) {
        await api.updateLeave(editingId, payload);
        window.dispatchEvent(new CustomEvent("erp:notify", {
          detail: { message: "Leave request updated successfully!", type: "success" }
        }));
      } else {
        await api.applyLeave(payload);
        window.dispatchEvent(new CustomEvent("erp:notify", {
          detail: { message: "Leave application submitted successfully!", type: "success" }
        }));
      }
      if (setEditingId) setEditingId(null);
      setPage("leave-my");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper formatting for chips
  const formatChipText = (dateStr) => {
    const [y, m, d] = dateStr.split("-");
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString("en-US", { month: "short" });
    const year = dateObj.getFullYear();
    const type = selectedDates[dateStr];
    return `${day} ${month} ${year} (${type})`;
  };

  // Helper formatting for duration description subtext
  const getDurationSubtext = () => {
    return Object.keys(selectedDates).sort().map((dateStr) => {
      const [_, m, d] = dateStr.split("-");
      const monthName = new Date(2000, Number(m) - 1, 1).toLocaleString("en-US", { month: "short" });
      return `${Number(d)} ${monthName} - ${selectedDates[dateStr]}`;
    }).join(" + ");
  };

  return (
    <div className="apply-leave-container">
      {/* Back Button */}
      <div className="back-nav">
        <button className="back-btn" onClick={() => { if (setEditingId) setEditingId(null); setPage("leave-my"); }}>
          <ArrowLeft size={16} /> Back to My Leaves
        </button>
      </div>

      <div className="apply-leave-header">
        <h2>{editingId ? "Edit Leave Request" : "Apply for Leave"}</h2>
        <p>{editingId ? "Modify your leave details and select your dates" : "Fill in the details and select your leave dates"}</p>
      </div>

      <div className="apply-leave-main-grid">
        {/* Left Form Details Column */}
        <div className="form-card">
          <div className="section-title">1. Leave Details</div>

          <form onSubmit={handleSubmit}>
            {/* Date selection tags chips input */}

            {currentUser?.permissions?.includes("leave.manage") && (
              <div className="form-group">
                <label>Apply on Behalf of (User)</label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  disabled={!!editingId}
                >
                  <option value="">-- Apply for Myself ({currentUser.name}) --</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                {editingId && (
                  <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    Target applicant user cannot be modified during edit mode.
                  </span>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Date(s) *</label>
              <div className="chips-input-container">
                <div className="chips-wrapper">
                  <Calendar size={16} className="text-teal" />
                  {Object.keys(selectedDates).length === 0 ? (
                    <span className="chips-placeholder">Select leave dates from the calendar</span>
                  ) : (
                    Object.keys(selectedDates).sort().map((dateStr) => (
                      <span key={dateStr} className="date-chip">
                        {formatChipText(dateStr)}
                        <button
                          type="button"
                          className="chip-remove"
                          onClick={() => handleRemoveDate(dateStr)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="dropdown-arrow-indicator">&#9662;</div>
              </div>
            </div>

            {calculatedDays > 0 && (
              <div className="duration-alert-box">
                <div className="alert-badge">
                  <Check size={14} strokeWidth={3} />
                </div>
                <div className="alert-content">
                  <span className="alert-title">Total Duration: {calculatedDays} Days</span>
                  <span className="alert-subtitle">({getDurationSubtext()})</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Subject / Title *</label>
              <input
                type="text"
                placeholder="e.g. Family emergency, personal work, medical checkup"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group relative">
              <label>Reason / Description *</label>
              <textarea
                placeholder="Please provide a brief reason for your leave..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                required
              />
              <span className="textarea-char-counter">{description.length}/500</span>
            </div>

            <div className="form-group">
              <label>Attachment (Optional)</label>
              <div
                className="dropzone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="dropzone-file-upload"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
                <label htmlFor="dropzone-file-upload" className="dropzone-label">
                  <div className="upload-circle">
                    <Upload size={20} className="text-teal" />
                  </div>
                  <span className="dropzone-text">
                    {uploading ? "Uploading attachment..." : attachmentName ? attachmentName : "Drag and drop a file here, or click to browse"}
                  </span>
                  <span className="dropzone-subtext">PDF, JPG, PNG up to 5MB</span>
                </label>
              </div>
            </div>

            {approvers.length > 0 && (
              <div className="form-group">
                <label>Approval Flow / Approvers Hierarchy</label>
                <div className="approvers-timeline" style={{ marginTop: "8px" }}>
                  {approvers.map((app, idx) => (
                    <div className={`timeline-item ${app.status.toLowerCase()}`} key={app.id || idx}>
                      <div className="timeline-icon">
                        {app.status === "Approved" ? (
                          <CheckCircle2 size={14} />
                        ) : app.status === "Rejected" ? (
                          <AlertTriangle size={14} />
                        ) : (
                          <Clock size={14} />
                        )}
                      </div>
                      <div className="timeline-details">
                        <div className="timeline-header">
                          <strong>{app.approver_name}</strong>
                          <span className="role-tag">{app.approver_role || "Approver"}</span>
                        </div>
                        <p className="vote-status">Status: {app.status}</p>
                        {app.remark && <p className="remark-text">"{app.remark}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="action-buttons-row">
              <button
                type="button"
                className="reset-action-btn"
                onClick={handleReset}
              >
                Reset
              </button>
              <button
                type="submit"
                className="submit-action-btn"
                disabled={submitting || uploading}
              >
                {submitting ? "Submitting Application..." : "Submit Leave Application"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Calendar Dates Selection Column */}
        <div className="calendar-card">
          <div className="section-title">2. Select Date(s)</div>
          <p className="section-subtitle">Choose your leave dates from the calendar</p>

          <div className="calendar-container-layout">
            <div className="calendar-view-header">
              <div className="left-nav-controls">
                <button type="button" className="today-button" onClick={handleToday}>
                  Today
                </button>
                <button type="button" className="chevron-nav-btn" onClick={handlePrev}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="chevron-nav-btn" onClick={handleNext}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="center-month-label">
                {calendarView === "Week" ? (
                  <span>
                    {currentWeekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                ) : (
                  <span>{monthNames[currentMonth]} {currentYear}</span>
                )}
              </div>

              <div className="view-toggle-tabs">
                <button
                  type="button"
                  className={`tab-btn ${calendarView === "Month" ? "active" : ""}`}
                  onClick={() => setCalendarView("Month")}
                >
                  Month
                </button>
                <button
                  type="button"
                  className={`tab-btn ${calendarView === "Week" ? "active" : ""}`}
                  onClick={() => setCalendarView("Week")}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={`tab-btn ${calendarView === "List" ? "active" : ""}`}
                  onClick={() => setCalendarView("List")}
                >
                  List
                </button>
              </div>
            </div>

            {/* MONTH VIEW GRID */}
            {calendarView === "Month" && (
              <div className="month-grid-wrapper">
                <div className="weekday-header-grid">
                  <div>Sun</div>
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div>Sat</div>
                </div>

                <div className="days-number-grid">
                  {getDaysInMonth(currentYear, currentMonth).map((dayObj, idx) => {
                    const { day, month, year, isCurrentMonth } = dayObj;
                    const dateObj = new Date(year, month, day);
                    const isSunday = dateObj.getDay() === 0;

                    const yStr = String(year);
                    const mStr = String(month + 1).padStart(2, '0');
                    const dStr = String(day).padStart(2, '0');
                    const dateStr = `${yStr}-${mStr}-${dStr}`;

                    const state = getCellState(dateStr);

                    let cellClass = "day-grid-cell";
                    if (!isCurrentMonth) cellClass += " pad-month";
                    if (isSunday) cellClass += " is-sunday";
                    if (state.selected) cellClass += " selected";
                    if (state.isFullyBooked) cellClass += " fully-booked";
                    if (state.existing.length > 0) cellClass += " has-existing";

                    let backgroundStyle = state.background ? { background: state.background } : {};

                    return (
                      <div
                        key={idx}
                        className={cellClass}
                        style={backgroundStyle}
                        onClick={() => handleDateClick(day, month, year)}
                      >
                        <span className="date-number">{day}</span>
                        {state.selected && (
                          <>
                            <span className="cell-checkmark">
                              <Check size={8} strokeWidth={4} />
                            </span>
                            <span className="cell-label">{state.selected}</span>
                          </>
                        )}
                        {state.existing.map((e, eIdx) => {
                          let labelText = "";
                          if (e.type === "Full Day") labelText = `Booked (${e.status})`;
                          else if (e.type === "First Half" || e.type === "Half Day") labelText = `FH (${e.status})`;
                          else if (e.type === "Second Half") labelText = `SH (${e.status})`;

                          const badgeClass = `existing-badge ${e.status.toLowerCase()}`;
                          return (
                            <span key={eIdx} className={badgeClass}>
                              {labelText}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW GRID */}
            {calendarView === "Week" && (
              <div className="week-grid-wrapper">
                <div className="weekday-header-grid">
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div>Sat</div>
                  <div>Sun</div>
                </div>

                <div className="days-number-grid week-view-row">
                  {getDaysInWeek(currentWeekStart).map((dateObj, idx) => {
                    const day = dateObj.getDate();
                    const month = dateObj.getMonth();
                    const year = dateObj.getFullYear();
                    const isSunday = dateObj.getDay() === 0;

                    const yStr = String(year);
                    const mStr = String(month + 1).padStart(2, '0');
                    const dStr = String(day).padStart(2, '0');
                    const dateStr = `${yStr}-${mStr}-${dStr}`;

                    const state = getCellState(dateStr);

                    let cellClass = "day-grid-cell week-cell";
                    if (isSunday) cellClass += " is-sunday";
                    if (state.selected) cellClass += " selected";
                    if (state.isFullyBooked) cellClass += " fully-booked";
                    if (state.existing.length > 0) cellClass += " has-existing";

                    let backgroundStyle = state.background ? { background: state.background } : {};

                    return (
                      <div
                        key={idx}
                        className={cellClass}
                        style={backgroundStyle}
                        onClick={() => handleDateClick(day, month, year)}
                      >
                        <span className="date-number">{day}</span>
                        {state.selected && (
                          <>
                            <span className="cell-checkmark">
                              <Check size={8} strokeWidth={4} />
                            </span>
                            <span className="cell-label">{state.selected}</span>
                          </>
                        )}
                        {state.existing.map((e, eIdx) => {
                          let labelText = "";
                          if (e.type === "Full Day") labelText = `Booked (${e.status})`;
                          else if (e.type === "First Half" || e.type === "Half Day") labelText = `FH (${e.status})`;
                          else if (e.type === "Second Half") labelText = `SH (${e.status})`;

                          const badgeClass = `existing-badge ${e.status.toLowerCase()}`;
                          return (
                            <span key={eIdx} className={badgeClass}>
                              {labelText}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {calendarView === "List" && (
              <div className="list-view-wrapper">
                {Object.keys(selectedDates).length === 0 ? (
                  <div className="list-empty-state">No leave dates selected yet. Click dates on the calendar.</div>
                ) : (
                  <div className="list-scroll-container">
                    {Object.keys(selectedDates).sort().map((dateStr) => {
                      const [y, m, d] = dateStr.split("-");
                      const dObj = new Date(y, m - 1, d);
                      const formatted = dObj.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                        year: "numeric"
                      });

                      return (
                        <div key={dateStr} className="list-date-row">
                          <span className="list-date-text">{formatted}</span>
                          <div className="list-selectors">
                            <select
                              value={selectedDates[dateStr]}
                              onChange={(e) => {
                                const newType = e.target.value;
                                setSelectedDates(prev => ({ ...prev, [dateStr]: newType }));
                              }}
                            >
                              {getCellState(dateStr).allowedTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="list-delete-btn"
                              onClick={() => handleRemoveDate(dateStr)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Guide selection key row */}
      <div className="guide-card">
        <div className="guide-title">Leave Selection Guide</div>
        <div className="guide-items-row">
          <div className="guide-item">
            <span className="guide-icon-box full-day" />
            <div className="guide-content">
              <strong>Full Day</strong>
              <span>Selected as full day leave</span>
            </div>
          </div>
          <div className="guide-item">
            <span className="guide-icon-box first-half" />
            <div className="guide-content">
              <strong>First Half</strong>
              <span>Morning leave (Before 1:00 PM)</span>
            </div>
          </div>
          <div className="guide-item">
            <span className="guide-icon-box second-half" />
            <div className="guide-content">
              <strong>Second Half</strong>
              <span>Afternoon leave (After 1:00 PM)</span>
            </div>
          </div>
          <div className="guide-item">
            <span className="guide-icon-box existing-approved" />
            <div className="guide-content">
              <strong>Approved Leave</strong>
              <span>Already approved leave (Disabled)</span>
            </div>
          </div>
          <div className="guide-item">
            <span className="guide-icon-box existing-pending" />
            <div className="guide-content">
              <strong>Pending Leave</strong>
              <span>Leave pending approval (Disabled)</span>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .apply-leave-container {
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #1e293b;
          background-color: #fafafa;
          min-height: 100vh;
        }
        .back-nav {
          margin-bottom: 16px;
        }
        .back-btn {
          border: none;
          background: transparent;
          color: #64748b;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: color 0.2s;
        }
        .back-btn:hover {
          color: #0f172a;
        }
        
        .apply-leave-header {
          margin-bottom: 24px;
        }
        .apply-leave-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
        }
        .apply-leave-header p {
          margin: 4px 0 0 0;
          font-size: 14px;
          color: #64748b;
        }

        .apply-leave-main-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          margin-bottom: 24px;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .apply-leave-main-grid {
            grid-template-columns: 4.8fr 5.2fr;
          }
        }
        
        .form-card, .calendar-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          padding: 24px;
        }
        
        .section-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 16px;
        }
        .section-subtitle {
          margin: -12px 0 16px 0;
          font-size: 13px;
          color: #64748b;
        }
        
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          margin-bottom: 18px;
        }
        @media (min-width: 640px) {
          .grid-2 {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        .form-group {
          margin-bottom: 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group.relative {
          position: relative;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }
        .form-group select, .form-group input, .form-group textarea {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          transition: border-color 0.2s;
        }
        .form-group select:focus, .form-group input:focus, .form-group textarea:focus {
          border-color: #0f766e;
        }
        
        /* Custom date multiselect chips list input visual */
        .chips-input-container {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          min-height: 42px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
        }
        .chips-wrapper {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          flex: 1;
        }
        .chips-placeholder {
          font-size: 13px;
          color: #94a3b8;
          margin-left: 8px;
        }
        .date-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #e6f4f1;
          color: #0f766e;
          border: 1px solid #bfe5de;
          font-size: 12px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .chip-remove {
          border: none;
          background: transparent;
          color: #0f766e;
          cursor: pointer;
          padding: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .chip-remove:hover {
          background: rgba(15, 118, 110, 0.15);
        }
        .dropdown-arrow-indicator {
          color: #94a3b8;
          font-size: 12px;
          padding-left: 8px;
        }
        .text-teal {
          color: #0f766e;
        }
        
        /* Total calculated duration banner style */
        .duration-alert-box {
          display: flex;
          align-items: start;
          gap: 12px;
          background: #f0fdfa;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 18px;
        }
        .alert-badge {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #0f766e;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .alert-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .alert-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f766e;
        }
        .alert-subtitle {
          font-size: 12px;
          color: #475569;
        }
        
        .textarea-char-counter {
          position: absolute;
          bottom: 10px;
          right: 12px;
          font-size: 11px;
          color: #94a3b8;
        }
        
        /* Drag-and-drop file uploader area */
        .dropzone {
          border: 2px dashed #cbd5e1;
          border-radius: 8px;
          padding: 24px;
          background: #ffffff;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .dropzone:hover {
          background-color: #f8fafc;
          border-color: #94a3b8;
        }
        .dropzone-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }
        .upload-circle {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dropzone-text {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          text-align: center;
        }
        .dropzone-subtext {
          font-size: 11px;
          color: #94a3b8;
        }
        
        .action-buttons-row {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        .reset-action-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-weight: 700;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .reset-action-btn:hover {
          background: #f8fafc;
        }
        .submit-action-btn {
          flex: 1;
          background: #0f766e;
          border: none;
          color: #ffffff;
          font-weight: 700;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .submit-action-btn:hover {
          background: #0d615a;
        }
        .submit-action-btn:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }
        
        /* Calendar layout styles */
        .calendar-container-layout {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .calendar-view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 16px;
        }
        .left-nav-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .today-button {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          font-weight: 600;
          font-size: 13px;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          color: #334155;
          transition: background-color 0.2s;
        }
        .today-button:hover {
          background: #f8fafc;
        }
        .chevron-nav-btn {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #334155;
          transition: background-color 0.2s;
        }
        .chevron-nav-btn:hover {
          background: #f8fafc;
        }
        
        .center-month-label {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        
        .view-toggle-tabs {
          display: flex;
          background: #f1f5f9;
          padding: 2px;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
        }
        .tab-btn {
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          padding: 6px 14px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn:hover {
          color: #0f172a;
        }
        .tab-btn.active {
          background: #ffffff;
          color: #0f766e;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        /* Weekday label row styles */
        .weekday-header-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 8px;
        }
        
        .days-number-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          background-color: #e2e8f0;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .day-grid-cell {
          aspect-ratio: 1.1;
          background-color: #ffffff;
          padding: 8px;
          display: flex;
          flex-direction: column;
          position: relative;
          cursor: pointer;
          transition: all 0.15s;
        }
        .day-grid-cell:hover {
          background-color: #f8fafc;
        }
        .day-grid-cell.pad-month {
          color: #cbd5e1;
        }
        .day-grid-cell.is-sunday {
          color: #ef4444;
          background-color: #f1f5f9;
        }
        
        .date-number {
          font-size: 14px;
          font-weight: 700;
        }
        
        /* Selected day state in calendar cells */
        .day-grid-cell.selected {
          border: 1.5px solid #0f766e;
          z-index: 1;
        }
        .day-grid-cell.week-cell {
          aspect-ratio: 1;
          height: 90px;
        }
        .week-view-row {
          grid-template-columns: repeat(7, 1fr);
        }
        
        .cell-checkmark {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background-color: #0f766e;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        .cell-label {
          margin-top: auto;
          font-size: 9px;
          font-weight: 800;
          text-align: center;
          color: #0f766e;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        
        /* List view design */
        .list-view-wrapper {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 16px;
          background: #ffffff;
        }
        .list-empty-state {
          color: #64748b;
          text-align: center;
          padding: 24px;
          font-size: 13px;
        }
        .list-scroll-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 320px;
          overflow-y: auto;
        }
        .list-date-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .list-date-text {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
        }
        .list-selectors {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .list-selectors select {
          padding: 4px 8px;
          font-size: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-weight: 600;
          outline: none;
        }
        .list-selectors select:focus {
          border-color: #0f766e;
        }
        .list-delete-btn {
          background: transparent;
          border: none;
          color: #ef4444;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        .list-delete-btn:hover {
          background: #fee2e2;
        }
        
        /* Guide component style rules */
        .guide-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .guide-title {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 16px;
        }
        .guide-items-row {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .guide-items-row {
            flex-direction: row;
            justify-content: start;
            gap: 40px;
          }
        }
        .guide-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        /* Split visual icon boxes */
        .guide-icon-box {
          width: 24px;
          height: 24px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .guide-icon-box.full-day {
          background-color: #0f766e;
        }
        .guide-icon-box.first-half {
          background: linear-gradient(to right, #0f766e 50%, #ffffff 50%);
        }
        .guide-icon-box.second-half {
          background: linear-gradient(to right, #ffffff 50%, #0f766e 50%);
        }
        
        .guide-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .guide-content strong {
          font-size: 13px;
          color: #1e293b;
        }
        .guide-content span {
          font-size: 11px;
          color: #64748b;
        }
        .day-grid-cell.fully-booked {
          cursor: not-allowed;
          opacity: 0.85;
        }
        .day-grid-cell.fully-booked:hover {
          background-color: inherit !important;
        }
        .existing-badge {
          margin-top: auto;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 3px;
          border-radius: 3px;
          text-align: center;
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .existing-badge.approved {
          background-color: #cbd5e1;
          color: #334155;
          border: 1px solid #94a3b8;
        }
        .existing-badge.pending {
          background-color: #ffedd5;
          color: #c2410c;
          border: 1px solid #f97316;
        }
        .guide-icon-box.existing-approved {
          background-color: #cbd5e1;
          border-color: #94a3b8;
        }
        .guide-icon-box.existing-pending {
          background-color: #fed7aa;
          border-color: #f97316;
        }
        .approvals-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .timeline-item {
          display: flex;
          gap: 12px;
        }
        .timeline-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #f1f5f9;
          color: #64748b;
        }
        .timeline-item.approved .timeline-icon { background: #dcfce7; color: #166534; }
        .timeline-item.rejected .timeline-icon { background: #fee2e2; color: #991b1b; }
        .timeline-item.pending .timeline-icon { background: #fef3c7; color: #92400e; }
        .timeline-item.cancelled .timeline-icon { background: #e2e8f0; color: #475569; }
        .timeline-details {
          flex: 1;
        }
        .timeline-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }
        .timeline-header strong { font-size: 14px; color: #0f172a; }
        .role-tag { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
        .vote-status { margin: 0; font-size: 12px; color: #64748b; }
        .remark-text { margin: 4px 0 0 0; font-size: 13px; font-style: italic; color: #475569; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #cbd5e1; }
        ` }} />
    </div>
  );
}
