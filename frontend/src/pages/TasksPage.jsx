import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, RefreshCw, X, HelpCircle, CheckCircle2, Circle, AlertCircle, Play, Calendar, Clock, MoreVertical, Filter, SlidersHorizontal, ChevronDown, ClipboardList, Clipboard, Pause, Check } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { TaskDetailPage } from "./TaskDetailPage";

function formatDate(val) {
  if (!val) return "-";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  
  // Tabs & Filters
  const [activeTab, setActiveTab] = useState("Ongoing"); // Ongoing (In Progress), TODO, Hold, Completed
  const [searchQuery, setSearchQuery] = useState("");
  const [assignedByFilter, setAssignedByFilter] = useState("All");
  const [assignedToFilter, setAssignedToFilter] = useState("All");
  const [dueDateFilter, setDueDateFilter] = useState("");

  // Stats State from DB
  const [stats, setStats] = useState({
    total: 0,
    ongoing: 0,
    todo: 0,
    hold: 0,
    completed: 0,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Create Task View
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createEtaHours, setCreateEtaHours] = useState("");
  const [createAssignedToId, setCreateAssignedToId] = useState("");
  const [submittingTask, setSubmittingTask] = useState(false);

  // Load static users list once
  useEffect(() => {
    loadUsers();
  }, []);

  // Trigger tasks & stats fetch when filters/tab change
  useEffect(() => {
    loadTasksAndStats();
  }, [activeTab, searchQuery, assignedByFilter, assignedToFilter, dueDateFilter]);

  const loadUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTasksAndStats = async () => {
    setLoading(true);
    try {
      const filters = {
        search: searchQuery || null,
        assigned_by_id: assignedByFilter === "All" ? null : Number(assignedByFilter),
        assigned_to_id: assignedToFilter === "All" ? null : Number(assignedToFilter),
        due_date: dueDateFilter || null,
      };

      // 1. Fetch task stats (without status tab filter to get counts of all statuses matching filters)
      const statsData = await api.taskStats(filters);
      setStats(statsData);

      // 2. Fetch list of tasks (filtered by active status tab as well)
      const listFilters = {
        ...filters,
        status: activeTab,
      };
      const listData = await api.tasks(listFilters);
      setTasks(listData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!createTitle.trim() || submittingTask) return;
    setSubmittingTask(true);
    try {
      const payload = {
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        due_date: createDueDate ? new Date(createDueDate).toISOString() : null,
        eta_hours: createEtaHours ? Number(createEtaHours) : 0.0,
        assigned_to_id: createAssignedToId ? Number(createAssignedToId) : null,
      };
      await api.createTask(payload);
      
      // Reset form
      setCreateTitle("");
      setCreateDescription("");
      setCreateDueDate("");
      setCreateEtaHours("");
      setCreateAssignedToId("");
      setShowCreatePage(false);
      
      loadTasksAndStats();
      window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Task created successfully!", type: "success" } }));
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setAssignedByFilter("All");
    setAssignedToFilter("All");
    setDueDateFilter("");
    setCurrentPage(1);
  };

  // Calculate task accumulated work time
  const getTaskDuration = (task) => {
    if (!task.timer_logs) return 0;
    return task.timer_logs.reduce((acc, log) => {
      if (log.end_time) {
        return acc + log.duration_seconds;
      }
      const elapsed = Math.floor((Date.now() - new Date(log.start_time)) / 1000);
      return acc + elapsed;
    }, 0);
  };

  // Pagination Slice over database-filtered tasks list
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return tasks.slice(start, start + pageSize);
  }, [tasks, currentPage, pageSize]);

  const totalPages = Math.ceil(tasks.length / pageSize) || 1;

  // Helper selectors for custom overlay inputs
  const selectedAssignedByName = useMemo(() => {
    if (assignedByFilter === "All") return "All";
    const found = (users || []).find(u => Number(u.id) === Number(assignedByFilter));
    return found ? found.name : "All";
  }, [assignedByFilter, users]);

  const selectedAssignedToName = useMemo(() => {
    if (assignedToFilter === "All") return "All";
    const found = (users || []).find(u => Number(u.id) === Number(assignedToFilter));
    return found ? found.name : "All";
  }, [assignedToFilter, users]);

  const formattedSelectedDate = useMemo(() => {
    if (!dueDateFilter) return "Select Date";
    const dateObj = new Date(dueDateFilter);
    if (isNaN(dateObj.getTime())) return "Select Date";
    return dateObj.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [dueDateFilter]);

  if (selectedTaskId) {
    return (
      <TaskDetailPage
        taskId={selectedTaskId}
        onBack={() => {
          setSelectedTaskId(null);
          loadTasksAndStats();
        }}
        currentUser={user}
      />
    );
  }

  // Full-page Create Task Layout matching details page view
  if (showCreatePage) {
    return (
      <div className="task-detail-container" style={{ padding: "10px 15px" }}>
        {/* Top Header */}
        <div className="task-detail-header">
          <div className="breadcrumb-box">
            <span className="task-id">NEW</span>
            <h2 className="task-title-main">Create Task</h2>
          </div>
          <div className="header-actions">
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={submittingTask || !createTitle.trim()}
              className="primary btn-save"
              style={{ backgroundColor: "#176b5b", display: "inline-flex", alignProps: "center", gap: "6px", fontSize: "13px", fontWeight: "600", padding: "7px 14px" }}
            >
              Save Task
            </button>
            <button
              type="button"
              onClick={() => setShowCreatePage(false)}
              className="btn-close-details"
            >
              <X size={16} /> Close
            </button>
          </div>
        </div>

        {/* Form Body Layout */}
        <div className="task-grid-body">
          {/* Main Left */}
          <div className="task-main-left">
            <div className="details-card-block">
              <h3>Task Title *</h3>
              <input
                type="text"
                required
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Name"
                className="cell-input"
                style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px", width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div className="details-card-block">
              <h3>Description</h3>
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Description of the task"
                className="comment-textarea"
                rows={10}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
              />
            </div>
          </div>

          {/* Sidebar Right */}
          <div className="task-sidebar-right">
            <div className="sidebar-details-card">
              <h3>Details</h3>

              <div className="sidebar-field">
                <label>Assign To</label>
                <select
                  value={createAssignedToId}
                  onChange={(e) => setCreateAssignedToId(e.target.value)}
                  className="field-select"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="sidebar-field">
                <label>Due Date</label>
                <input
                  type="datetime-local"
                  value={createDueDate}
                  onChange={(e) => setCreateDueDate(e.target.value)}
                  className="field-date-input"
                />
              </div>

              <div className="sidebar-field">
                <label>ETA (Hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={createEtaHours}
                  onChange={(e) => setCreateEtaHours(e.target.value)}
                  placeholder="0 Hours"
                  className="field-number-input"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Global Styles */}
        <style dangerouslySetInnerHTML={{ __html: `
          .task-detail-container { padding: 10px 15px; }
          .task-detail-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 20px; }
          .breadcrumb-box { display: flex; align-items: center; gap: 8px; }
          .task-id { background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
          .task-title-main { margin: 0; font-size: 18px; color: #0f172a; font-weight: 700; }
          .header-actions { display: flex; align-items: center; gap: 8px; }
          .btn-save { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 6px; border: none; cursor: pointer; color: #fff; }
          .btn-close-details { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: white; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
          .btn-close-details:hover { background: #f8fafc; }
          .task-grid-body { display: grid; grid-template-columns: 1fr 280px; gap: 20px; }
          .details-card-block { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
          .details-card-block h3 { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 12px; }
          .comment-textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 13px; resize: vertical; box-sizing: border-box; }
          .comment-textarea:focus { border-color: #176b5b; outline: none; }
          .task-sidebar-right { display: flex; flex-direction: column; gap: 20px; }
          .sidebar-details-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
          .sidebar-details-card h3 { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
          .sidebar-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
          .sidebar-field label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .field-select, .field-date-input, .field-number-input { width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; font-weight: 600; color: #334155; box-sizing: border-box; }
          .field-select:focus, .field-date-input:focus, .field-number-input:focus { border-color: #176b5b; outline: none; }
        ` }} />
      </div>
    );
  }

  return (
    <div className="tasks-dashboard-wrapper">
      
      {/* 1. Header tabs section */}
      <div className="dashboard-tab-header">
        <div className="task-status-tabs">
          {[
            { key: "Ongoing", label: "In Progress" },
            { key: "TODO", label: "To Do" },
            { key: "Hold", label: "On Hold" },
            { key: "Completed", label: "Completed" }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`task-tab-btn ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.key);
                setCurrentPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="create-task-btn-top"
          onClick={() => setShowCreatePage(true)}
        >
          <Plus size={16} /> Create Task
        </button>
      </div>

      {/* 2. Filters Row */}
      <div className="filters-container-bar">
        <div className="search-field-box">
          <Search size={16} className="search-icon-inside" />
          <input
            type="text"
            placeholder="Search by Task Title or ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-search-input"
          />
        </div>

        {/* Custom select card: Assigned By */}
        <div className="filter-box-custom">
          <span className="filter-box-label">Assigned By</span>
          <div className="filter-box-value-row">
            <span className="filter-box-val">{selectedAssignedByName}</span>
            <ChevronDown size={14} className="filter-box-chevron" />
          </div>
          <select
            value={assignedByFilter}
            onChange={(e) => {
              setAssignedByFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-box-select-overlay"
          >
            <option value="All">All</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Custom select card: Assigned To */}
        <div className="filter-box-custom">
          <span className="filter-box-label">Assigned To</span>
          <div className="filter-box-value-row">
            <span className="filter-box-val">{selectedAssignedToName}</span>
            <ChevronDown size={14} className="filter-box-chevron" />
          </div>
          <select
            value={assignedToFilter}
            onChange={(e) => {
              setAssignedToFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-box-select-overlay"
          >
            <option value="All">All</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Custom select card: Due Date */}
        <div className="filter-box-custom due-date-filter-box">
          <span className="filter-box-label">Due Date</span>
          <div className="filter-box-value-row">
            <div className="filter-date-display-left">
              <Calendar size={14} className="filter-date-icon" />
              <span className="filter-box-val">{formattedSelectedDate}</span>
            </div>
            <ChevronDown size={14} className="filter-box-chevron" />
          </div>
          <input
            type="date"
            value={dueDateFilter}
            onChange={(e) => {
              setDueDateFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="filter-box-select-overlay"
          />
        </div>

        <button type="button" onClick={handleResetFilters} className="btn-filter-funnel" title="Reset Filters">
          <Filter size={16} />
        </button>
        <button type="button" onClick={loadTasksAndStats} className="btn-filter-refresh" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 3. Metric cards row - consolidated container */}
      <div className="metrics-container-card">
        <div className="metric-col-item">
          <div className="metric-icon-circle total">
            <ClipboardList size={18} />
          </div>
          <div className="metric-info-box">
            <span className="metric-label-text">Total</span>
            <span className="metric-val-num">{stats.total}</span>
          </div>
        </div>

        <div className="metric-col-item">
          <div className="metric-icon-circle inprogress">
            <RefreshCw size={18} />
          </div>
          <div className="metric-info-box">
            <span className="metric-label-text">In Progress</span>
            <span className="metric-val-num inprogress">{stats.ongoing}</span>
          </div>
        </div>

        <div className="metric-col-item">
          <div className="metric-icon-circle todo">
            <Clipboard size={18} />
          </div>
          <div className="metric-info-box">
            <span className="metric-label-text">To Do</span>
            <span className="metric-val-num">{stats.todo}</span>
          </div>
        </div>

        <div className="metric-col-item">
          <div className="metric-icon-circle onhold">
            <Pause size={18} />
          </div>
          <div className="metric-info-box">
            <span className="metric-label-text">On Hold</span>
            <span className="metric-val-num onhold">{stats.hold}</span>
          </div>
        </div>

        <div className="metric-col-item">
          <div className="metric-icon-circle completed">
            <Check size={18} />
          </div>
          <div className="metric-info-box">
            <span className="metric-label-text">Completed</span>
            <span className="metric-val-num">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* 4. Tasks Grid table */}
      <div className="data-grid shadow-card">
        <div className="table-wrap">
          <table className="company-table tasks-dashboard-table">
            <thead>
              <tr>
                <th style={{ width: "100px" }}>Task ID</th>
                <th>Task Title</th>
                <th>Assigned By</th>
                <th>Assigned To</th>
                <th>ETA</th>
                <th>Due Date</th>
                <th>Work Duration</th>
                <th>Status</th>
                <th style={{ width: "60px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
                    Loading tasks list...
                  </td>
                </tr>
              ) : paginatedTasks.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                    No records found
                  </td>
                </tr>
              ) : (
                paginatedTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    style={{ cursor: "pointer" }}
                    className="clickable-row"
                  >
                    <td>
                      <span className="task-id-pill">SB-{t.id}</span>
                    </td>
                    <td>
                      <div className="task-title-cell">
                        <strong className="title-bold">{t.title}</strong>
                        {t.description && (
                          <span className="desc-subtitle">
                            {t.description.length > 70
                              ? `${t.description.substring(0, 70)}...`
                              : t.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="cell-text">{t.created_by?.name || "System"}</span></td>
                    <td>
                      <span className="cell-text">
                        {t.assigned_to ? t.assigned_to.name : <em className="unassigned-text">Unassigned</em>}
                      </span>
                    </td>
                    <td><span className="cell-text font-bold-dark">{t.eta_hours}h</span></td>
                    <td>
                      <div className="due-date-cell">
                        <Calendar size={14} className="cell-icon-slate" />
                        <span>{formatDate(t.due_date)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="work-duration-cell">
                        <Clock size={14} className="cell-icon-teal" />
                        <span>{formatDuration(getTaskDuration(t))}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge-premium status-${(t.status || "TODO").toLowerCase()}`}>
                        {t.status === "Ongoing" ? "In Progress" : t.status === "TODO" ? "To Do" : t.status === "Hold" ? "On Hold" : t.status === "Completed" ? "Completed" : "To Do"}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                      <button type="button" className="btn-table-action" onClick={() => setSelectedTaskId(t.id)}>
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Pagination Footer */}
      {!loading && tasks.length > 0 && (
        <div className="pagination-footer-bar">
          <span className="pagination-count-label">
            Showing {Math.min(tasks.length, (currentPage - 1) * pageSize + 1)} to{" "}
            {Math.min(tasks.length, currentPage * pageSize)} of {tasks.length}{" "}
            {tasks.length === 1 ? "task" : "tasks"}
          </span>

          <div className="pagination-controls-box">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
              className="btn-paginate-arrow"
            >
              &lt;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                type="button"
                className={`btn-paginate-number ${currentPage === pageNum ? "active" : ""}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="btn-paginate-arrow"
            >
              &gt;
            </button>

            <div className="pagination-size-select-wrap">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="pagination-size-select"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <ChevronDown size={12} className="select-arrow-icon" />
            </div>
          </div>
        </div>
      )}

      {/* Style Overrides for TasksPage */}
      <style dangerouslySetInnerHTML={{ __html: `
        .tasks-dashboard-wrapper { display: flex; flex-direction: column; gap: 16px; padding: 10px; }
        
        /* 1. Header tabs */
        .dashboard-tab-header { display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .task-status-tabs { display: flex; gap: 32px; }
        .task-tab-btn { background: none; border: none; padding: 16px 4px; font-size: 14px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.2s; border-bottom: 3px solid transparent; position: relative; bottom: -1px; }
        .task-tab-btn:hover { color: #176b5b; }
        .task-tab-btn.active { color: #0f172a; border-bottom-color: #176b5b; }
        .create-task-btn-top { background: #176b5b; color: white; display: inline-flex; align-items: center; gap: 6px; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
        .create-task-btn-top:hover { background: #0f4d41; }

        /* 2. Filters Row */
        .filters-container-bar { display: flex; align-items: center; gap: 12px; }
        .search-field-box { flex: 1; position: relative; display: flex; align-items: center; }
        .search-icon-inside { position: absolute; left: 12px; color: #94a3b8; }
        .filter-search-input { width: 100%; height: 44px; padding: 8px 12px 8px 36px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; box-sizing: border-box; outline: none; transition: border-color 0.2s; background: white; }
        .filter-search-input:focus { border-color: #176b5b; }

        /* Custom overlay select styles */
        .filter-box-custom { position: relative; background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; height: 44px; min-width: 140px; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; }
        .filter-box-custom:focus-within { border-color: #176b5b; }
        .filter-box-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .filter-box-value-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
        .filter-box-val { font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
        .filter-box-chevron { color: #64748b; flex-shrink: 0; }
        .filter-box-select-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
        
        .filter-date-display-left { display: flex; align-items: center; gap: 6px; }
        .filter-date-icon { color: #64748b; flex-shrink: 0; }

        .btn-filter-funnel, .btn-filter-refresh { width: 44px; height: 44px; border: 1px solid #cbd5e1; background: white; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569; transition: background 0.2s; }
        .btn-filter-funnel:hover, .btn-filter-refresh:hover { background: #f8fafc; border-color: #176b5b; }

        /* 3. Metric cards row - unified card container */
        .metrics-container-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; display: grid; grid-template-columns: repeat(5, 1fr); box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .metric-col-item { display: flex; align-items: center; gap: 14px; padding: 14px 20px; }
        .metric-col-item:not(:last-child) { border-right: 1px solid #f1f5f9; }
        .metric-icon-circle { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .metric-icon-circle.total { background: #e6f4f1; color: #176b5b; }
        .metric-icon-circle.inprogress { background: #e6f4f1; color: #176b5b; }
        .metric-icon-circle.todo { background: #eff6ff; color: #2563eb; }
        .metric-icon-circle.onhold { background: #fff7ed; color: #ea580c; }
        .metric-icon-circle.completed { background: #f0fdf4; color: #16a34a; }
        .metric-info-box { display: flex; flex-direction: column; gap: 2px; }
        .metric-label-text { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.02em; }
        .metric-val-num { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.1; }
        .metric-val-num.inprogress { color: #176b5b; }
        .metric-val-num.onhold { color: #ea580c; }

        /* 4. Tasks Grid table */
        .shadow-card { box-shadow: 0 4px 12px rgba(0,0,0,0.02); border: 1px solid #e2e8f0; border-radius: 8px; background: white; overflow: hidden; }
        .tasks-dashboard-table.company-table { width: 100%; border-collapse: collapse; text-align: left; }
        .tasks-dashboard-table.company-table th { border-bottom: 1px solid #e2e8f0; padding: 12px 16px; font-size: 12px; font-weight: 700; color: #475569; background: #fafafa; }
        .tasks-dashboard-table.company-table td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        
        .task-id-pill { background: #e6f4f1; color: #176b5b; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 12px; border: 1px solid #cce5e0; }
        .task-title-cell { display: flex; flex-direction: column; gap: 2px; }
        .title-bold { font-size: 13px; color: #0f172a; font-weight: 700; }
        .desc-subtitle { font-size: 11px; color: #64748b; font-weight: 500; }
        .unassigned-text { color: #94a3b8; font-style: italic; }
        .font-bold-dark { font-weight: 700; color: #334155; }
        
        .due-date-cell, .work-duration-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
        .cell-icon-slate { color: #94a3b8; }
        .cell-icon-teal { color: #176b5b; }
        
        .status-badge-premium { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; text-align: center; }
        .status-badge-premium.status-todo { background: #f1f5f9; color: #475569; }
        .status-badge-premium.status-ongoing { background: #e6f4f1; color: #176b5b; }
        .status-badge-premium.status-hold { background: #fff7ed; color: #c2410c; }
        .status-badge-premium.status-completed { background: #dcfce7; color: #15803d; }
        
        .btn-table-action { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 4px; display: inline-flex; border-radius: 4px; }
        .btn-table-action:hover { background: #f1f5f9; color: #475569; }
        
        /* 5. Pagination Footer */
        .pagination-footer-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .pagination-count-label { font-size: 12px; font-weight: 600; color: #475569; }
        
        .pagination-controls-box { display: flex; align-items: center; gap: 8px; }
        .btn-paginate-arrow, .btn-paginate-number { min-width: 28px; height: 28px; padding: 0 6px; border: 1px solid #cbd5e1; background: white; border-radius: 4px; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .btn-paginate-arrow:hover, .btn-paginate-number:hover { border-color: #176b5b; color: #176b5b; }
        .btn-paginate-arrow:disabled { background: #f8fafc; color: #cbd5e1; border-color: #e2e8f0; cursor: not-allowed; }
        .btn-paginate-number.active { background: #176b5b; border-color: #176b5b; color: white; }
        
        .pagination-size-select-wrap { position: relative; display: flex; align-items: center; }
        .pagination-size-select { padding: 4px 24px 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; font-weight: 600; color: #475569; outline: none; background: white; cursor: pointer; -webkit-appearance: none; appearance: none; }
        .pagination-size-select:focus { border-color: #176b5b; }
        .select-arrow-icon { position: absolute; right: 8px; color: #64748b; pointer-events: none; }
      ` }} />
    </div>
  );
}
