import { Building2, ClipboardList, LayoutDashboard, ListTree, Shield, Users, Sparkles } from "lucide-react";

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
    key: "operations",
    label: "Operations",
    icon: ClipboardList,
    children: [
      { key: "requirements", label: "Requirements", icon: ClipboardList, page: "requirements", permission: "requirement.view" },
    ],
  },
];

export const flatNavigation = navigation.flatMap((item) => item.children || [item]);
