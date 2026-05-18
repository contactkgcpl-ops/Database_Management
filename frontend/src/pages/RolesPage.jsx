import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  LockKeyhole,
  Plus,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";

const emptyRole = {
  name: "",
  code: "",
  description: "",
  priority: 10,
  parent_role_id: "",
  is_active: true,
  permission_ids: [],
};

function codeFromName(name = "") {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function groupPermissions(items) {
  const groups = {};
  items.forEach((permission) => {
    const key = permission.menu_key || "general";
    if (!groups[key]) groups[key] = { key, label: permission.menu_label || "General", permissions: [] };
    groups[key].permissions.push(permission);
  });
  return Object.values(groups);
}

function actionType(permission) {
  const text = `${permission.key || ""} ${permission.label || ""}`.toLowerCase();
  if (text.includes("delete") || text.includes("remove")) return "delete";
  if (text.includes("edit") || text.includes("update") || text.includes("assign") || text.includes("close")) return "edit";
  if (text.includes("add") || text.includes("create") || text.includes("import")) return "add";
  if (text.includes("manage") || text.includes("all")) return "all";
  return "view";
}

export function RolesPage() {
  const notify = useNotify();
  const roles = useLoad(() => api.roles());
  const permissions = useLoad(() => api.permissions());
  const permissionGroups = useMemo(() => groupPermissions(permissions.data || []), [permissions.data]);
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyRole);

  const selectedRole = roles.data.find((role) => role.id === selectedId);
  const filteredRoles = roles.data.filter((role) => role.name.toLowerCase().includes(roleSearch.toLowerCase()));
  const isSystemRole = selectedRole?.name?.toLowerCase() === "admin";
  const allPermissionIds = permissions.data.map((permission) => permission.id);
  const fullAccess = allPermissionIds.length > 0 && allPermissionIds.every((id) => form.permission_ids.includes(id));

  const filteredGroups = permissionGroups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) => `${group.label} ${permission.label}`.toLowerCase().includes(permissionSearch.toLowerCase())),
    }))
    .filter((group) => group.permissions.length);

  const setRoleField = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "name") next.code = codeFromName(value);
      return next;
    });
  };

  const selectRole = (role) => {
    setSelectedId(role.id);
    setForm({
      ...emptyRole,
      name: role.name,
      code: codeFromName(role.name),
      description: role.description || "",
      permission_ids: role.permissions.map((permission) => permission.id),
    });
  };

  const newRole = () => {
    setSelectedId(null);
    setForm(emptyRole);
  };

  const duplicateRole = () => {
    setSelectedId(null);
    setForm((current) => ({ ...current, name: `${current.name || "Role"} Copy`, code: `${current.code || "role"}_copy` }));
  };

  const togglePermission = (id) => {
    setForm((current) => ({
      ...current,
      permission_ids: current.permission_ids.includes(id) ? current.permission_ids.filter((item) => item !== id) : [...current.permission_ids, id],
    }));
  };

  const toggleGroup = (group) => {
    const ids = group.permissions.map((permission) => permission.id);
    const hasAll = ids.every((id) => form.permission_ids.includes(id));
    setForm((current) => ({
      ...current,
      permission_ids: hasAll ? current.permission_ids.filter((id) => !ids.includes(id)) : [...new Set([...current.permission_ids, ...ids])],
    }));
  };

  const saveRole = async (event) => {
    event.preventDefault();
    const payload = { name: form.name, description: form.description, permission_ids: form.permission_ids };
    selectedId ? await api.updateRole(selectedId, payload) : await api.createRole(payload);
    notify(selectedId ? "Role updated" : "Role created", "success");
    roles.reload();
  };

  return (
    <div className="crm-page role-management-screen">
      <section className="role-page-head">
        <div>
          <h1>Role Management</h1>
          <p>Manage roles and permissions based on menu hierarchy.</p>
        </div>
        <button type="button" className="icon-button" onClick={newRole}><Plus size={15} /> Add Role</button>
      </section>

      <div className="crm-role-layout">
        <aside className="crm-card crm-role-sidebar">
          <h2 className="role-panel-title">Roles</h2>
          <label className="crm-search small"><Search size={15} /><input value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} placeholder="Search roles..." /></label>
          <div className="crm-role-list">
            {filteredRoles.map((role) => {
              const active = selectedId === role.id;
              const locked = role.name.toLowerCase() === "admin";
              return (
                <button key={role.id} className={active ? "active" : ""} onClick={() => selectRole(role)}>
                  {locked ? <LockKeyhole size={18} /> : <Shield size={18} />}
                  <span><strong>{role.name}</strong><small>{role.description || "Role permissions"}</small></span>
                </button>
              );
            })}
          </div>
        </aside>

        <form className="crm-card crm-role-editor" onSubmit={saveRole}>
          <div className="role-editor-head">
            <h2>Role Details</h2>
            <div className="role-head-actions">
              <button type="button" className="secondary icon-button" disabled={!form.name} onClick={duplicateRole}><Copy size={15} /> Duplicate</button>
              <button type="button" className="secondary icon-button" disabled={!selectedId || isSystemRole} onClick={async () => { await api.deleteRole(selectedId); newRole(); roles.reload(); }}><Trash2 size={15} /> Delete</button>
            </div>
          </div>

          <div className="crm-role-form-grid">
            <label>Role Name *<input required value={form.name} onChange={(e) => setRoleField("name", e.target.value)} /></label>
            <label>Role Code<input value={form.code} onChange={(e) => setRoleField("code", e.target.value)} /></label>
            <label>Description<input value={form.description} onChange={(e) => setRoleField("description", e.target.value)} /></label>
            <label>Priority Level<input type="number" value={form.priority} onChange={(e) => setRoleField("priority", e.target.value)} /></label>
            <label>Parent Role<select value={form.parent_role_id} onChange={(e) => setRoleField("parent_role_id", e.target.value)}><option value="">No parent role</option>{roles.data.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label className="crm-toggle-row"><input type="checkbox" checked={form.is_active} onChange={(e) => setRoleField("is_active", e.target.checked)} /><span>Active</span></label>
          </div>

          <section className="role-permission-title">
            <h3>Permissions (Menu / Module Based)</h3>
            <div>
              <label className="crm-toggle-row"><input type="checkbox" checked={fullAccess} onChange={() => setForm((current) => ({ ...current, permission_ids: fullAccess ? [] : allPermissionIds }))} /><span>Full access</span></label>
              <button type="button" className="link-button" onClick={() => setExpanded(Object.fromEntries(permissionGroups.map((group) => [group.key, true])))}>Expand All</button>
            </div>
          </section>
          <label className="crm-search small role-permission-search"><Search size={15} /><input value={permissionSearch} onChange={(e) => setPermissionSearch(e.target.value)} placeholder="Search permissions..." /></label>

          <div className="crm-permission-matrix" style={{ display: "block" }}>
            <div className="crm-permission-head" style={{ display: "grid", gridTemplateColumns: "1fr auto", paddingRight: "20px" }}>
               <span>Menu / Module</span>
               <span>Enable Access</span>
            </div>
            {filteredGroups.map((group) => {
              const open = expanded[group.key] ?? true;
              const ids = group.permissions.map((permission) => permission.id);
              const hasAll = ids.every((id) => form.permission_ids.includes(id));
              return (
                <div className="crm-permission-group" key={group.key}>
                  <div className="crm-permission-parent">
                    <button type="button" onClick={() => setExpanded((current) => ({ ...current, [group.key]: !open }))}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                    <label><input type="checkbox" checked={hasAll} onChange={() => toggleGroup(group)} />{group.label}</label>
                    <span>{group.permissions.length} permissions</span>
                  </div>
                  {open && group.permissions.map((permission) => {
                    const checked = form.permission_ids.includes(permission.id);
                    return (
                      <div className="crm-permission-row" key={permission.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", paddingRight: "20px" }}>
                        <span><ShieldCheck size={14} />{permission.label} <small style={{color: "#94a3b8", marginLeft: "8px", fontWeight: "normal"}}>[{permission.code}]</small></span>
                        <label>
                           <input type="checkbox" checked={checked} onChange={() => togglePermission(permission.id)} />
                        </label>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="role-save-row">
            <button className="icon-button"><Save size={16} /> Save Role</button>
          </div>
        </form>
      </div>
    </div>
  );
}
