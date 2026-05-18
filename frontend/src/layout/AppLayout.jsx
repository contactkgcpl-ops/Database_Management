import React, { useEffect, useMemo, useState } from "react";
import { Bell, ChevronsLeft, ChevronRight, LogOut, Mail, Sparkles } from "lucide-react";
import { flatNavigation, navigation } from "../config/navigation";
import { useAuth } from "../context/AuthContext";
import { AddCompanyPage } from "../pages/AddCompanyPage";
import { AssignLeadsPage } from "../pages/AssignLeadsPage";
import { CompaniesPage } from "../pages/CompaniesPage";
import { ImportCompaniesPage } from "../pages/ImportCompaniesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { PropertiesPage } from "../pages/PropertiesPage";
import { RolesPage } from "../pages/RolesPage";
import { UsersPage } from "../pages/UsersPage";
import { MyLeadsPage } from "../pages/MyLeadsPage";
import { FollowUpsPage } from "../pages/FollowUpsPage";

const pageMap = {
  dashboard: DashboardPage,
  users: UsersPage,
  roles: RolesPage,
  properties: PropertiesPage,
  companies: CompaniesPage,
  "add-company": AddCompanyPage,
  "import-companies": ImportCompaniesPage,
  "assign-leads": AssignLeadsPage,
  "my-leads": MyLeadsPage,
  "today-followup": FollowUpsPage,
};

export function AppLayout({ page, setPage }) {
  const { user, logout } = useAuth();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [editingId, setEditingId] = useState(null);
  const canOpen = (item) => user.permissions.includes(item.permission) || user.permissions.includes(item.alternatePermission);
  const allowed = useMemo(() => {
    return navigation
      .map((item) => item.children ? { ...item, children: item.children.filter(canOpen) } : item)
      .filter((item) => item.children ? item.children.length : canOpen(item));
  }, [user.permissions]);
  const CurrentPage = pageMap[page] || DashboardPage;
  const pageLabel = page === "add-company" ? "Add Company" :
    page === "import-companies" ? "Import Companies" :
      (flatNavigation.find((item) => item.page === page)?.label || "Dashboard");
  useEffect(() => {
    const activeGroup = allowed.find((item) => item.children?.some((child) => child.page === page));
    if (activeGroup) {
      setOpenGroups((current) => current[activeGroup.key] ? current : { ...current, [activeGroup.key]: true });
    }
  }, [allowed, page]);
  const toggleGroup = (key) => {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  };
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`app ${navCollapsed ? "nav-collapsed" : ""}`}>
      <aside>
        <div className="sidebar-brand">ERP</div>
        <nav className="sidebar-nav">
          {allowed.map((item) => {
            const Icon = item.icon;
            if (item.children) {
              const isActive = item.children.some((child) => child.page === page);
              const isOpen = openGroups[item.key] ?? isActive;
              return (
                <div className={`nav-group ${isOpen ? "open" : ""}`} key={item.key}>
                  <button type="button" className="nav-group-title" title={item.label} onClick={() => toggleGroup(item.key)} aria-expanded={isOpen}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <ChevronRight size={15} />
                  </button>
                  {isOpen && (
                    <div className="nav-children">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        return (
                          <button className={page === child.page ? "active" : ""} key={child.key} onClick={() => setPage(child.page)} title={child.label}>
                            <ChildIcon size={15} />
                            <span>{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button className={page === item.page ? "active" : ""} key={item.key} onClick={() => setPage(item.page)} title={item.label}>
                <Icon size={16} />
                <span>{item.label}</span>
                <ChevronRight size={15} />
              </button>
            );
          })}
          <button onClick={logout} title="Logout"><LogOut size={16} /><span>Logout</span><ChevronRight size={15} /></button>
        </nav>
        <button type="button" className="sidebar-footer" onClick={() => setNavCollapsed((current) => !current)} title={navCollapsed ? "Open menu" : "Close menu"}>
          <ChevronsLeft size={18} />
          <span>ver 1.0.0</span>
        </button>
      </aside>
      <section className="workspace">
        <header>
          <div className="page-chip">{pageLabel}</div>
          <div className="topbar-actions">
            <button type="button" className="upgrade-button">
              <Sparkles size={16} />
              Upgrade plan
            </button>
            <button type="button" className="topbar-icon" aria-label="Messages"><Mail size={20} /></button>
            <button type="button" className="topbar-icon notification-dot" aria-label="Notifications"><Bell size={20} /></button>
            <div className="user-chip">
              <span className="avatar">{initials}</span>
              <strong>{user.name}</strong>
            </div>
          </div>
        </header>
        <CurrentPage
          onBack={() => { setPage("companies"); setEditingId(null); }}
          setPage={setPage}
          editingId={editingId}
          setEditingId={setEditingId}
        />
      </section>
    </div>
  );
}
