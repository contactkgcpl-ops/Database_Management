import React from "react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";

export function DashboardPage() {
  const companies = useLoad(() => api.companies());

  return (
    <div className="grid stats">
      <div className="panel"><span>Companies</span><strong>{companies.data.length}</strong></div>
    </div>
  );
}
