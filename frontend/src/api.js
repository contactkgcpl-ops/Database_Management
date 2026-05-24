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
  get: () => localStorage.getItem("erp_token"),
  set: (token) => localStorage.setItem("erp_token", token),
  clear: () => localStorage.removeItem("erp_token"),
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
  convertLeadToInquiry: (companyId, payload) => request(`/leads/${companyId}/convert`, { method: "POST", body: JSON.stringify(payload) }),
};
