import React, { useState, useEffect } from "react";
import { ClipboardList, ChevronDown, ChevronUp, Check, Send, ShoppingBag, Calendar, Eye, Layers } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";

export function PurchaseIndentsPage() {
  const notify = useNotify();
  const indents = useLoad(() => api.purchaseIndents(), []);
  
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({}); // order_id -> boolean

  // Auto-expand all groups on initial load
  useEffect(() => {
    if (indents.data) {
      const initialExpanded = {};
      indents.data.forEach(indent => {
        initialExpanded[indent.order_id] = true;
      });
      setExpandedGroups(initialExpanded);
    }
  }, [indents.data]);

  const handleToggleGroup = (orderId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleExpandAll = () => {
    if (!indents.data) return;
    const allExpanded = {};
    indents.data.forEach(indent => {
      allExpanded[indent.order_id] = true;
    });
    setExpandedGroups(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedGroups({});
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    const numericOrderId = Number(orderId);
    if (isNaN(numericOrderId)) {
      notify("Invalid Order ID", "error");
      return;
    }
    
    setUpdatingId(numericOrderId);
    try {
      await api.updateBOMStatus(numericOrderId, newStatus);
      notify(`Status updated to ${newStatus} successfully`, "success");
      indents.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  const calculateBOMTotal = (bomItems) => {
    return bomItems.reduce((acc, it) => {
      const purchaseQty = Math.max(0, Number(it.quantity || 0) - Number(it.available_stock || 0));
      return acc + (purchaseQty * Number(it.estimated_cost || 0));
    }, 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="procure-view-wrapper">
      <div className="procure-container">
        {/* Header Section */}
        <div className="procure-header">
          <div>
            <h1 className="procure-title">Purchase Indents & Procurement</h1>
            <p className="procure-subtitle">
              Manage sent BOIs (Bill of Items) from all customer orders. Items are grouped by order company.
            </p>
          </div>
          
          {indents.data && indents.data.length > 0 && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="procure-btn-tool" onClick={handleExpandAll}>
                Expand All
              </button>
              <button type="button" className="procure-btn-tool" onClick={handleCollapseAll}>
                Collapse All
              </button>
            </div>
          )}
        </div>

        {indents.loading ? (
          <div className="procure-loading">Loading purchase indents...</div>
        ) : !indents.data || indents.data.length === 0 ? (
          <div className="procure-empty-state">
            <ClipboardList size={40} style={{ color: "#94a3b8", marginBottom: "12px" }} />
            <p>No active purchase indents found from any company.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "24px" }}>
            {indents.data.map((indent) => {
              const totalCost = calculateBOMTotal(indent.items);
              const orderId = indent.order_id;
              const isExpanded = !!expandedGroups[orderId];
              const orderNo = indent.order?.order_number || `Order #${orderId}`;
              const companyName = indent.order?.company_name || "Unknown Company";

              return (
                <div className="procure-card" key={indent.id}>
                  {/* Collapsible Card Header */}
                  <div className="procure-card-header" onClick={() => handleToggleGroup(orderId)}>
                    <div className="procure-header-left">
                      <div className="procure-chevron-box">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span className="procure-order-no">{orderNo}</span>
                        <span className="procure-company-name">{companyName}</span>
                      </div>
                    </div>

                    <div className="procure-header-right" onClick={(e) => e.stopPropagation()}>
                      <div className="procure-header-meta">
                        <span className="procure-meta-item">
                          <Calendar size={13} style={{ marginRight: "4px" }} />
                          {formatDate(indent.updated_at)}
                        </span>
                        <span className="procure-meta-item">
                          <Layers size={13} style={{ marginRight: "4px" }} />
                          {indent.items?.length || 0} items
                        </span>
                      </div>

                      <div className="procure-header-cost">
                        <span className="procure-cost-label">Total Cost</span>
                        <span className="procure-cost-val">
                          ₹{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <span className={`boi-status-badge ${indent.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {indent.status}
                      </span>

                      <div className="procure-header-actions">
                        {indent.status === "Sent to Purchase" && (
                          <button
                            type="button"
                            className="procure-btn-action po-sent"
                            onClick={() => handleUpdateStatus(orderId, "PO Sent")}
                            disabled={updatingId === orderId}
                          >
                            <Send size={13} /> Mark PO Sent
                          </button>
                        )}

                        {indent.status === "PO Sent" && (
                          <button
                            type="button"
                            className="procure-btn-action received"
                            onClick={() => handleUpdateStatus(orderId, "Received")}
                            disabled={updatingId === orderId}
                          >
                            <Check size={13} /> Mark Received
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Body containing Items Table */}
                  {isExpanded && (
                    <div className="procure-card-body">
                      <div className="procure-table-wrap">
                        <table className="procure-table">
                          <thead>
                            <tr>
                              <th style={{ width: "45px", textAlign: "center" }}>#</th>
                              <th>Item Name</th>
                              <th style={{ width: "110px", textAlign: "center" }}>Required Qty</th>
                              <th style={{ width: "125px", textAlign: "center" }}>Available Stock</th>
                              <th style={{ width: "125px", textAlign: "center" }}>Purchase Qty</th>
                              <th style={{ width: "95px", textAlign: "center" }}>Unit</th>
                              <th style={{ minWidth: "150px" }}>Supplier</th>
                              <th style={{ width: "120px", textAlign: "right" }}>Est. Rate (₹)</th>
                              <th style={{ width: "140px", textAlign: "right" }}>Subtotal (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {indent.items?.length === 0 ? (
                              <tr>
                                <td colSpan="9" style={{ textAlign: "center", color: "#64748b", fontStyle: "italic", padding: "16px" }}>
                                  No items found in this indent.
                                </td>
                              </tr>
                            ) : (
                              indent.items.map((item, idx) => {
                                const required = Number(item.quantity || 0);
                                const available = Number(item.available_stock || 0);
                                const purchaseQty = Math.max(0, required - available);
                                const lineTotal = purchaseQty * Number(item.estimated_cost || 0);
                                const isStockLow = available < required;

                                return (
                                  <tr key={item.id || idx}>
                                    <td style={{ textAlign: "center", color: "#64748b", fontWeight: "600" }}>{idx + 1}</td>
                                    <td><strong>{item.item_name}</strong></td>
                                    <td style={{ textAlign: "center" }}>{required}</td>
                                    <td style={{ textAlign: "center" }}>
                                      <span className={`procure-stock-badge ${isStockLow ? "low" : "sufficient"}`}>
                                        {available}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "center", fontWeight: "700", color: "#334155" }}>{purchaseQty}</td>
                                    <td style={{ textAlign: "center" }}>{item.unit || "Pcs"}</td>
                                    <td>{item.supplier || <em className="muted">None</em>}</td>
                                    <td style={{ textAlign: "right" }}>₹{Number(item.estimated_cost || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: "right", fontWeight: "700", color: "#0f172a" }}>
                                      ₹{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .procure-view-wrapper {
          background: #f8fafc;
          min-height: calc(100vh - 80px);
          margin: -20px;
          padding: 20px;
        }
        .procure-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 8px 16px 40px;
        }
        .procure-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .procure-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .procure-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 4px 0 0;
        }
        .procure-btn-tool {
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        .procure-btn-tool:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #1e293b;
        }
        .procure-loading {
          text-align: center;
          padding: 60px;
          color: #64748b;
          font-size: 15px;
        }
        .procure-empty-state {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 48px;
          text-align: center;
          color: #64748b;
          font-size: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .procure-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .procure-card:hover {
          border-color: #cbd5e1;
        }
        .procure-card-header {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;
          background: #fff;
          transition: background 0.15s;
        }
        .procure-card-header:hover {
          background: #f8fafc;
        }
        .procure-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .procure-chevron-box {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #f1f5f9;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .procure-order-no {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }
        .procure-company-name {
          font-size: 13px;
          color: #0f766e;
          font-weight: 600;
        }
        .procure-header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .procure-header-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: flex-end;
        }
        .procure-meta-item {
          font-size: 12px;
          color: #64748b;
          display: flex;
          align-items: center;
        }
        .procure-header-cost {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 130px;
        }
        .procure-cost-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .procure-cost-val {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        .boi-status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid #cbd5e1;
        }
        .boi-status-badge.draft {
          background-color: #ffedd5;
          color: #d97706;
          border-color: #fed7aa;
        }
        .boi-status-badge.sent-to-purchase {
          background-color: #e0f2fe;
          color: #0369a1;
          border-color: #bae6fd;
        }
        .boi-status-badge.bom-sent-to-purchase {
          background-color: #e0f2fe;
          color: #0369a1;
          border-color: #bae6fd;
        }
        .boi-status-badge.po-sent {
          background-color: #eff6ff;
          color: #2563eb;
          border-color: #bfdbfe;
        }
        .boi-status-badge.received {
          background-color: #f0fdf4;
          color: #16a34a;
          border-color: #bbf7d0;
        }
        .procure-header-actions {
          min-width: 140px;
          display: flex;
          justify-content: flex-end;
        }
        .procure-btn-action {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s;
        }
        .procure-btn-action:hover {
          opacity: 0.9;
        }
        .procure-btn-action.po-sent {
          background: #2563eb;
        }
        .procure-btn-action.received {
          background: #16a34a;
        }
        .procure-card-body {
          border-top: 1px solid #f1f5f9;
          background: #fff;
          padding: 16px 20px 20px;
        }
        .procure-table-wrap {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .procure-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .procure-table th {
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          padding: 10px 12px;
          border-bottom: 2px solid #e2e8f0;
        }
        .procure-table td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .procure-stock-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          text-align: center;
          min-width: 30px;
        }
        .procure-stock-badge.low {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }
        .procure-stock-badge.sufficient {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }
        `
      }} />
    </div>
  );
}
