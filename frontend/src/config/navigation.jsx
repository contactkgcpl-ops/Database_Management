import { Building2, ClipboardList, Clock, LayoutDashboard, ListTree, Shield, Users, Sparkles, ShoppingCart, Calendar } from "lucide-react";

export const navigation = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard", permission: "dashboard.view" },
  {
    key: "user-management",
    label: "User Management",
    icon: Users,
    children: [
      { key: "users", label: "User", icon: Users, page: "users", permission: "users.manage" },
      { key: "roles", label: "Role", icon: Shield, page: "roles", permission: "roles.manage" },
      { key: "our-companies", label: "Our Companies", icon: Building2, page: "our-companies", permission: "our_companies.view" },
      { key: "properties", label: "Properties", icon: ListTree, page: "properties", permission: "properties.view" },
    ],
  },
  {
    key: "contact",
    label: "Data collection",
    icon: Users,
    children: [
      { key: "show-companies", label: "Show Companies", icon: Building2, page: "companies", permission: "companies.view" },
      { key: "add-companies", label: "Add Companies", icon: Building2, page: "add-company", permission: "companies.manage" },
    ],
  },
  {
    key: "marketing",
    label: "connection",
    icon: Users,
    children: [
      { key: "my-leads", label: "datas", icon: Users, page: "my-leads", permission: "leads.my" },
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
  {
    key: "purchase",
    label: "Purchase",
    icon: ShoppingCart,
    children: [
      { key: "vendors", label: "Vendors", icon: Users, page: "vendors", permission: "vendors.view" },
    ],
  },

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
      { key: "requirements", label: "Requirement", icon: ClipboardList, page: "requirements", permission: "requirement.view" },
    ],
  },
  {
    key: "leave-management",
    label: "Hr & Admin",
    icon: Calendar,
    children: [
      { key: "leave-my", label: "My Leaves", icon: ClipboardList, page: "leave-my", permission: "leave.view", alternatePermission: "leave.apply" },
      { key: "leave-approvals", label: "Approvals", icon: ClipboardList, page: "leave-approvals", permission: "leave.approve" },
      { key: "employee-attendance", label: "Employee Attendance", icon: ClipboardList, page: "employee-attendance", permission: "time.manage", alternatePermission: "leave.manage" },
    ],
  },
  {
    key: "tracking",
    label: "Tracking & Reporting",
    icon: ClipboardList,
    children: [
      { key: "connection-tracking", label: "Connection Tracking", icon: ClipboardList, page: "connection-tracking", permission: "tracking.view" },
      { key: "activity-reports", label: "Activity Reports", icon: ClipboardList, page: "activity-reports", permission: "reports.view" },
    ],
  },
];

export const flatNavigation = navigation.flatMap((item) => item.children || [item]);
