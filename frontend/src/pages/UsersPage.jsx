import React, { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Camera,
  Eye,
  FileText,
  KeyRound,
  MonitorSmartphone,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
  X,
  Users,
} from "lucide-react";
import { api, assetUrl } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { MultiSelect } from "../components/MultiSelect";


const blankForm = {
  first_name: "",
  last_name: "",
  name: "",
  email: "",
  password: "",
  confirm_password: "",
  mobile: "",
  alternate_number: "",
  designation: "Sales Executive",
  department: "Sales",
  role_id: "",
  senior_id: "",
  team_ids: [],
  profile_image_url: "",
  joining_date: "",
  employee_type: "Full Time",
  is_active: true,
  address: "",
  notes: "",
  company_ids: "",
};

const tabs = [
  ["basic", "Basic Information", FileText],
  ["permissions", "Roles & Permissions", ShieldCheck],
  ["teams", "Assigned Teams", Users],
  ["login", "Login Activity", Activity],
  ["devices", "Device Sessions", MonitorSmartphone],
  ["notifications", "Notifications", Bell],
  ["documents", "Documents", FileText],
  ["notes", "Notes", StickyNote],
];

const columnDefs = [
  ["avatar", "Profile"],
  ["employee_id", "User ID"],
  ["name", "User Name"],
  ["email", "Email ID"],
  ["mobile", "Mobile Number"],
  ["role", "Role"],
  ["department", "Department"],
  ["senior", "Senior / Parent User"],
  ["team", "Team Members Under Them"],
  ["company_ids", "Assigned Companies"],
  ["last_login", "Last Login"],
  ["status", "Status"],
];

const defaultVisible = columnDefs.map(([key]) => key);

function initials(name = "User") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function splitName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}

function roleTone(name = "") {
  const lower = name.toLowerCase();
  if (lower.includes("admin")) return "blue";
  if (lower.includes("manager")) return "purple";
  if (lower.includes("support")) return "orange";
  return "green";
}

function parentIdOf(user) {
  return user.parent_id ?? null;
}

function imageOf(user) {
  return user.profile_image_url || user.profile_image || user.image_url || user.avatar_url || "";
}

function wouldCreateCycle(users, userId, parentId) {
  if (!userId || !parentId) return false;
  let currentId = Number(parentId);
  const parentById = new Map(users.map((user) => [user.id, parentIdOf(user)]));
  const seen = new Set();
  while (currentId) {
    if (currentId === userId || seen.has(currentId)) return true;
    seen.add(currentId);
    currentId = parentById.get(currentId);
  }
  return false;
}

function descendantsOf(users, userId) {
  if (!userId) return new Set();
  const childrenByParent = new Map();
  users.forEach((user) => {
    const parentId = parentIdOf(user);
    if (!parentId) return;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), user.id]);
  });
  const descendants = new Set();
  const stack = [...(childrenByParent.get(userId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (descendants.has(id)) continue;
    descendants.add(id);
    stack.push(...(childrenByParent.get(id) || []));
  }
  return descendants;
}

function flattenHierarchy(users) {
  const childrenByParent = new Map();
  const userIds = new Set(users.map((user) => user.id));
  users.forEach((user) => {
    const parentId = parentIdOf(user);
    const key = parentId && userIds.has(parentId) && parentId !== user.id ? parentId : null;
    childrenByParent.set(key, [...(childrenByParent.get(key) || []), user]);
  });

  const rows = [];
  const visited = new Set();
  const visit = (user, depth = 0) => {
    if (visited.has(user.id)) return;
    visited.add(user.id);
    rows.push({ user, depth });
    (childrenByParent.get(user.id) || []).forEach((child) => visit(child, depth + 1));
  };
  (childrenByParent.get(null) || []).forEach((user) => visit(user));
  users.forEach((user) => visit(user));
  return rows;
}

function collectTeamMembers(userId, childrenByParent) {
  const members = [];
  const stack = [...(childrenByParent.get(userId) || [])];
  while (stack.length) {
    const member = stack.shift();
    members.push(member);
    stack.unshift(...(childrenByParent.get(member.id) || []));
  }
  return members;
}

function buildUser(user, index, usersById, childrenByParent, employeeIdById, depth = 0) {
  const roleName = user.role_name || "Team Member";
  const parent = usersById.get(parentIdOf(user));
  const teamMembers = collectTeamMembers(user.id, childrenByParent);
  const designations = ["Sales Director", "Sales Manager", "Sales Executive", "Support Manager", "Support Executive", "Operations Lead"];
  const departments = ["Sales", "Sales", "Sales", "Support", "Support", "Operations"];
  const { first_name, last_name } = splitName(user.name);
  return {
    ...user,
    first_name,
    last_name,
    employee_id: `USR-${String(1001 + index).padStart(4, "0")}`,
    mobile: user.mobile || `+91 98${String(70000000 + index * 13791).slice(0, 8)}`,
    designation: user.designation || designations[index % designations.length],
    department: user.department || departments[index % departments.length],
    parent_id: parentIdOf(user),
    senior_name: parent?.name || "Top Level",
    senior_id_text: parent ? employeeIdById.get(parent.id) : "",
    team_count: teamMembers.length,
    team_members: teamMembers,
    role_name: roleName,
    hierarchy_depth: depth,
    last_login: index % 3 === 0 ? "Today, 09:34 AM" : index % 3 === 1 ? "Yesterday, 06:12 PM" : "May 12, 2026",
    status: user.is_active ? "Active" : "Inactive",
    online: user.is_active && index % 2 === 0,
    profile_image_url: imageOf(user),
    avatarColor: ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c"][index % 5],
  };
}

function Avatar({ user, size = "", className = "" }) {
  return (
    <span className={`crm-avatar ${size} ${className}`.trim()} style={{ background: user.avatarColor }}>
      {user.profile_image_url ? <img src={assetUrl(user.profile_image_url)} alt="" /> : initials(user.name)}
    </span>
  );
}

function userFormData(form, parentId, avatarFile, removeImage) {
  const data = new FormData();
  data.append("name", form.name);
  data.append("email", form.email);
  data.append("role_id", String(Number(form.role_id) || ""));
  data.append("parent_id", String(parentId || ""));
  data.append("is_active", String(form.is_active));
  data.append("remove_image", String(removeImage));
  data.append("company_ids", form.company_ids || "");
  if (form.password) data.append("password", form.password);
  if (avatarFile) data.append("profile_image", avatarFile);
  return data;
}

function exportRows(rows) {
  const headers = ["User ID", "Name", "Email", "Mobile", "Designation", "Department", "Role", "Status"];
  const lines = rows.map((row) =>
    [row.employee_id, row.name, row.email, row.mobile, row.designation, row.department, row.role_name, row.status]
      .map((value) => `"${String(value || "").replaceAll('"', '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "users.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function UsersPage() {
  const notify = useNotify();
  const users = useLoad(() => api.users({ include_inactive: true }));
  const roles = useLoad(() => api.roles());
  const ourCompanies = useLoad(() => api.ourCompanies(), []);
  const rawUsers = users.data || [];
  const enriched = useMemo(() => {
    const usersById = new Map(rawUsers.map((user) => [user.id, user]));
    const childrenByParent = new Map();
    rawUsers.forEach((user) => {
      const parentId = parentIdOf(user);
      if (!parentId || parentId === user.id || !usersById.has(parentId)) return;
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), user]);
    });
    const hierarchyRows = flattenHierarchy(rawUsers);
    const employeeIdById = new Map(hierarchyRows.map(({ user }, index) => [user.id, `USR-${String(1001 + index).padStart(4, "0")}`]));
    return hierarchyRows.map(({ user, depth }, index) => buildUser(user, index, usersById, childrenByParent, employeeIdById, depth));
  }, [rawUsers]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState([]);
  const [visible, setVisible] = useState(defaultVisible);
  const [showColumns, setShowColumns] = useState(false);
  const [expandedTree, setExpandedTree] = useState({ root: true });
  const [detailUser, setDetailUser] = useState(null);
  const [detailTab, setDetailTab] = useState("basic");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [dirty, setDirty] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const matchedIds = new Set();
    const byId = new Map(enriched.map((user) => [user.id, user]));
    enriched.forEach((user) => {
      const matchesText = !text || [user.name, user.email, user.employee_id, user.mobile, user.department, user.role_name].some((value) => String(value || "").toLowerCase().includes(text));
      const matchesRole = !roleFilter || user.role_name === roleFilter;
      const matchesStatus = !status || user.status === status;
      if (!(matchesText && matchesRole && matchesStatus)) return;
      matchedIds.add(user.id);
      let parentId = user.parent_id;
      while (parentId && byId.has(parentId)) {
        matchedIds.add(parentId);
        parentId = byId.get(parentId).parent_id;
      }
    });
    return enriched.filter((user) => matchedIds.has(user.id));
  }, [enriched, query, roleFilter, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const designations = [...new Set(enriched.map((user) => user.designation))];
  const roleNames = [...new Set(enriched.map((user) => user.role_name).filter(Boolean))];
  const roleOptions = roles.data || [];
  const departments = [...new Set(enriched.map((user) => user.department))];
  const selectedRows = enriched.filter((user) => selected.includes(user.id));
  const selectedAll = pageRows.length > 0 && pageRows.every((user) => selected.includes(user.id));
  const emailExists = form.email && rawUsers.some((user) => user.email.toLowerCase() === form.email.toLowerCase() && user.id !== editingId);
  const blockedParentIds = descendantsOf(rawUsers, editingId);
  if (editingId) blockedParentIds.add(editingId);
  const parentOptions = enriched.filter((user) => !blockedParentIds.has(user.id));
  const companyOptions = useMemo(() => {
    return (ourCompanies.data || []).map((c) => ({
      value: String(c.id),
      label: c.name
    }));
  }, [ourCompanies.data]);

  const setField = (key, value) => {
    setDirty(true);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "first_name" || key === "last_name") next.name = `${key === "first_name" ? value : next.first_name} ${key === "last_name" ? value : next.last_name}`.trim();
      return next;
    });
  };

  const closeModal = () => {
    if (dirty && !window.confirm("Unsaved changes. Close form?")) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(blankForm);
    setDirty(false);
    setAvatarPreview("");
    setAvatarFile(null);
    setRemoveImage(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...blankForm, email: "", joining_date: new Date().toISOString().slice(0, 10), company_ids: "" });
    setDirty(false);
    setAvatarPreview("");
    setAvatarFile(null);
    setRemoveImage(false);
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({
      ...blankForm,
      first_name: user.first_name,
      last_name: user.last_name,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      designation: user.designation,
      department: user.department,
      role_id: user.role_id || "",
      senior_id: user.parent_id || "",
      profile_image_url: user.profile_image_url || "",
      is_active: user.is_active,
      joining_date: "2026-05-01",
      company_ids: user.company_ids || "",
    });
    setDirty(false);
    setAvatarPreview(assetUrl(user.profile_image_url) || "");
    setAvatarFile(null);
    setRemoveImage(false);
    setModalOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (emailExists) return notify("Email already exists");
    const parentId = Number(form.senior_id) || null;
    if (editingId && parentId === editingId) return notify("User cannot be their own parent");
    if (wouldCreateCycle(rawUsers, editingId, parentId)) return notify("Circular hierarchy detected");
    if (!editingId && form.password.length < 6) return notify("Password must be at least 6 characters");
    if (form.confirm_password && form.password !== form.confirm_password) return notify("Password and confirm password must match");
    const payload = userFormData(form, parentId, avatarFile, removeImage);
    editingId ? await api.updateUser(editingId, payload) : await api.createUser(payload);
    notify(editingId ? "User updated" : "User created", "success");
    setDirty(false);
    setModalOpen(false);
    setEditingId(null);
    setForm(blankForm);
    setAvatarFile(null);
    setRemoveImage(false);
    users.reload();
  };

  const handleAvatar = (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) return notify("Profile image must be JPG, PNG, GIF, or WEBP");
    if (file.size > 2 * 1024 * 1024) return notify("Profile image must be 2MB or smaller");
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width < 120 || image.height < 120 || image.width > 2000 || image.height > 2000) {
        URL.revokeObjectURL(previewUrl);
        notify("Profile image must be between 120x120 and 2000x2000 pixels");
        return;
      }
      setDirty(true);
      setAvatarFile(file);
      setRemoveImage(false);
      setAvatarPreview(previewUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      notify("Profile image could not be read");
    };
    image.src = previewUrl;
  };

  const clearAvatar = () => {
    setDirty(true);
    setAvatarFile(null);
    setAvatarPreview("");
    setRemoveImage(true);
  };

  const renderCell = (user, key) => {
    if (key === "avatar") {
      return (
        <div className="crm-avatar-cell">
          <Avatar user={user} />
          <span className={`crm-presence ${user.online ? "online" : ""}`} />
        </div>
      );
    }
    if (key === "name") return <button className="crm-link" onClick={() => { setDetailUser(user); setDetailTab("basic"); }}>{user.name}</button>;
    if (key === "designation") return <span className={`crm-pill ${roleTone(user.designation)}`}>{user.designation}</span>;
    if (key === "senior") return <div><strong>{user.senior_name}</strong><small>{user.senior_id_text || "Top Level"}</small></div>;
    if (key === "team") {
      if (!user.team_count) return <span className="muted">-</span>;
      return (
        <div className="crm-stack-avatars">
          {user.team_members.slice(0, 4).map((member) => <Avatar key={member.id} user={{ ...member, profile_image_url: imageOf(member), avatarColor: user.avatarColor }} />)}
          {user.team_count > 4 && <b>+{user.team_count - 4}</b>}
        </div>
      );
    }
    if (key === "role") return <span className="crm-role-chip">{user.role_name}</span>;
    if (key === "status") return <span className={`crm-status ${user.status.toLowerCase()}`}>{user.status}</span>;
    if (key === "company_ids") {
      if (!user.company_ids) return <span className="muted">-</span>;
      const ids = user.company_ids.split(",");
      const names = ids.map(id => {
        const comp = (ourCompanies.data || []).find(c => String(c.id) === String(id));
        return comp ? comp.name : null;
      }).filter(Boolean);
      if (names.length === 0) return <span className="muted">-</span>;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {names.map((name, i) => (
            <span key={i} className="crm-role-chip" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", fontSize: "11px" }}>
              {name}
            </span>
          ))}
        </div>
      );
    }
    return user[key] || "-";
  };

  if (modalOpen) {
    return (
      <div className="crm-page user-form-screen">
        <form className="crm-user-form compact-user-form inline-user-form" onSubmit={save}>
          <div className="modal-head">
            <div><h2>{editingId ? "Edit User" : "Add User"}</h2><p className="muted">Users / {editingId ? "Edit User" : "Add User"}</p></div>
          </div>
          <div className="crm-form-shell">
            <div className="crm-photo-panel">
              <label>Profile Picture</label>
              <div className="crm-photo-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handleAvatar(event.dataTransfer.files?.[0]); }}>
                {avatarPreview ? <img src={avatarPreview} alt="Profile preview" /> : <span className="crm-photo-initials">{initials(form.name || "System Admin")}</span>}
                <label className="crm-photo-edit"><Camera size={14} /><input type="file" accept="image/*" onChange={(event) => handleAvatar(event.target.files?.[0])} /></label>
              </div>
              <label className="crm-upload-button">Upload Photo<input type="file" accept="image/*" onChange={(event) => handleAvatar(event.target.files?.[0])} /></label>
              {avatarPreview && <button type="button" className="secondary" onClick={clearAvatar}>Remove Photo</button>}
              <small>JPG, PNG or GIF. Max size 2MB.</small>
            </div>
            <main className="crm-form-grid">
              <label>User ID *<input value={editingId ? `USR-${String(1000 + editingId).padStart(4, "0")}` : "USR-AUTO"} disabled /></label>
              <label>User Name *<input required className={form.name && form.name.length < 3 ? "invalid" : ""} value={form.name} onChange={(e) => setField("name", e.target.value)} /></label>
              <label>Email ID *<input required type="email" className={emailExists ? "invalid" : ""} value={form.email} onChange={(e) => setField("email", e.target.value)} />{emailExists && <small className="error">Email already exists</small>}</label>
              <label>Password *<input type="password" required={!editingId} placeholder={editingId ? "Leave blank to keep password" : "Password"} value={form.password} onChange={(e) => setField("password", e.target.value)} /></label>
              <label>Role<select value={form.role_id} onChange={(e) => setField("role_id", e.target.value)}><option value="">No role</option>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label>Senior / Parent User<select value={form.senior_id} onChange={(e) => setField("senior_id", e.target.value)}><option value="">Top Level</option>{parentOptions.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.employee_id})</option>)}</select></label>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: "6px" }}>Assigned Companies</label>
                <MultiSelect
                  options={companyOptions}
                  value={form.company_ids ? form.company_ids.split(",") : []}
                  onChange={(selected) => setField("company_ids", selected.join(","))}
                  placeholder="Select Companies"
                />
              </div>
              <label className="crm-toggle-row"><span>Status *</span><span className="status-control"><input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /><b>Active</b></span></label>
            </main>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
            <button><Save size={15} /> Save User</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="crm-page">
      <section className="user-management-view">
        <div className="user-view-head">
          <div>
            <h1>User Management</h1>
            <p>Manage your organization users and their hierarchy.</p>
          </div>
          <button className="icon-button" onClick={openCreate}><Plus size={15} /> Add User</button>
        </div>

        <div className="user-filter-row">
          <label><Search size={14} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search users by name, email or ID..." /></label>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}><option value="">All Roles</option>{roleNames.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All Status</option><option>Active</option><option>Inactive</option></select>
          <button className="secondary" onClick={() => { setQuery(""); setRoleFilter(""); setStatus(""); setPage(1); }}>Reset</button>
        </div>

        <div className="user-grid-card">
          <table className="user-view-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>User Name</th>
                <th>Email ID</th>
                <th>Role</th>
                <th>Senior / Parent User</th>
                <th>Team Members Under Them</th>
                <th>Assigned Companies</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((user, index) => (
                <tr key={user.id}>
                  <td><span className={user.parent_id ? "user-tree-id" : ""} style={user.parent_id ? { "--tree-indent": `${user.hierarchy_depth * 28}px` } : undefined}>{user.employee_id}</span></td>
                  <td>
                    <button className="user-name-cell" onClick={() => { setDetailUser(user); setDetailTab("basic"); }}>
                      <Avatar user={user} size="small" />
                      <strong>{user.name}</strong>
                    </button>
                  </td>
                  <td>{user.email}</td>
                  <td>{renderCell(user, "role")}</td>
                  <td><div className="user-parent-cell"><strong>{user.senior_name}</strong><small>{user.senior_id_text || "Top Level"}</small></div></td>
                  <td>{renderCell(user, "team")}</td>
                  <td>{renderCell(user, "company_ids")}</td>
                  <td>{renderCell(user, "status")}</td>
                  <td>
                    <div className="user-grid-actions">
                      <button title="View" aria-label="View user" onClick={() => setDetailUser(user)}><Eye size={15} /></button>
                      <button title="Edit" aria-label="Edit user" onClick={() => openEdit(user)}><Pencil size={15} /></button>
                      <button title={user.is_active ? "Deactivate" : "Activate"} aria-label={user.is_active ? "Deactivate user" : "Activate user"} className={user.is_active ? "danger" : "success"} onClick={async () => { const data = new FormData(); data.append("name", user.name); data.append("email", user.email); data.append("role_id", String(user.role_id || "")); data.append("parent_id", String(user.parent_id || "")); data.append("is_active", String(!user.is_active)); await api.updateUser(user.id, data); users.reload(); }}>
                        {user.is_active ? <Trash2 size={15} /> : <ShieldCheck size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalRows={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          pageSizeOptions={[8, 15, 25, 50]}
        />

      </section>

      {detailUser && (
        <div className="modal-backdrop">
          <div className="modal wide crm-detail-modal">
            <div className="modal-head">
              <div className="crm-profile-head">
                <Avatar user={detailUser} size="xl" />
                <div><h2>{detailUser.name}</h2><p>{detailUser.role_name} - {detailUser.department}</p></div>
                <span className={`crm-status ${detailUser.status.toLowerCase()}`}>{detailUser.status}</span>
              </div>
              <button className="ghost" onClick={() => setDetailUser(null)}><X size={18} /></button>
            </div>
            <div className="crm-tabs">
              {tabs.map(([key, label, Icon]) => <button key={key} className={detailTab === key ? "active" : ""} onClick={() => setDetailTab(key)}><Icon size={15} />{label}</button>)}
            </div>
            <div className="crm-tab-panel">
              {detailTab === "basic" && (
                <div className="crm-detail-grid">
                  <span>Email<strong>{detailUser.email}</strong></span>
                  <span>Mobile<strong>{detailUser.mobile}</strong></span>
                  <span>Manager<strong>{detailUser.senior_name}</strong></span>
                  <span>Last Login<strong>{detailUser.last_login}</strong></span>
                  <span style={{ gridColumn: "span 2" }}>
                    Assigned Companies
                    <strong style={{ display: "block", marginTop: "4px" }}>
                      {detailUser.company_ids ? (
                        detailUser.company_ids.split(",").map(id => {
                          const comp = (ourCompanies.data || []).find(c => String(c.id) === String(id));
                          return comp ? comp.name : null;
                        }).filter(Boolean).join(", ") || "-"
                      ) : "-"}
                    </strong>
                  </span>
                </div>
              )}
              {detailTab === "permissions" && <p><ShieldCheck size={16} /> Role: <strong>{detailUser.role_name}</strong>. Clone permissions and role matrix available in Role Management.</p>}
              {detailTab === "teams" && <p><Users size={16} /> Assigned to {detailUser.department}. {detailUser.team_count} team members under this user.</p>}
              {detailTab === "login" && <ul><li>Today 09:34 AM - Web login</li><li>Yesterday 06:12 PM - Password verified</li></ul>}
              {detailTab === "devices" && <ul><li>Chrome on Windows - Active</li><li>Mobile browser - Last used May 12</li></ul>}
              {detailTab === "notifications" && <p>Email, system, and security notifications enabled.</p>}
              {detailTab === "documents" && <p>No documents uploaded.</p>}
              {detailTab === "notes" && <p>No notes added for this user.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
