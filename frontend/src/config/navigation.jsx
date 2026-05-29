import { Building2, ClipboardList, Clock, LayoutDashboard, ListTree, Shield, Users, Sparkles } from "lucide-react";

export const navigation = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard", permission: "dashboard.view" },
  {
    key: "user-management",
    label: "User Management",
    icon: Users,
    children: [
      { key: "users", label: "User", icon: Users, page: "users", permission: "users.manage" },
      { key: "roles", label: "Role", icon: Shield, page: "roles", permission: "roles.manage" },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    icon: Users,
    children: [
      { key: "show-companies", label: "Show Companies", icon: Building2, page: "companies", permission: "companies.view" },
      { key: "add-companies", label: "Add Companies", icon: Building2, page: "add-company", permission: "companies.manage" },
      { key: "assign-leads", label: "Assign Company", icon: Users, page: "assign-leads", permission: "leads.assign" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Users,
    children: [
      { key: "my-leads", label: "My Leads", icon: Users, page: "my-leads", permission: "leads.my" },
      { key: "today-followup", label: "Follow up", icon: Building2, page: "today-followup", permission: "leads.followup" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    icon: Sparkles,
    children: [
      { key: "inquiries", label: "Inquiries", icon: Sparkles, page: "inquiries", permission: "inquiry.view" },
    ],
  },
  { key: "properties", label: "Properties", icon: ListTree, page: "properties", permission: "properties.view" },
  {
    key: "time",
    label: "Time Tracking",
    icon: Clock,
    children: [
      { key: "my-time", label: "My Time", icon: Clock, page: "my-time", permission: "time.view", alternatePermission: "time.break" },
      { key: "user-time", label: "User Time", icon: Users, page: "user-time", permission: "time.manage" },
      { key: "hourly-reports", label: "Hourly Reports", icon: Clock, page: "hourly-reports", permission: "time.view" },
      { key: "team-reports", label: "Team Reports", icon: Users, page: "team-reports", permission: "time.manage" },
    ],
  },
  {
    key: "staff-management",
    label: "Staff Management",
    icon: Users,
    children: [
      { key: "tasks", label: "Tasks", icon: ClipboardList, page: "tasks", permission: "tasks.view" },
      { key: "staff-report", label: "Staff Report", icon: ClipboardList, page: "staff-report", permission: "tasks.report" },
    ],
  },
];

export const flatNavigation = navigation.flatMap((item) => item.children || [item]);
