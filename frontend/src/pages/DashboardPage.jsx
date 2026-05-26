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

      {/* Pending Tasks by User Chart Panel */}
      <div className="panel chart-panel" style={{ gridColumn: "1 / -1", marginTop: "8px", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f2530" }}>
              Pending Tasks by User
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#687b75" }}>
              Summary of incomplete requirements assigned to each active staff member.
            </p>
          </div>
        </div>

        {(!data.pending_by_user || data.pending_by_user.length === 0) ? (
          <div className="muted" style={{ padding: "40px 20px", textAlign: "center", background: "#f8faf9", borderRadius: "8px", color: "#687b75", border: "1px dashed #dce5e2" }}>
            No pending tasks data available.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {data.pending_by_user.map((item, idx) => {
              const maxCount = Math.max(...data.pending_by_user.map(x => x.pending_count), 1);
              const percentage = (item.pending_count / maxCount) * 100;
              
              // Vibrant, highly harmonious, modern HSL color scheme
              const hue = (idx * 60) % 360;
              const barColor = `hsl(${hue}, 65%, 42%)`;
              const gradientColor = `hsl(${hue}, 70%, 52%)`;

              return (
                <div key={idx} className="chart-row" style={{ display: "grid", gridTemplateColumns: "150px 1fr 60px", alignItems: "center", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: barColor,
                      boxShadow: `0 0 8px ${barColor}`
                    }} />
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#2d3748", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.user_name}>
                      {item.user_name}
                    </span>
                  </div>
                  
                  <div style={{ height: "20px", background: "#edf2f7", borderRadius: "10px", overflow: "hidden", position: "relative", border: "1px solid #e2e8f0" }}>
                    <div 
                      className="chart-bar"
                      style={{
                        width: `${percentage}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${barColor}, ${gradientColor})`,
                        borderRadius: "10px",
                        transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        paddingRight: "8px"
                      }}
                    >
                      {percentage > 12 && (
                        <span style={{ color: "#fff", fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" }}>
                          {item.pending_count}
                        </span>
                      )}
                    </div>
                  </div>

                  <span style={{ fontSize: "13px", fontWeight: "800", color: item.pending_count > 0 ? barColor : "#a0aec0", textAlign: "right" }}>
                    {item.pending_count} {item.pending_count === 1 ? "task" : "tasks"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .chart-row {
          transition: transform 0.2s ease;
        }
        .chart-row:hover {
          transform: translateX(4px);
        }
        .chart-bar {
          position: relative;
        }
        .chart-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(rgba(255,255,255,0.15), transparent);
        }
      ` }} />
    </div>
  );
}
