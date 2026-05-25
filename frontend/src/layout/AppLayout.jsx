import React, { useEffect, useMemo, useState } from "react";
import { ChevronsLeft, ChevronRight, Clock, Coffee, LogOut, Play } from "lucide-react";
import { api, assetUrl } from "../api";
import salvinLogo from "../assets/salvin_logo.png";
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
import { InquiriesPage } from "../pages/InquiriesPage";
import { RequirementsPage } from "../pages/RequirementsPage";
import { TimeTrackingPage } from "../pages/TimeTrackingPage";
import { NotificationBell } from "../components/NotificationBell";

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
  inquiries: InquiriesPage,
  requirements: RequirementsPage,
  "my-time": (props) => <TimeTrackingPage {...props} mode="my" />,
  "user-time": (props) => <TimeTrackingPage {...props} mode="users" />,
};

function secondsToLabel(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function liveTimeSeconds(timeLog) {
  if (!timeLog?.login_at) return 0;
  const now = Date.now();
  const loginAt = new Date(timeLog.login_at).getTime();
  const activeBreakStart = timeLog.active_break_start ? new Date(timeLog.active_break_start).getTime() : null;
  const activeBreakSeconds = activeBreakStart ? Math.max(0, Math.floor((now - activeBreakStart) / 1000)) : 0;
  const gross = Math.max(0, Math.floor((now - loginAt) / 1000));
  return Math.max(0, gross - Number(timeLog.total_break_seconds || 0) - activeBreakSeconds);
}

export function AppLayout({ page, setPage }) {
  const { user, logout } = useAuth();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [timeLog, setTimeLog] = useState(null);
  const [timeTick, setTimeTick] = useState(0);
  const canUseTime = user.permissions.some((permission) => ["time.view", "time.break", "time.manage"].includes(permission));
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
  useEffect(() => {
    if (!canUseTime) return;
    let cancelled = false;
    const loadToday = () => {
      api.todayTime()
        .then((data) => { if (!cancelled) setTimeLog(data); })
        .catch(() => {});
    };
    loadToday();
    const refreshId = window.setInterval(loadToday, 30000);
    const tickId = window.setInterval(() => setTimeTick((current) => current + 1), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
    };
  }, [canUseTime]);
  const toggleGroup = (key) => {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  };
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const startBreak = async () => setTimeLog(await api.startBreak());
  const endBreak = async () => setTimeLog(await api.endBreak());
  const breakSeconds = timeLog?.active_break_start
    ? Math.max(0, Math.floor((Date.now() - new Date(timeLog.active_break_start).getTime()) / 1000))
    : 0;
  const workSeconds = liveTimeSeconds(timeLog) + (timeTick * 0);

  return (
    <div className={`app ${navCollapsed ? "nav-collapsed" : ""}`}>
      <aside>
        <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", justifyContent: navCollapsed ? "center" : "flex-start", padding: navCollapsed ? "0" : "0 18px", overflow: "hidden" }}>
          {navCollapsed ? (
            <span style={{ fontSize: "14px", fontWeight: "800", color: "#f5f8fb" }}>SI</span>
          ) : (
            <img src={salvinLogo} alt="Salvin Industries" style={{ height: "30px", maxWidth: "100%", objectFit: "contain" }} />
          )}
        </div>
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
            {canUseTime && timeLog && (
              <div className="time-chip" title="Today work time">
                <Clock size={15} />
                <span>{secondsToLabel(workSeconds)}</span>
              </div>
            )}
            {canUseTime && timeLog?.status === "on_break" ? (
              <button type="button" className="break-button active" onClick={endBreak}>
                <Play size={15} /> Back to Work
              </button>
            ) : canUseTime ? (
              <button type="button" className="break-button" onClick={startBreak}>
                <Coffee size={15} /> Go to Break
              </button>
            ) : null}
            <NotificationBell onNavigateToRequirements={() => setPage("requirements")} />
            <div className="user-chip">
              {user.profile_image_url ? (
                <img src={assetUrl(user.profile_image_url)} alt={user.name} className="avatar" style={{ objectFit: 'cover' }} />
              ) : (
                <span className="avatar">{initials}</span>
              )}
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
        {canUseTime && timeLog?.status === "on_break" && (
          <div className="break-screen">
            <div className="break-panel">
              <Coffee size={38} />
              <h2>On Break</h2>
              <p>{secondsToLabel(breakSeconds)}</p>
              <button type="button" className="icon-button" onClick={endBreak}>
                <Play size={16} /> Back to Work
              </button>
            </div>
          </div>
        )}
      </section>
      <style dangerouslySetInnerHTML={{ __html: `
        .time-chip, .break-button {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border-radius: 8px;
          border: 1px solid #d9e2ec;
          background: #ffffff;
          color: #0f172a;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 800;
        }
        .break-button { cursor: pointer; color: #176b5b; border-color: #badbd4; }
        .break-button.active { color: #92400e; border-color: #fcd34d; background: #fffbeb; }
        .break-screen {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(6, 17, 15, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .break-panel {
          width: min(420px, 100%);
          min-height: 280px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid #dbe7e4;
          box-shadow: 0 24px 80px rgba(0,0,0,0.35);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          color: #176b5b;
        }
        .break-panel h2 { margin: 0; font-size: 26px; color: #0f172a; }
        .break-panel p { margin: 0 0 8px; font-size: 42px; line-height: 1; font-weight: 900; color: #0f766e; font-variant-numeric: tabular-nums; }
      ` }} />
    </div>
  );
}
