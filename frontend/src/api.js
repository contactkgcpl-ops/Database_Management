const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const ASSET_URL = API_URL.replace(/\/api\/?$/, "");

function formatDetail(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .join("\n");
  }
  if (typeof detail === "string") return detail;
  return "Request failed";
}

function showError(message) {
  window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message, type: "error" } }));
}

export const tokenStore = {
  get: () => sessionStorage.getItem("erp_token"),
  set: (token) => sessionStorage.setItem("erp_token", token),
  clear: () => sessionStorage.removeItem("erp_token"),
};

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) return path;
  return `${ASSET_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = formatDetail(body.detail);
    showError(message);
    const error = new Error(message);
    error.notified = true;
    throw error;
  }
  return res.json();
}

function requestBody(data) {
  return data instanceof FormData ? data : JSON.stringify(data);
}

async function download(path, filename) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = formatDetail(body.detail);
    showError(message);
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  dashboardStats: () => request("/dashboard/stats"),
  users: () => request("/users"),
  createUser: (data) => request("/users", { method: "POST", body: requestBody(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PUT", body: requestBody(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  roles: () => request("/roles"),
  permissions: () => request("/roles/permissions"),
  createRole: (data) => request("/roles", { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id, data) => request(`/roles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRole: (id) => request(`/roles/${id}`, { method: "DELETE" }),
  properties: (q = "") => request(`/properties${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  propertyGrids: () => request("/properties/grids"),
  createProperty: (data) => request("/properties", { method: "POST", body: JSON.stringify(data) }),
  updateProperty: (id, data) => request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updatePropertyGridColumns: (columns) => request("/properties/grid-columns", { method: "PUT", body: JSON.stringify({ columns }) }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: "DELETE" }),
  companies: (q = "") => request(`/companies${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  company: (id) => request(`/companies/${id}`),
  importCompanies: (rows) => Promise.all(rows.map((row) => request("/companies", { method: "POST", body: JSON.stringify(row) }))),
  createCompany: (data) => request("/companies", { method: "POST", body: JSON.stringify(data) }),
  updateCompany: (id, data) => request(`/companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  assignCompany: (id, userId) => request(`/companies/${id}/assign${userId ? `?user_id=${userId}` : ""}`, { method: "POST" }),
  myLeads: (q = "") => request(`/companies/my${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createLead: (data) => request("/leads", { method: "POST", body: JSON.stringify(data) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: "DELETE" }),
  updateCompanyInline: (companyId, payload) => request(`/companies/${companyId}/inline-update`, { method: "PUT", body: JSON.stringify(payload) }),
  getCompanyHistory: (companyId) => request(`/companies/${companyId}/history`),
  myPendingFollowups: () => request("/leads/followups/my-pending"),
  getCompanyFollowups: (companyId) => request(`/leads/companies/${companyId}/followups`),
  completeFollowup: (id, payload) => request(`/leads/followups/${id}/complete`, { method: "PUT", body: JSON.stringify(payload) }),
  getInquiries: (q = "") => request(`/inquiries${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createInquiry: (data) => request("/inquiries", { method: "POST", body: JSON.stringify(data) }),
  assignInquiry: (id, userId) => request(`/inquiries/${id}/assign`, { method: "PUT", body: JSON.stringify({ user_id: userId ? Number(userId) : null }) }),
  updateInquiryStage: (id, payload) => request(`/inquiries/${id}/stage`, { method: "PUT", body: JSON.stringify(payload) }),
  convertLeadToInquiry: (companyId, payload) => request(`/leads/${companyId}/convert`, { method: "POST", body: requestBody(payload) }),
  // Requirements
  requirements: () => request("/requirements"),
  createRequirement: (data) => request("/requirements", { method: "POST", body: requestBody(data) }),
  updateRequirement: (id, data) => request(`/requirements/${id}`, { method: "PUT", body: requestBody(data) }),
  completeRequirement: (id) => request(`/requirements/${id}/complete`, { method: "PUT" }),
  deleteRequirement: (id) => request(`/requirements/${id}`, { method: "DELETE" }),
  addRequirementComment: (id, payload) => request(`/requirements/${id}/comments`, { method: "POST", body: JSON.stringify(payload) }),
  // Requirement Notifications
  myNotifications: () => request("/requirements/notifications"),
  markNotificationRead: (id) => request(`/requirements/notifications/${id}/read`, { method: "PUT" }),
  markAllNotificationsRead: () => request("/requirements/notifications/read-all", { method: "PUT" }),
  todayTime: () => request("/time/today"),
  myTimeLogs: (q = "") => request(`/time/my${q ? `?${q}` : ""}`),
  userTimeLogs: (q = "") => request(`/time/users${q ? `?${q}` : ""}`),
  markTimeLogout: () => request("/time/logout", { method: "POST" }),
  timeResume: () => request("/time/resume", { method: "POST" }),
  startBreak: () => request("/time/break/start", { method: "POST" }),
  endBreak: () => request("/time/break/end", { method: "POST" }),
  // Hourly Reporting
  allHourlyReports: (q = "") => request(`/reporting/all${q ? `?${q}` : ""}`),
  hourlyReports: (q = "") => request(`/reporting${q ? `?${q}` : ""}`),
  createHourlyReport: (data) => request("/reporting", { method: "POST", body: JSON.stringify(data) }),
  updateHourlyReport: (id, data) => request(`/reporting/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteHourlyReport: (id) => request(`/reporting/${id}`, { method: "DELETE" }),
  submitHourlyReports: (workDate) => request(`/reporting/submit?work_date=${workDate}`, { method: "POST" }),
  checkPendingReports: () => request("/reporting/check-pending"),
  // Chat
  getChatMessages: () => request("/chat"),
  sendChatMessage: (message) => request("/chat", { method: "POST", body: JSON.stringify({ message }) }),
  getChatUnreadCount: () => request("/chat/unread"),
  markChatRead: () => request("/chat/read", { method: "POST" }),
  // Tasks
  tasks: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "All")
    ).toString();
    return request(`/tasks${q ? `?${q}` : ""}`);
  },
  taskStats: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "All")
    ).toString();
    return request(`/tasks/stats${q ? `?${q}` : ""}`);
  },
  taskDetails: (id) => request(`/tasks/${id}`),
  createTask: (data) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  startTaskTimer: (id, workType) => request(`/tasks/${id}/timer/start?work_type=${encodeURIComponent(workType)}`, { method: "POST" }),
  stopTaskTimer: (id, workDescription, workType = "") => request(`/tasks/${id}/timer/stop?work_description=${encodeURIComponent(workDescription)}${workType ? `&work_type=${encodeURIComponent(workType)}` : ""}`, { method: "POST" }),
  addTaskComment: (id, comment) => request(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ comment }) }),
  taskNotifications: () => request("/tasks/notifications"),
  markTaskNotificationRead: (id) => request(`/tasks/notifications/${id}/read`, { method: "POST" }),
  markAllTaskNotificationsRead: () => request("/tasks/notifications/mark-read", { method: "POST" }),
  staffReport: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "All")
    ).toString();
    return request(`/tasks/reports/staff${q ? `?${q}` : ""}`);
  },
};
