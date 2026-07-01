import React, { useEffect, useMemo, useState, useRef } from "react";
import { ChevronsLeft, ChevronRight, Clock, Coffee, LogOut, Play, ClipboardList, Settings, MapPin, RefreshCw } from "lucide-react";
import { api, assetUrl } from "../api";
import salvinLogo from "../assets/salvin_logo.png";
import { flatNavigation, navigation } from "../config/navigation";
import { useAuth } from "../context/AuthContext";
import { AddCompanyPage } from "../pages/AddCompanyPage";
import { AssignLeadsPage } from "../pages/AssignLeadsPage";
import { CompaniesPage } from "../pages/CompaniesPage";
import { ImportCompaniesPage } from "../pages/ImportCompaniesPage";
import { BulkEditCompaniesPage } from "../pages/BulkEditCompaniesPage";
import { VendorsPage } from "../pages/VendorsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { OurCompaniesPage } from "../pages/OurCompaniesPage";
import { PropertiesPage } from "../pages/PropertiesPage";
import { RolesPage } from "../pages/RolesPage";
import { UsersPage } from "../pages/UsersPage";
import { MyLeadsPage } from "../pages/MyLeadsPage";
import { FollowUpsPage } from "../pages/FollowUpsPage";
import { InquiriesPage } from "../pages/InquiriesPage";
import { RequirementsPage } from "../pages/RequirementsPage";
import { TimeTrackingPage } from "../pages/TimeTrackingPage";
import { HourlyReportsPage } from "../pages/HourlyReportsPage";
import { TeamReportsPage } from "../pages/TeamReportsPage";
import { NotificationBell } from "../components/NotificationBell";
import { GlobalChat } from "../components/GlobalChat";
import { ApplyLeavePage } from "../pages/ApplyLeavePage";
import { MyLeavesPage } from "../pages/MyLeavesPage";
import { LeaveApprovalsPage } from "../pages/LeaveApprovalsPage";
import { LeaveCalendarPage } from "../pages/LeaveCalendarPage";
import { EmployeeAttendancePage } from "../pages/EmployeeAttendancePage";
import { ConnectionTrackingPage } from "../pages/ConnectionTrackingPage";
import { ReportsPage } from "../pages/ReportsPage";
import { StrictReportingManager } from "../components/StrictReportingManager";
import { StrictReportingSettingsPage } from "../pages/StrictReportingSettingsPage";
import { StrictComplianceLogsPage } from "../pages/StrictComplianceLogsPage";

const pageMap = {
  "strict-reporting-settings": StrictReportingSettingsPage,
  "strict-compliance-logs": StrictComplianceLogsPage,
  "connection-tracking": ConnectionTrackingPage,
  "activity-reports": ReportsPage,
  dashboard: DashboardPage,
  users: UsersPage,
  roles: RolesPage,
  properties: PropertiesPage,
  companies: CompaniesPage,
  "add-company": AddCompanyPage,
  "our-companies": OurCompaniesPage,
  "import-companies": ImportCompaniesPage,
  "bulk-edit-companies": BulkEditCompaniesPage,
  vendors: VendorsPage,
  "assign-leads": AssignLeadsPage,
  "my-leads": MyLeadsPage,
  "today-followup": FollowUpsPage,
  inquiries: InquiriesPage,
  requirements: RequirementsPage,
  "my-time": (props) => <TimeTrackingPage {...props} mode="my" />,
  "user-time": (props) => <TimeTrackingPage {...props} mode="users" />,
  "hourly-reports": HourlyReportsPage,
  "team-reports": TeamReportsPage,
  "leave-apply": ApplyLeavePage,
  "leave-my": MyLeavesPage,
  "leave-approvals": LeaveApprovalsPage,
  "leave-calendar": LeaveCalendarPage,
  "employee-attendance": EmployeeAttendancePage,
};

function secondsToLabel(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function liveTimeSeconds(timeLog, fetchTime) {
  if (!timeLog?.login_at) return 0;
  const elapsed = Math.max(0, Math.floor((Date.now() - fetchTime) / 1000));
  if (timeLog.status === "active") {
    return Number(timeLog.total_work_seconds || 0) + elapsed;
  }
  return Number(timeLog.total_work_seconds || 0);
}

export function AppLayout({ page, setPage }) {
  const { user, logout } = useAuth();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [timeLog, setTimeLog] = useState(null);
  const [fetchTime, setFetchTime] = useState(Date.now());
  const [timeTick, setTimeTick] = useState(0);
  const [lastNotifiedHour, setLastNotifiedHour] = useState(0);
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [requirementDetailId, setRequirementDetailId] = useState(null);

  const navigateToPage = (newPage) => {
    if (locationModalOpen) return;
    setTaskDetailId(null);
    setRequirementDetailId(null);
    setPage(newPage);
  };
  const canUseTime = user.permissions.some((permission) => ["time.view", "time.break", "time.manage"].includes(permission));
  const canOpen = (item) => user.permissions.includes(item.permission) || user.permissions.includes(item.alternatePermission);
  const allowed = useMemo(() => {
    return navigation
      .map((item) => item.children ? { ...item, children: item.children.filter(canOpen) } : item)
      .filter((item) => item.children ? item.children.length : canOpen(item));
  }, [user.permissions]);
  const CurrentPage = pageMap[page] || DashboardPage;
  const pageLabel = page === "add-company" ? "Add Company" :
    page === "our-companies" ? "Our Companies" :
      page === "import-companies" ? "Import Companies" :
        page === "bulk-edit-companies" ? "Bulk Edit Companies" :
          page === "vendors" ? "Vendors" :
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
        .then((data) => {
          if (!cancelled) {
            setTimeLog(data);
            setFetchTime(Date.now());
          }
        })
        .catch(() => { });
    };
    loadToday();
    
    // Poll every 5 minutes instead of every 30 seconds
    const refreshId = window.setInterval(loadToday, 300000);
    const tickId = window.setInterval(() => setTimeTick((current) => current + 1), 1000);

    // Refresh instantly when the browser window/tab is focused
    const handleFocus = () => {
      loadToday();
    };
    window.addEventListener("focus", handleFocus);

    // Listen for WebSocket-pushed time log updates
    const handleWsTimeLogUpdate = (e) => {
      if (!cancelled) {
        setTimeLog(e.detail);
        setFetchTime(Date.now());
      }
    };
    window.addEventListener("erp:timelog", handleWsTimeLogUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("erp:timelog", handleWsTimeLogUpdate);
    };
  }, [canUseTime]);

  useEffect(() => {
    if (timeLog?.status !== "active") return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    const checkNotification = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - fetchTime) / 1000));
      const total = Number(timeLog.total_work_seconds || 0) + elapsed;
      const currentHour = Math.floor(total / 3600);
      if (currentHour > 0 && currentHour > lastNotifiedHour) {
        setLastNotifiedHour(currentHour);
        if (Notification.permission === "granted") {
          const notif = new Notification("Hourly Report Reminder", {
            body: `You've been working for ${currentHour} hour(s). Please submit your hourly report.`,
          });
          notif.onclick = () => {
            window.focus();
            setPage("hourly-reports");
          };
        }
      }
    };
    const notifId = window.setInterval(checkNotification, 10000);
    return () => window.clearInterval(notifId);
  }, [timeLog, fetchTime, lastNotifiedHour, setPage]);

  const toggleGroup = (key) => {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  };
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const startBreak = async () => {
    const data = await api.startBreak();
    setTimeLog(data);
    setFetchTime(Date.now());
  };
  const endBreak = async () => {
    const data = await api.endBreak();
    setTimeLog(data);
    setFetchTime(Date.now());
  };
  const elapsedSinceFetch = Math.max(0, Math.floor((Date.now() - fetchTime) / 1000));
  const breakSeconds = timeLog?.status === "on_break"
    ? Number(timeLog.total_break_seconds || 0) + elapsedSinceFetch - Number(timeLog.total_break_seconds_without_active ?? 0)
    : 0;
  // Fallback to active_break_start if the backend doesn't provide total_break_seconds_without_active yet
  const actualBreakSeconds = breakSeconds > 0 && typeof timeLog?.total_break_seconds_without_active !== 'undefined'
    ? breakSeconds
    : (timeLog?.status === "on_break" ? elapsedSinceFetch : 0);
  const workSeconds = liveTimeSeconds(timeLog, fetchTime) + (timeTick * 0);

  const performActualLogout = async () => {
    try {
      const { has_pending } = await api.checkPendingReports();
      if (has_pending) {
        window.dispatchEvent(new CustomEvent("erp:notify", { detail: { message: "Please submit your daily reports before logging out.", type: "error" } }));
        setPage("hourly-reports");
        return;
      }
      // Stop active task timer
      await api.stopActiveTaskTimer().catch(() => { });
    } catch (err) {
      console.error(err);
    }
    localStorage.removeItem("erp_current_page");
    logout();
  };

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent("erp:request_logout"));
  };

  // Handle PWA notification click messages and custom erp:navigate events
  useEffect(() => {
    // 1. Listen for PWA service worker window messages
    if ('serviceWorker' in navigator) {
      const handleSwMessage = (event) => {
        if (event.data?.type === 'navigate' && event.data?.page) {
          setPage(event.data.page);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
  }, []);

  useEffect(() => {
    // 2. Listen for custom window erp:navigate events
    const handleNavigationEvent = (e) => {
      if (e.detail?.page) {
        setPage(e.detail.page);
      }
    };
    window.addEventListener("erp:navigate", handleNavigationEvent);
    return () => window.removeEventListener("erp:navigate", handleNavigationEvent);
  }, []);

  // 3. Check for page query parameter on mount (in case opened fresh from a new window link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPage = params.get("page");
    if (targetPage) {
      setPage(targetPage);
      // Clean query parameter from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 4. Geolocation location tracking
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [verifying, setVerifying] = useState(false);
  
  const submittingLocationRef = useRef(false);
  const lastCoordsRef = useRef({ latitude: null, longitude: null });

  const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return Infinity;
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const submitLocationWithLock = (coords) => {
    if (lastCoordsRef.current.latitude !== null) {
      const distance = haversineDistanceMeters(
        lastCoordsRef.current.latitude,
        lastCoordsRef.current.longitude,
        coords.latitude,
        coords.longitude
      );
      // Only hit the API if user has moved more than 100 meters from last sent location
      if (distance <= 100.0) {
        return Promise.resolve();
      }
    }
    
    if (submittingLocationRef.current) return Promise.resolve();
    submittingLocationRef.current = true;
    lastCoordsRef.current = coords;
    
    return api.submitLocation(coords)
      .finally(() => {
        setTimeout(() => {
          submittingLocationRef.current = false;
        }, 5000);
      });
  };

  const verifyLocation = () => {
    if (verifying) return;
    setVerifying(true);
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location tracking.");
      setVerifying(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        api.submitLocation({ latitude, longitude })
          .then(() => {
            setLocationModalOpen(false);
            setLocationError("");
            lastCoordsRef.current = { latitude, longitude };
          })
          .catch((err) => {
            console.error("Location tracking failed:", err);
            setLocationError("Failed to register location on server. Please try again.");
          })
          .finally(() => {
            setVerifying(false);
          });
      },
      (error) => {
        console.warn("Geolocation request failed:", error);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError("Still Location is Off! Please turn on location access to continue.");
        } else {
          setLocationError("Could not retrieve your location. Make sure GPS/Location service is enabled on your device.");
        }
        setVerifying(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!user) return;
    
    if (!user.need_user_location) {
      setLocationModalOpen(false);
      setLocationError("");
      return;
    }
    
    setLocationModalOpen(true);
    verifyLocation();
    
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          submitLocationWithLock({ latitude, longitude }).catch(() => {});
        },
        (error) => {
          console.warn("Geolocation watch failed:", error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
    
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user?.id]);

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
                          <button className={page === child.page ? "active" : ""} key={child.key} onClick={() => navigateToPage(child.page)} title={child.label}>
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
              <button className={page === item.page ? "active" : ""} key={item.key} onClick={() => navigateToPage(item.page)} title={item.label}>
                <Icon size={16} />
                <span>{item.label}</span>
                <ChevronRight size={15} />
              </button>
            );
          })}
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
            <button
              type="button"
              className="time-chip"
              onClick={() => window.dispatchEvent(new CustomEvent("erp:open_plan_modal"))}
              title="Today's Work Plan"
              style={{ cursor: "pointer", marginRight: "6px" }}
            >
              <ClipboardList size={14} /> Today's Plan
            </button>
            {user?.permissions?.includes("reports.config") && (
              <button
                type="button"
                className="time-chip"
                onClick={() => setPage("strict-reporting-settings")}
                title="Strict Reporting Settings"
                style={{ cursor: "pointer", marginRight: "6px" }}
              >
                <Settings size={14} />
              </button>
            )}
            <NotificationBell
              onNavigate={(dest, paramId) => {
                if (dest === "tasks") {
                  setTaskDetailId(paramId);
                  setRequirementDetailId(null);
                } else if (dest === "requirements") {
                  setRequirementDetailId(paramId);
                  setTaskDetailId(null);
                } else {
                  setTaskDetailId(null);
                  setRequirementDetailId(null);
                }
                setPage(dest);
              }}
            />
            <div className="user-chip">
              {user.profile_image_url ? (
                <img src={assetUrl(user.profile_image_url)} alt={user.name} className="avatar" style={{ objectFit: 'cover' }} />
              ) : (
                <span className="avatar">{initials}</span>
              )}
              <strong>{user.name}</strong>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <CurrentPage
          onBack={() => { navigateToPage("companies"); setEditingId(null); }}
          setPage={navigateToPage}
          editingId={editingId}
          setEditingId={setEditingId}
          taskDetailId={taskDetailId}
          setTaskDetailId={setTaskDetailId}
          requirementDetailId={requirementDetailId}
          setRequirementDetailId={setRequirementDetailId}
        />
        {canUseTime && timeLog?.status === "on_break" && (
          <div className="break-screen">
            <div className="break-panel">
              <Coffee size={38} />
              <h2>On Break</h2>
              <p>{secondsToLabel(actualBreakSeconds)}</p>
              <button type="button" className="icon-button" onClick={endBreak}>
                <Play size={16} /> Back to Work
              </button>
            </div>
          </div>
        )}
        <GlobalChat />
        <StrictReportingManager user={user} onLogout={performActualLogout} />
      </section>

      {locationModalOpen && (
        <div className="location-blocker-overlay">
          <div className="location-blocker-panel">
            <MapPin size={48} className="location-blocker-icon" />
            <h1>Location Access Required</h1>
            <p style={{ marginBottom: "16px" }}>This application requires location access to monitor compliance and clock-in attendance.</p>
            
            {locationError ? (
              <div className="location-blocker-error-box">
                <p className="error-title">⚠️ {locationError}</p>
                <div className="location-blocker-steps">
                  <p style={{ margin: "0 0 8px 0", fontWeight: "700", color: "#334155" }}>How to turn it on:</p>
                  <ol>
                    <li>Click the <b>Lock / Settings Icon</b> (🔒) in your browser address bar next to the CRM website link.</li>
                    <li>Find the <b>Location</b> setting and switch it to <b>Allow</b>.</li>
                    <li>Click <b>Verify & Continue</b> below.</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px", background: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd", color: "#0369a1", fontSize: "0.875rem", marginBottom: "20px", fontWeight: "500" }}>
                ⏳ Requesting location permission from browser. Please click "Allow" on the browser popup prompt.
              </div>
            )}
            
            <button 
              onClick={verifyLocation} 
              disabled={verifying}
              style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: "8px", 
                opacity: verifying ? 0.6 : 1, 
                cursor: verifying ? "not-allowed" : "pointer" 
              }}
            >
              <RefreshCw 
                size={15} 
                style={{ 
                  animation: verifying ? "spin 1s linear infinite" : "none" 
                }} 
              /> 
              {verifying ? "Verifying..." : "Verify & Continue"}
            </button>
            
            <button 
              type="button" 
              onClick={performActualLogout}
              style={{
                display: "block",
                margin: "18px auto 0 auto",
                background: "transparent",
                color: "#dc2626",
                border: "none",
                fontSize: "0.875rem",
                fontWeight: "700",
                cursor: "pointer",
                textDecoration: "underline",
                padding: "4px 12px"
              }}
            >
              Sign Out / Logout
            </button>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{
        __html: `
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
        
        /* Location Blocker Overlay */
        .location-blocker-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999999;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .location-blocker-panel {
          width: min(520px, 100%);
          padding: 36px;
          border-radius: 16px;
          background: #ffffff;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          text-align: center;
          color: #1e293b;
          border: 1px solid #e2e8f0;
        }
        .location-blocker-icon {
          color: #ef4444;
          margin-bottom: 20px;
          animation: pulse-pin 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-pin {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(1.1); }
        }
        .location-blocker-panel h1 {
          margin: 0 0 12px 0;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
        }
        .location-blocker-panel p {
          margin: 0 0 20px 0;
          font-size: 14.5px;
          color: #64748b;
          line-height: 1.5;
        }
        .location-blocker-steps {
          text-align: left;
          background: #f8fafc;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 24px;
          border: 1px solid #f1f5f9;
        }
        .location-blocker-steps p {
          margin: 0 0 10px 0;
          color: #334155;
          font-weight: 700;
        }
        .location-blocker-steps ol {
          margin: 0;
          padding-left: 20px;
          color: #475569;
          font-size: 13.5px;
        }
        .location-blocker-steps li {
          margin-bottom: 8px;
          line-height: 1.4;
        }
        .location-blocker-panel button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #176b5b;
          color: #ffffff;
          border: none;
          padding: 12px 28px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .location-blocker-panel button:hover {
          background: #0f5446;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .location-blocker-error-box {
          margin-bottom: 20px;
        }
        .error-title {
          color: #dc2626 !important;
          font-weight: 700 !important;
          background: #fef2f2;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #fee2e2;
          text-align: center;
          font-size: 13.5px;
          margin: 0 0 16px 0 !important;
        }
      ` }} />
    </div>
  );
}
