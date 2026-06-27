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

let activeRequests = 0;

function updateLoadingState(delta) {
  const prevActive = activeRequests;
  activeRequests = Math.max(0, activeRequests + delta);
  if (prevActive === 0 && activeRequests > 0) {
    window.dispatchEvent(new CustomEvent("erp:loading", { detail: { loading: true } }));
  } else if (prevActive > 0 && activeRequests === 0) {
    window.dispatchEvent(new CustomEvent("erp:loading", { detail: { loading: false } }));
  }
}

async function request(path, options = {}) {
  const isGet = !options.method || options.method.toUpperCase() === "GET";
  const isSilent = isGet && (
    path.includes("/notifications") ||
    path.includes("/time/today") ||
    path.includes("/chat")
  );

  if (!isSilent) updateLoadingState(1);

  try {
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
    return await res.json();
  } finally {
    if (!isSilent) updateLoadingState(-1);
  }
}

function requestBody(data) {
  return data instanceof FormData ? data : JSON.stringify(data);
}

async function download(path, filename) {
  updateLoadingState(1);
  try {
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
  } finally {
    updateLoadingState(-1);
  }
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  dashboardStats: () => request("/dashboard/stats"),
  users: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== false && v !== "")
    ).toString();
    return request(`/users${q ? `?${q}` : ""}`);
  },
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
  statesAndCities: () => request("/companies/states-and-cities"),
  companies: (params = {}) => {
    if (typeof params === "string") {
      return request(`/companies${params ? `?q=${encodeURIComponent(params)}` : ""}`);
    }
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/companies${q ? `?${q}` : ""}`);
  },
  company: (id) => request(`/companies/${id}`),
  importCompanies: (rows) => Promise.all(rows.map((row) => request("/companies", { method: "POST", body: JSON.stringify(row) }))),
  createCompany: (data) => request("/companies", { method: "POST", body: JSON.stringify(data) }),
  updateCompany: (id, data) => request(`/companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  assignCompany: (id, userId, assignedToIds) => {
    const params = new URLSearchParams();
    if (userId) params.append("user_id", userId);
    if (assignedToIds) params.append("assigned_to_ids", assignedToIds);
    const qs = params.toString();
    return request(`/companies/${id}/assign${qs ? `?${qs}` : ""}`, { method: "POST" });
  },
  myLeads: (q = "") => request(`/companies/my${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createLead: (data) => request("/leads", { method: "POST", body: JSON.stringify(data) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: "DELETE" }),
  bulkDeleteCompanies: (ids) => request("/companies/bulk-delete", { method: "POST", body: JSON.stringify(ids) }),
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
  attendanceReport: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    ).toString();
    return request(`/time/attendance-report${q ? `?${q}` : ""}`);
  },
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

  importUpsertCompany: (data) => request("/companies/import-upsert", { method: "POST", body: JSON.stringify(data) }),
  vendors: (q = "") => request(`/vendors${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  vendor: (id) => request(`/vendors/${id}`),
  createVendor: (data) => request("/vendors", { method: "POST", body: JSON.stringify(data) }),
  updateVendor: (id, data) => request(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteVendor: (id) => request(`/vendors/${id}`, { method: "DELETE" }),
  updateVendorInline: (vendorId, payload) => request(`/vendors/${vendorId}/inline-update`, { method: "PUT", body: JSON.stringify(payload) }),
  getVendorHistory: (vendorId) => request(`/vendors/${vendorId}/history`),
  // Leave Management
  applyLeave: (data) => request("/leaves/apply", { method: "POST", body: JSON.stringify(data) }),
  myLeaves: (userId) => request("/leaves/my" + (userId ? `?user_id=${userId}` : "")),
  leaveApprovals: () => request("/leaves/approvals"),
  actionLeaveApproval: (leaveId, actionData) => request(`/leaves/${leaveId}/approve`, { method: "POST", body: JSON.stringify(actionData) }),
  cancelLeave: (leaveId, reason) => request(`/leaves/${leaveId}/cancel?reason=${encodeURIComponent(reason)}`, { method: "POST" }),
  leaveCalendar: (month, year) => request(`/leaves/calendar?month=${month}&year=${year}`),
  leaveDetails: (leaveId) => request(`/leaves/${leaveId}`),
  uploadLeaveAttachment: (formData) => request("/leaves/upload", { method: "POST", body: formData }),
  updateLeave: (leaveId, data) => request(`/leaves/${leaveId}`, { method: "PUT", body: JSON.stringify(data) }),
  myApprovers: (userId) => request("/leaves/my-approvers" + (userId ? `?user_id=${userId}` : "")),
  leaveRequests: () => request("/leaves/requests"),
  // Our Companies Management
  ourCompanies: () => request("/our-companies"),
  ourCompany: (id) => request(`/our-companies/${id}`),
  createOurCompany: (data) => request("/our-companies", { method: "POST", body: JSON.stringify(data) }),
  updateOurCompany: (id, data) => request(`/our-companies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteOurCompany: (id) => request(`/our-companies/${id}`, { method: "DELETE" }),
  uploadOurCompanyLogo: (formData) => request("/our-companies/upload", { method: "POST", body: formData }),
  // Connection Tracking
  trackingFilters: () => request("/tracking/filters"),
  connectionTracking: (params = {}) => {
    const q = new URLSearchParams();
    if (params.states) params.states.forEach(s => q.append("states", s));
    if (params.companies) params.companies.forEach(c => q.append("companies", c));
    if (params.industries) params.industries.forEach(i => q.append("industries", i));
    const qs = q.toString();
    return request(`/tracking/connection${qs ? `?${qs}` : ""}`);
  },
  reportsConfig: () => request("/reports/config"),
  updateReportsConfig: (data) => request("/reports/config", { method: "PUT", body: JSON.stringify(data) }),
  reportsLogs: () => request("/reports/logs"),
  sendReportNow: (date) => request("/reports/send-now" + (date ? "?date=" + date : ""), { method: "POST" }),
  downloadReportCsv: (date) => download("/reports/download" + (date ? "?date=" + date : ""), "Daily_Activity_Report_" + date + ".xlsx")
};
