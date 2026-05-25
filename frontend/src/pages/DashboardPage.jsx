import React from "react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";

export function DashboardPage() {
  const stats = useLoad(() => api.dashboardStats());
  const data = stats.data || {};

  return (
    <div className="grid stats">
      <div className="panel">
        <span>Total Pending Requirement</span>
        <strong>{data.pending_requirements ?? 0}</strong>
      </div>
      <div className="panel">
        <span>Total Inquiry</span>
        <strong>{data.total_inquiries ?? 0}</strong>
      </div>
      <div className="panel">
        <span>Staff Login Today</span>
        <strong>{data.staff_logged_today ?? 0}</strong>
      </div>
    </div>
  );
}
