import { Building2, LayoutDashboard, ListTree, Shield, Users } from "lucide-react";

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
      { key: "assign-leads", label: "Assign Leads", icon: Users, page: "assign-leads", permission: "leads.assign" },
      { key: "my-leads", label: "My Leads", icon: Users, page: "my-leads", permission: "leads.my" },
      { key: "today-followup", label: "Today Followup", icon: Building2, page: "today-followup", permission: "leads.followup" },
    ],
  },
  { key: "properties", label: "Properties", icon: ListTree, page: "properties", permission: "properties.view" },
];

export const flatNavigation = navigation.flatMap((item) => item.children || [item]);
