import React, { useState } from "react";
import { Plus, Search, Pencil, Trash2, FileUp, Send, CheckCircle2, AlertCircle, ShoppingCart } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks/useLoad";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";

const emptyOrderForm = {
  order_number: "",
  company_id: "",
  company_name: "",
  amount_in_rupee: 0,
  quantity: 1,
  order_date: new Date().toISOString().split("T")[0],
  delivery_date: "",
  total_amount: 0,
  description: "",
  status: "Pending"
};

export function OrdersPage({ setPage, setActiveOrderId }) {
  const { user } = useAuth();
  const notify = useNotify();
  const canManage = user.permissions.includes("orders.manage");

  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [form, setForm] = useState(emptyOrderForm);

  // Load orders
  const orders = useLoad(() => api.orders(q), [q]);

  const handleOpenCreate = () => {
    setEditingOrder(null);
    setForm({
      ...emptyOrderForm,
      order_date: new Date().toISOString().split("T")[0]
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (order) => {
    setEditingOrder(order);
    setForm({
      order_number: order.order_number,
      company_id: order.company_id || "",
      company_name: order.company_name || "",
      amount_in_rupee: order.amount_in_rupee || 0,
      quantity: order.quantity || 1,
      order_date: order.order_date,
      delivery_date: order.delivery_date || "",
      total_amount: order.total_amount,
      description: order.description || "",
      status: order.status
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) {
      notify("Please enter a customer company name", "error");
      return;
    }

    try {
      const payload = {
        ...form,
        company_id: form.company_id ? Number(form.company_id) : null,
        company_name: form.company_name,
        amount_in_rupee: Number(form.amount_in_rupee),
        quantity: Number(form.quantity),
        total_amount: Number(form.amount_in_rupee) * Number(form.quantity)
      };

      if (editingOrder) {
        await api.updateOrder(editingOrder.id, payload);
        notify("Order updated successfully", "success");
      } else {
        await api.createOrder(payload);
        notify("Order created successfully", "success");
      }
      setModalOpen(false);
      orders.reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm("Are you sure you want to delete this order? This will also delete its BOM.")) return;
    try {
      await api.deleteOrder(orderId);
      notify("Order deleted successfully", "success");
      orders.reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBOM = (orderId) => {
    setActiveOrderId(orderId);
    setPage("create-bom");
  };

  const handleSendBOMToPurchase = async (orderId) => {
    if (!window.confirm("Are you sure you want to send this BOM to purchase? Once sent, it will notify the purchase department.")) return;
    try {
      await api.sendBOMToPurchase(orderId);
      notify("BOM successfully sent to purchase department", "success");
      orders.reload();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="stack">
      <div className="toolbar split-toolbar">
        <input
          className="search"
          placeholder="Search orders by number, description, or company..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canManage && (
          <button type="button" className="icon-button compact-primary" onClick={handleOpenCreate}>
            <Plus size={16} /> Add Order
          </button>
        )}
      </div>

      <div className="data-grid">
        {orders.loading && <div className="muted" style={{ padding: "20px", textAlign: "center" }}>Loading orders...</div>}
        
        {!orders.loading && (!orders.data || orders.data.length === 0) ? (
          <div className="muted" style={{ padding: "20px", textAlign: "center" }}>No orders found</div>
        ) : (
          <div className="table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ width: "130px" }}>Order Number</th>
                  <th style={{ width: "180px" }}>Customer Company</th>
                  <th style={{ width: "110px" }}>Order Date</th>
                  <th style={{ width: "110px" }}>Delivery Date</th>
                  <th style={{ width: "110px" }}>Rate (₹)</th>
                  <th style={{ width: "90px" }}>Quantity</th>
                  <th style={{ width: "110px" }}>Total Amount (₹)</th>
                  <th>Description</th>
                  <th style={{ width: "130px" }}>Status</th>
                  <th style={{ width: "240px" }}>BOM Action</th>
                  {canManage && <th style={{ width: "100px" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {orders.data?.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.order_number}</strong></td>
                    <td>{order.company_name || <em className="muted">None</em>}</td>
                    <td>{order.order_date}</td>
                    <td>{order.delivery_date || "-"}</td>
                    <td>₹{Number(order.amount_in_rupee || 0).toLocaleString()}</td>
                    <td>{order.quantity || 0}</td>
                    <td>₹{Number(order.total_amount || 0).toLocaleString()}</td>
                    <td>
                      <span className="cell-text" title={order.description}>
                        {order.description || "-"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "700",
                          backgroundColor:
                            order.status === "Completed" ? "#d1fae5" :
                            order.status === "Cancelled" ? "#fee2e2" :
                            order.status === "BOM Sent to Purchase" ? "#dbeafe" :
                            order.status === "In Production" ? "#fef3c7" :
                            order.status === "In Progress" ? "#e0f2fe" : "#f1f5f9",
                          color:
                            order.status === "Completed" ? "#065f46" :
                            order.status === "Cancelled" ? "#991b1b" :
                            order.status === "BOM Sent to Purchase" ? "#1e40af" :
                            order.status === "In Production" ? "#92400e" :
                            order.status === "In Progress" ? "#0369a1" : "#475569",
                          border: `1px solid ${
                            order.status === "Completed" ? "#a7f3d0" :
                            order.status === "Cancelled" ? "#fecaca" :
                            order.status === "BOM Sent to Purchase" ? "#bfdbfe" :
                            order.status === "In Production" ? "#fde68a" :
                            order.status === "In Progress" ? "#bae6fd" : "#cbd5e1"
                          }`
                        }}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {!order.has_bom ? (
                          <button
                            type="button"
                            className="icon-button compact-primary"
                            onClick={() => handleCreateBOM(order.id)}
                            style={{ background: "#0f766e", borderColor: "#14b8a6" }}
                          >
                            <Plus size={14} /> Create BOM
                          </button>
                        ) : order.bom_status === "Draft" ? (
                          <>
                            <span
                              className="badge"
                              style={{
                                backgroundColor: "#fef3c7",
                                color: "#92400e",
                                border: "1px solid #fde68a",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "600"
                              }}
                            >
                              Draft
                            </span>
                            <button
                              type="button"
                              className="secondary icon-button"
                              onClick={() => handleCreateBOM(order.id)}
                              style={{ minHeight: "28px", padding: "4px 8px", fontSize: "11px" }}
                            >
                              Edit BOM
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => handleSendBOMToPurchase(order.id)}
                              style={{ minHeight: "28px", padding: "4px 8px", fontSize: "11px", background: "#1e3a8a" }}
                            >
                              <Send size={12} /> Send to Purchase
                            </button>
                          </>
                        ) : (
                          <>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: "#dbeafe",
                                  color: "#1e40af",
                                  border: "1px solid #bfdbfe",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  textAlign: "center"
                                }}
                              >
                                Sended to Purchase
                              </span>
                            </div>
                            <button
                              type="button"
                              className="secondary icon-button"
                              onClick={() => handleCreateBOM(order.id)}
                              style={{ minHeight: "28px", padding: "4px 8px", fontSize: "11px" }}
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="secondary icon-only"
                            onClick={() => handleOpenEdit(order)}
                            title="Edit Order"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="danger icon-only"
                            onClick={() => handleDelete(order.id)}
                            title="Delete Order"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "550px", width: "95%", backgroundColor: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShoppingCart size={18} />
                {editingOrder ? "Edit Order details" : "Create New ERP Order"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit} className="company-form" style={{ padding: "20px" }}>
              <div className="stack" style={{ gap: "14px" }}>
                <label className="field">
                  <span>Customer Company Name *</span>
                  <input
                    type="text"
                    placeholder="Enter company name manually"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    required
                  />
                </label>

                <div className="form-grid two" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="field">
                    <span>Amount in Rupee (₹) *</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount_in_rupee}
                      onChange={(e) => setForm({ ...form, amount_in_rupee: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Quantity *</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <div className="form-grid two" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="field">
                    <span>Total Amount (₹)</span>
                    <input
                      type="text"
                      value={`₹${(Number(form.amount_in_rupee || 0) * Number(form.quantity || 0)).toLocaleString()}`}
                      disabled
                      style={{ backgroundColor: "#f1f5f9" }}
                    />
                  </label>
                  <label className="field">
                    <span>Order Date *</span>
                    <input
                      type="date"
                      value={form.order_date}
                      onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <div className="form-grid two" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="field">
                    <span>Delivery Date</span>
                    <input
                      type="date"
                      value={form.delivery_date}
                      onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Order Status *</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      required
                    >
                      <option value="Pending">Pending</option>
                      <option value="BOM Created">BOM Created</option>
                      <option value="BOM Sent to Purchase">BOM Sent to Purchase</option>
                      <option value="In Progress">In Progress</option>
                      <option value="In Production">In Production</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Order Description / Specifications</span>
                  <textarea
                    rows={3}
                    placeholder="Enter order descriptions..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModalOpen(false)}
                  style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#1e293b" }}
                >
                  Cancel
                </button>
                <button type="submit" style={{ backgroundColor: "#176b5b", color: "#fff" }}>
                  {editingOrder ? "Save Changes" : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
