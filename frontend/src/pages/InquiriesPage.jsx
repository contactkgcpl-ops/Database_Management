import React, { useMemo, useState } from "react";
import { Calendar, Search, X, Plus, Mail, History, Pencil, CheckCircle, BarChart3, Layers, ArrowRight, RefreshCcw, Download } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useAuth } from "../context/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { Pagination } from "../components/Pagination";
import { GridFilterDropdown } from "../components/GridFilterDropdown";
import { ConnectedSourceActions } from "../components/ConnectedSourceActions";

const columns = [
  { key: "inquiry_no", label: "Inquiry No. / Co. ID", width: 180 },
  { key: "created_at", label: "Date", width: 120 },
  { key: "company_name", label: "Customer Name", width: 200 },
  { key: "contact_person", label: "Contact Person", width: 140 },
  { key: "quick_connect", label: "Mobile / Email", width: 150 },
  { key: "requirement", label: "Requirement", width: 180 },
  { key: "inquiry_source", label: "Source", width: 120 },
  { key: "assigned_to", label: "Assigned To", width: 140 },
  { key: "status", label: "Status / Stage", width: 170 },
  { key: "follow_up_reminder_date", label: "Next Follow-up", width: 140 },
  { key: "order_amount", label: "Amount", width: 120 },
];

const pipelineStages = [
  { key: "new", label: "Inquiry (New)" },
  { key: "follow_up", label: "Follow-up" },
  { key: "quotation_sent", label: "Quotation Sent" },
  { key: "negotiation", label: "Negotiation" },
  { key: "converted_to_order", label: "Order Placed" },
  { key: "invoice_sent", label: "Invoice Sent" },
  { key: "payment_received", label: "Payment Received" },
  { key: "dispatched", label: "Dispatched" },
  { key: "completed", label: "Completed" }
];

function getPropValue(record, key) {
  if (key === "company_name") return record.company_name || "";
  if (key === "assigned_by_name") return record.assigned_by_name || "";
  const pv = record.property_values?.find((v) => v.field_key === key);
  return pv ? pv.value : "";
}

function splitMultiValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function propertyOptions(property) {
  return (property?.options || [])
    .filter((option) => option.is_active !== false)
    .map((option) => ({ label: option.label, value: option.value }));
}

function formatPropertyValue(property, value) {
  const labelsByValue = new Map(propertyOptions(property).map((option) => [String(option.value), option.label]));
  const parts = splitMultiValue(value);
  if (!parts.length) return "";
  return parts.map((part) => labelsByValue.get(String(part)) || part).join(", ");
}

const INQUIRY_STATUSES = [
  "new",
  "follow_up",
  "quotation_sent",
  "negotiation",
  "converted_to_order",
  "invoice_sent",
  "payment_received",
  "dispatched",
  "completed",
  "lost",
  "not_interested"
];

export function InquiriesPage() {
  const notify = useNotify();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: "company_name", direction: "asc" });

  // Pipeline filter tab
  const [stageFilter, setStageFilter] = useState("all");

  // Modals & Forms State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    company_name: "",
    contact_number: "",
    email_id: "",
    city: "",
    address: "",
    state: "",
    contact_person: "",
    requirement: "",
    inquiry_source: "",
    assigned_to: ""
  });

  const [statusModal, setStatusModal] = useState(null);
  const [statusForm, setStatusForm] = useState({ remark: "", followUpDate: "", status: "", connectedSource: "" });

  const [trackingInquiry, setTrackingInquiry] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingStepForm, setTrackingStepForm] = useState({ orderAmount: "", remark: "", followUpDate: "" });

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterKey, setHistoryFilterKey] = useState(null);

  // Data Loading
  const users = useLoad(() => api.users(), []);
  const inquiries = useLoad(() => api.getInquiries(q), [q]);
  const properties = useLoad(() => api.properties(), []);

  const activeProperties = properties.data.filter((property) => property.is_active);
  const statusProperty = activeProperties.find((property) => property.field_key === "status");
  const connectedSourceProperty = activeProperties.find((property) => property.field_key === "connected_source");

  const openHistory = async (companyId, filterKey = null) => {
    setHistoryFilterKey(filterKey);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api.getCompanyHistory(companyId);
      setHistoryData(data);
    } catch (err) {
      notify("Failed to fetch history", "error");
    }
    setHistoryLoading(false);
  };

  const handleAssign = async (companyId, userId) => {
    try {
      await api.assignInquiry(companyId, userId || null);
      notify("Inquiry owner updated successfully", "success");
      inquiries.reload();
    } catch (err) {
      notify("Failed to assign inquiry", "error");
    }
  };

  const handleAddInquiry = async (e) => {
    e.preventDefault();
    if (!addForm.company_name) {
      notify("Customer Name is required", "error");
      return;
    }

    const propertyValues = [];
    const addProp = (key, val) => {
      const prop = activeProperties.find(p => p.field_key === key);
      if (prop && val) {
        propertyValues.push({ property_id: prop.id, value: val });
      }
    };

    addProp("contact_number", addForm.contact_number);
    addProp("email_id", addForm.email_id);
    addProp("city", addForm.city);
    addProp("address", addForm.address);
    addProp("state", addForm.state);
    addProp("contact_person", addForm.contact_person);
    addProp("requirement", addForm.requirement);
    addProp("inquiry_source", addForm.inquiry_source);

    try {
      await api.createInquiry({
        company_name: addForm.company_name,
        assigned_to: addForm.assigned_to || null,
        property_values: propertyValues
      });
      notify("New inquiry logged successfully", "success");
      setShowAddModal(false);
      setAddForm({
        company_name: "",
        contact_number: "",
        email_id: "",
        city: "",
        address: "",
        state: "",
        contact_person: "",
        requirement: "",
        inquiry_source: "",
        assigned_to: ""
      });
      inquiries.reload();
    } catch (err) {
      notify("Failed to create inquiry", "error");
    }
  };

  const openStatusUpdate = (record, property) => {
    const statusValue = getPropValue(record, "status") || "";
    const connectedSourceValue = connectedSourceProperty ? getPropValue(record, "connected_source") || "" : "";
    setStatusModal({
      companyId: record.id,
      property,
      value: statusValue,
      connectedSourceValue
    });
    setStatusForm({
      remark: "",
      followUpDate: "",
      status: statusValue,
      connectedSource: connectedSourceValue
    });
  };

  const submitStatusChange = async (e) => {
    e.preventDefault();
    if (!statusModal) return;
    try {
      await api.updateInquiryStage(statusModal.companyId, {
        status: statusForm.status,
        remark: statusForm.remark,
        follow_up_date: statusForm.followUpDate || null,
        connected_source: connectedSourceProperty ? statusForm.connectedSource : undefined
      });
      notify("Inquiry status updated", "success");
      setStatusModal(null);
      inquiries.reload();
    } catch (err) {
      notify("Failed to update status", "error");
    }
  };

  const openPipelineTracker = (inq) => {
    setTrackingInquiry(inq);
    setTrackingStepForm({
      orderAmount: getPropValue(inq, "order_amount") || "",
      remark: "",
      followUpDate: ""
    });
  };

  const handleUpdateStep = async (newStatus) => {
    if (!trackingInquiry) return;
    if (newStatus === "converted_to_order" && !trackingStepForm.orderAmount) {
      notify("Order amount is required before converting to order", "error");
      return;
    }
    setTrackingLoading(true);
    try {
      await api.updateInquiryStage(trackingInquiry.id, {
        status: newStatus,
        remark: trackingStepForm.remark || `Pipeline transitioned to: ${newStatus}`,
        follow_up_date: trackingStepForm.followUpDate || null,
        order_amount: newStatus === "converted_to_order" ? trackingStepForm.orderAmount : undefined
      });

      notify("Pipeline progressed successfully", "success");
      inquiries.reload();

      // Update local tracking instance to reflect changes
      const updatedList = await api.getInquiries(q);
      const updatedItem = updatedList.find(i => i.id === trackingInquiry.id);
      if (updatedItem) {
        setTrackingInquiry(updatedItem);
      } else {
        setTrackingInquiry(null);
      }
    } catch (err) {
      notify("Pipeline progression failed", "error");
    }
    setTrackingLoading(false);
  };

  // Salesperson Totals Leaderboard
  const salespersonTotals = useMemo(() => {
    if (!inquiries.data || !users.data) return [];
    const totals = {};
    for (const u of users.data) {
      totals[u.id] = { name: u.name, amount: 0, count: 0 };
    }
    for (const inq of inquiries.data) {
      const amtStr = getPropValue(inq, "order_amount") || "0";
      const amt = parseFloat(amtStr) || 0;
      if (inq.assigned_to && totals[inq.assigned_to]) {
        totals[inq.assigned_to].amount += amt;
        if (amt > 0) totals[inq.assigned_to].count += 1;
      }
    }
    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  }, [inquiries.data, users.data]);

  // Filter & Sort Inquiries
  const filteredInquiries = useMemo(() => {
    return (inquiries.data || []).filter((inq) => {
      // Stage Tab Filter
      const currentStatus = getPropValue(inq, "status") || "new";
      if (stageFilter !== "all") {
        if (stageFilter === "converted") {
          // Converted includes converted_to_order and completed
          if (currentStatus !== "converted_to_order" && currentStatus !== "completed") return false;
        } else if (stageFilter === "today_follow_up") {
          // Today Follow-up: status is follow_up and follow_up_reminder_date is today
          const fDate = getPropValue(inq, "follow_up_reminder_date");
          const d = new Date();
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const localTodayStr = `${year}-${month}-${day}`;

          const matchesToday = fDate && fDate.startsWith(localTodayStr);
          if (currentStatus !== "follow_up" || !matchesToday) return false;
        } else {
          if (currentStatus !== stageFilter) return false;
        }
      }

      // Column filter headers
      return columns.every((col) => {
        const filter = columnFilters[col.key];
        if (!filter || (Array.isArray(filter) && filter.length === 0)) return true;

        let val = "";
        if (col.key === "inquiry_no") {
          const inqNo = getPropValue(inq, "inquiry_no") || "";
          val = `${inqNo} / ID: ${inq.id}`;
        } else if (col.key === "created_at") {
          val = inq.created_at ? new Date(inq.created_at).toLocaleDateString() : "";
        } else if (col.key === "assigned_to") {
          const owner = users.data?.find(u => u.id === inq.assigned_to);
          val = owner ? owner.name : "Not Assigned";
        } else if (col.key === "quick_connect") {
          const num = getPropValue(inq, "contact_number") || "";
          const email = getPropValue(inq, "email_id") || "";
          val = `${num} ${email}`;
        } else if (col.key === "follow_up_reminder_date") {
          val = getPropValue(inq, "follow_up_reminder_date") || "";
        } else {
          val = String(getPropValue(inq, col.key));
        }

        val = val.toLowerCase();

        if (Array.isArray(filter)) {
          const valueAtoms = val.split(",").map(s => s.trim());
          return filter.some(f => valueAtoms.includes(String(f).toLowerCase()) || val.includes(String(f).toLowerCase()));
        }
        return val.includes(String(filter).toLowerCase());
      });
    });
  }, [inquiries.data, stageFilter, columnFilters, users.data]);

  const sortedInquiries = useMemo(() => {
    return [...filteredInquiries].sort((a, b) => {
      const prop = columns.find((col) => col.key === sort.key);
      let valA = "", valB = "";
      if (sort.key === "assigned_to") {
        const ownerA = users.data?.find(u => u.id === a.assigned_to);
        const ownerB = users.data?.find(u => u.id === b.assigned_to);
        valA = ownerA ? ownerA.name : "Not Assigned";
        valB = ownerB ? ownerB.name : "Not Assigned";
      } else if (sort.key === "inquiry_no") {
        valA = getPropValue(a, "inquiry_no") || "";
        valB = getPropValue(b, "inquiry_no") || "";
      } else if (sort.key === "created_at") {
        valA = a.created_at ? new Date(a.created_at).getTime() : 0;
        valB = b.created_at ? new Date(b.created_at).getTime() : 0;
      } else {
        valA = prop ? getPropValue(a, prop.key) : a.company_name;
        valB = prop ? getPropValue(b, prop.key) : b.company_name;
      }

      const res = typeof valA === "number" && typeof valB === "number" ? valA - valB : String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sort.direction === "asc" ? res : -res;
    });
  }, [filteredInquiries, sort, users.data]);

  const totalPages = Math.ceil(sortedInquiries.length / pageSize);
  const visibleInquiries = sortedInquiries.slice((page - 1) * pageSize, page * pageSize);

  const exportInquiries = () => {
    const headers = columns.map((col) => col.label);
    const rows = sortedInquiries.map((inq) => columns.map((col) => {
      if (col.key === "assigned_to") return users.data?.find((u) => u.id === inq.assigned_to)?.name || "Not Assigned";
      if (col.key === "quick_connect") return `${getPropValue(inq, "contact_number") || ""} ${getPropValue(inq, "email_id") || ""}`.trim();
      if (col.key === "created_at") return inq.created_at ? new Date(inq.created_at).toLocaleDateString() : "";
      return getPropValue(inq, col.key) || "";
    }));
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inquiries.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Metric Summaries aligned with Ref Image
  const metrics = useMemo(() => {
    const list = inquiries.data || [];
    const total = list.length;
    const newInqs = list.filter(i => getPropValue(i, "status") === "new" || !getPropValue(i, "status")).length;
    const pendingFollowups = list.filter(i => getPropValue(i, "status") === "follow_up").length;
    const quotations = list.filter(i => getPropValue(i, "status") === "quotation_sent").length;
    const orders = list.filter(i => getPropValue(i, "status") === "converted_to_order" || getPropValue(i, "status") === "completed").length;
    const lost = list.filter(i => getPropValue(i, "status") === "lost" || getPropValue(i, "status") === "not_interested").length;

    return { total, newInqs, pendingFollowups, quotations, orders, lost };
  }, [inquiries.data]);

  if (inquiries.loading) return <div className="muted" style={{ padding: "20px" }}>Loading inquiries...</div>;

  return (
    <div className="stack inquiries-page" style={{ padding: "0px 10px" }}>

      {/* 6 Metric cards aligned with Ref Image */}
      <div className="crm-dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" }}>

        <div className="crm-metric-card total" style={{ background: "linear-gradient(135deg, #176b5b, #0c4339)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(23,107,91,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>Total Inquiries</span>
            <Layers size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.total}</h2>
        </div>

        <div className="crm-metric-card new" style={{ background: "linear-gradient(135deg, #0f766e, #115e59)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(15,118,110,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>New Inquiries</span>
            <Plus size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.newInqs}</h2>
        </div>

        <div className="crm-metric-card pending" style={{ background: "linear-gradient(135deg, #ea580c, #c2410c)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(234,88,12,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>Pending Follow-up</span>
            <Calendar size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.pendingFollowups}</h2>
        </div>

        <div className="crm-metric-card quotation" style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(139,92,246,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>Quotation Sent</span>
            <Mail size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.quotations}</h2>
        </div>

        <div className="crm-metric-card converted" style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(22,163,74,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>Converted to Order</span>
            <CheckCircle size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.orders}</h2>
        </div>

        <div className="crm-metric-card lost" style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", padding: "16px 20px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(220,38,38,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", opacity: 0.85, letterSpacing: "0.5px" }}>Lost Inquiries</span>
            <X size={18} style={{ opacity: 0.7 }} />
          </div>
          <h2 style={{ fontSize: "30px", margin: "8px 0 0 0", fontWeight: "800" }}>{metrics.lost}</h2>
        </div>
      </div>

      {/* SAP-style command bar */}
      <div className="inquiry-command-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <label className="crm-search small inquiry-search" style={{ flex: 1, maxWidth: '360px' }}>
            <Search size={15} />
            <input
              placeholder="Search inquiry / customer..."
              value={q}
              onChange={(event) => { setQ(event.target.value); setPage(1); }}
            />
          </label>
          <span className="user-debug-info" style={{ fontSize: '11px', color: '#94a3b8' }}>
            Logged in as: <strong>{user?.name} (ID: {user?.id})</strong>
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary icon-button small-action" onClick={() => inquiries.reload()}>
            <RefreshCcw size={15} /> Refresh
          </button>
          <button type="button" className="secondary icon-button small-action" onClick={exportInquiries}>
            <Download size={15} /> Export
          </button>
          <button className="primary icon-button" onClick={() => setShowAddModal(true)} style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", borderRadius: "6px" }}>
            <Plus size={16} /> New Inquiry
          </button>
        </div>
      </div>

      {/* Action / Toolbar Area */}
      <div className="toolbar split-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        {/* Stage Tabs exactly from Ref Image */}
        <div className="followup-filter-tabs" role="tablist">
          <button type="button" className={stageFilter === "all" ? "active" : ""} onClick={() => { setStageFilter("all"); setPage(1); }}>All Inquiries</button>
          <button type="button" className={stageFilter === "new" ? "active" : ""} onClick={() => { setStageFilter("new"); setPage(1); }}>New</button>
          <button type="button" className={stageFilter === "follow_up" ? "active" : ""} onClick={() => { setStageFilter("follow_up"); setPage(1); }}>Pending Follow-up</button>
          <button type="button" className={stageFilter === "today_follow_up" ? "active" : ""} onClick={() => { setStageFilter("today_follow_up"); setPage(1); }}>Today Follow-up</button>
          <button type="button" className={stageFilter === "quotation_sent" ? "active" : ""} onClick={() => { setStageFilter("quotation_sent"); setPage(1); }}>Quotation Sent</button>
          <button type="button" className={stageFilter === "converted" ? "active" : ""} onClick={() => { setStageFilter("converted"); setPage(1); }}>Converted</button>
          <button type="button" className={stageFilter === "lost" ? "active" : ""} onClick={() => { setStageFilter("lost"); setPage(1); }}>Lost</button>
        </div>

      </div>

      {/* Table Container */}
      <div className="data-grid">
          {!inquiries.data.length ? (
            <div className="muted" style={{ padding: "30px", textAlign: "center", background: "#fff" }}>
              No inquiries found in CRM pipeline.
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="company-table">
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col.key} style={{ width: `${col.width}px` }}>
                          <button
                            type="button"
                            className="sort-header"
                            onClick={() => setSort({ key: col.key, direction: sort.key === col.key && sort.direction === "asc" ? "desc" : "asc" })}
                          >
                            {col.label} <span>{sort.key === col.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                          </button>
                        </th>
                      ))}
                      <th style={{ width: "130px" }}>Action</th>
                    </tr>

                    {/* Header Filter Row exactly underneath Column Header */}
                    <tr className="filter-row">
                      {columns.map((col) => {
                        const dataValues = (inquiries.data || []).map(i => {
                          if (col.key === "inquiry_no") {
                            const inqNo = getPropValue(i, "inquiry_no") || "";
                            return `${inqNo} / ID: ${i.id}`;
                          }
                          if (col.key === "created_at") {
                            return i.created_at ? new Date(i.created_at).toLocaleDateString() : "";
                          }
                          if (col.key === "assigned_to") {
                            const owner = users.data?.find(u => u.id === i.assigned_to);
                            return owner ? owner.name : "Not Assigned";
                          }
                          if (col.key === "quick_connect") {
                            const num = getPropValue(i, "contact_number") || "";
                            const email = getPropValue(i, "email_id") || "";
                            return `${num} ${email}`;
                          }
                          if (col.key === "follow_up_reminder_date") {
                            return getPropValue(i, "follow_up_reminder_date") || "";
                          }
                          return getPropValue(i, col.key);
                        })
                          .flatMap(v => String(v).split(",").map(s => s.trim()))
                          .filter(Boolean);

                        let uniqueValues = Array.from(new Set(dataValues)).sort();
                        if (col.key === "status") {
                          uniqueValues = uniqueValues.filter(val => INQUIRY_STATUSES.includes(val));
                        }

                        return (
                          <th key={`${col.key}-f`} style={{ padding: "6px 8px" }}>
                            {col.key === "quick_connect" || col.key === "created_at" || col.key === "inquiry_no" || col.key === "follow_up_reminder_date" ? (
                              <input
                                className="filter-input"
                                placeholder="Filter..."
                                value={columnFilters[col.key] || ""}
                                onChange={(e) => { setColumnFilters({ ...columnFilters, [col.key]: e.target.value }); setPage(1); }}
                                style={{ width: "100%", padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px", boxSizing: "border-box" }}
                              />
                            ) : col.key === "inquiry_source" || col.key === "status" ? (
                              <GridFilterDropdown
                                label={col.label}
                                options={uniqueValues}
                                value={columnFilters[col.key] || []}
                                onChange={(val) => { setColumnFilters({ ...columnFilters, [col.key]: val }); setPage(1); }}
                                isMulti={true}
                              />
                            ) : (
                              <input
                                className="filter-input"
                                placeholder={`Filter ${col.label}`}
                                value={columnFilters[col.key] || ""}
                                onChange={(e) => { setColumnFilters({ ...columnFilters, [col.key]: e.target.value }); setPage(1); }}
                                style={{ width: "100%", padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "12px", boxSizing: "border-box" }}
                              />
                            )}
                          </th>
                        );
                      })}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInquiries.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 1} style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
                          No matching inquiries found.
                        </td>
                      </tr>
                    ) : (
                      visibleInquiries.map((inq) => {
                        const inqNo = getPropValue(inq, "inquiry_no");
                        const statusVal = getPropValue(inq, "status") || "new";
                        const isConverted = statusVal === "converted_to_order" || statusVal === "completed";
                        const orderAmt = getPropValue(inq, "order_amount");

                        let rowClassName = "";
                        if (isConverted) {
                          rowClassName = "order-placed-row";
                        }

                        return (
                          <tr key={inq.id} className={rowClassName}>
                            <td>
                              <span className="cell-text"><strong>{inqNo || `INQ-${inq.id}`}</strong></span>
                              <span className="cell-subtext" style={{ fontSize: "10px", color: "#94a3b8" }}>Co. ID: {inq.id}</span>
                            </td>
                            <td>
                              <span className="cell-text">
                                {inq.created_at ? new Date(inq.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "-"}
                              </span>
                            </td>
                            <td>
                              <span className="cell-text"><strong>{inq.company_name || "-"}</strong></span>
                            </td>
                            <td>
                              <span className="cell-text">{getPropValue(inq, "contact_person") || "-"}</span>
                            </td>
                            <td>
                              {(() => {
                                const contactNumber = getPropValue(inq, "contact_number") || "";
                                const emailId = getPropValue(inq, "email_id") || "";

                                return (
                                  <ConnectedSourceActions
                                    companyId={inq.id}
                                    connectedSourceProperty={connectedSourceProperty}
                                    connectedSourceValue={getPropValue(inq, "connected_source")}
                                    contactNumber={contactNumber}
                                    emailId={emailId}
                                    onUpdated={inquiries.reload}
                                  />
                                );
                              })()}
                            </td>
                            <td>
                              <span className="cell-text">{getPropValue(inq, "requirement") || "-"}</span>
                            </td>
                            <td>
                              <span className="cell-text" style={{ textTransform: "capitalize" }}>
                                {getPropValue(inq, "inquiry_source") || "-"}
                              </span>
                            </td>
                            <td>
                              <select
                                className="compact-select"
                                value={inq.assigned_to || ""}
                                onChange={(e) => handleAssign(inq.id, e.target.value)}
                                style={{
                                  height: "28px",
                                  fontSize: "12px",
                                  padding: "0 6px",
                                  borderRadius: "6px",
                                  border: "1px solid #d9e2ee",
                                  background: inq.assigned_to ? "#f0fdf4" : "#fff",
                                  width: "100%",
                                  fontWeight: inq.assigned_to ? "600" : "400"
                                }}
                              >
                                <option value="">Not Assigned</option>
                                {users.data?.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span className="cell-text" style={{ fontWeight: "700", color: statusVal === "converted_to_order" ? "#166534" : "#176b5b", textTransform: "capitalize" }}>
                                  {statusVal.replace(/_/g, " ")}
                                </span>
                                {isConverted && orderAmt && (
                                  <span style={{ fontSize: "11px", color: "#166534", background: "#dcfce7", padding: "1px 5px", borderRadius: "4px", width: "max-content", fontWeight: "600" }}>
                                    Order: ₹{parseFloat(orderAmt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="cell-text">
                                {getPropValue(inq, "follow_up_reminder_date") ? new Date(getPropValue(inq, "follow_up_reminder_date")).toLocaleDateString() : "-"}
                              </span>
                            </td>
                            <td>
                              <span className="cell-text" style={{ fontWeight: "700", color: orderAmt ? "#166534" : "#64748b" }}>
                                {orderAmt ? `Rs. ${parseFloat(orderAmt).toLocaleString()}` : "-"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  onClick={() => openPipelineTracker(inq)}
                                  className="cell-icon-button"
                                  title="Track Pipeline Progress"
                                  style={{ background: "#176b5b" }}
                                >
                                  <Layers size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openStatusUpdate(inq, statusProperty)}
                                  className="cell-icon-button"
                                  title="Log Stage Activity"
                                  style={{ background: "#475569" }}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openHistory(inq.id)}
                                  className="cell-icon-button"
                                  title="View History Logs"
                                  style={{ background: "#0f766e" }}
                                >
                                  <History size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={filteredInquiries.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </div>

      {/* Add New Inquiry Modal (Look like Add Company but includes lead dynamic fields) */}
      {showAddModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", margin: 0, fontWeight: "700" }}>Log New Inquiry</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <form onSubmit={handleAddInquiry} style={{ padding: "20px", maxHeight: "80vh", overflowY: "auto" }}>

              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px", fontWeight: "800" }}>1. Company/Customer Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Company / Customer Name *</label>
                  <input required value={addForm.company_name} onChange={e => setAddForm({ ...addForm, company_name: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="ABC Industries Pvt Ltd" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Mobile / Contact Number</label>
                  <input value={addForm.contact_number} onChange={e => setAddForm({ ...addForm, contact_number: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="9876543210" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Email Address</label>
                  <input type="email" value={addForm.email_id} onChange={e => setAddForm({ ...addForm, email_id: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="info@company.com" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>City</label>
                  <input value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="Mumbai" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>State</label>
                  <input value={addForm.state} onChange={e => setAddForm({ ...addForm, state: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="Maharashtra" />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Address</label>
                  <textarea value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", minHeight: "50px", fontFamily: "inherit" }} placeholder="Corporate office details" />
                </div>
              </div>

              <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px", marginBottom: "12px", fontWeight: "800" }}>2. Inquiry & Sales Parameters</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Contact Person Name</label>
                  <input value={addForm.contact_person} onChange={e => setAddForm({ ...addForm, contact_person: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="Amit Kumar" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Requirement</label>
                  <input value={addForm.requirement} onChange={e => setAddForm({ ...addForm, requirement: e.target.value })} style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} placeholder="Enter customer requirements" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Inquiry Source</label>
                  <select
                    value={addForm.inquiry_source}
                    onChange={e => setAddForm({ ...addForm, inquiry_source: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", height: "35px" }}
                  >
                    <option value="">-- Choose Source --</option>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="trade_show">Trade Show</option>
                    <option value="existing_customer">Existing Customer</option>
                    <option value="social_media">Social Media</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px", color: "#334155" }}>Assign Representative</label>
                  <select
                    value={addForm.assigned_to}
                    onChange={e => setAddForm({ ...addForm, assigned_to: e.target.value })}
                    style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box", height: "35px" }}
                  >
                    <option value="">-- Assign Salesperson --</option>
                    {users.data?.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #f1f5f9", paddingTop: "15px" }}>
                <button type="button" className="secondary" onClick={() => setShowAddModal(false)} style={{ padding: "8px 16px", borderRadius: "6px" }}>Cancel</button>
                <button type="submit" className="primary" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "8px 16px", borderRadius: "6px" }}>Log Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stage Activity & Scheduling Modal */}
      {statusModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "420px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", margin: 0, fontWeight: "700" }}>Log Activity & Stage</h2>
              <button onClick={() => setStatusModal(null)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <form onSubmit={submitStatusChange} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "6px", color: "#475569" }}>Inquiry Stage / Status</label>
                <select
                  value={statusForm.status}
                  onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                >
                  <option value="">- Select Stage -</option>
                  {statusModal.property?.options?.filter(o => o.is_active !== false && INQUIRY_STATUSES.includes(o.value)).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "6px", color: "#475569" }}>Activity / Conversion Remark</label>
                <textarea
                  value={statusForm.remark}
                  onChange={e => setStatusForm({ ...statusForm, remark: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", minHeight: "80px", fontFamily: "inherit" }}
                  placeholder="Log details of the conversation or deal progress"
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "6px", color: "#475569" }}>Schedule Next Follow Up Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={statusForm.followUpDate}
                  onChange={e => setStatusForm({ ...statusForm, followUpDate: e.target.value })}
                  style={{ width: "100%", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="secondary" onClick={() => setStatusModal(null)} style={{ padding: "8px 16px", borderRadius: "6px" }}>Cancel</button>
                <button type="submit" className="primary" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "8px 16px", borderRadius: "6px" }}>Update Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visual Stepper / Progress Tracking Modal */}
      {trackingInquiry && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "16px", margin: 0, fontWeight: "700" }}>Pipeline Flow Tracker</h2>
                <p style={{ margin: "2px 0 0", fontSize: "12px", opacity: 0.85 }}>{getPropValue(trackingInquiry, "inquiry_no") || `INQ-${trackingInquiry.id}`} - {trackingInquiry.company_name}</p>
              </div>
              <button onClick={() => setTrackingInquiry(null)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ padding: "20px", maxHeight: "70vh", overflowY: "auto" }}>

              {/* Stepper progression flow */}
              <div className="stepper-timeline">
                {(() => {
                  const currentStatus = getPropValue(trackingInquiry, "status") || "new";
                  const currentIndex = pipelineStages.findIndex(s => s.key === currentStatus);

                  return pipelineStages.map((stage, idx) => {
                    let className = "";
                    if (idx < currentIndex) className = "completed";
                    else if (idx === currentIndex) className = "active";

                    return (
                      <div key={stage.key} className={`stepper-node ${className}`}>
                        <div className="stepper-dot" />
                        <div className="stepper-title">{stage.label}</div>
                        {idx === currentIndex && (
                          <div style={{ fontSize: "11px", color: "#176b5b", fontWeight: "700" }}>👉 Currently Here</div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Progress control form */}
              <div style={{ marginTop: "24px", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginTop: 0, marginBottom: "12px" }}>Progress Pipeline Status</h4>

                <div style={{ display: "grid", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px", color: "#475569" }}>Conversion Remark / Activity Details</label>
                    <textarea
                      value={trackingStepForm.remark}
                      onChange={e => setTrackingStepForm({ ...trackingStepForm, remark: e.target.value })}
                      style={{ width: "100%", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", fontFamily: "inherit" }}
                      placeholder="Add conversation summary or stage transition notes"
                    />
                  </div>

                  {(() => {
                    const currentStatus = getPropValue(trackingInquiry, "status") || "new";
                    const currentIndex = pipelineStages.findIndex(s => s.key === currentStatus);
                    const nextStage = pipelineStages[currentIndex + 1];
                    const isOrderNext = nextStage?.key === "converted_to_order";
                    const isOrderCurrent = currentStatus === "converted_to_order";

                    return (
                      <>
                        {(isOrderNext || (isOrderCurrent && !getPropValue(trackingInquiry, "order_amount"))) && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px", color: "#475569" }}>Order Amount *</label>
                            <div style={{ position: "relative" }}>
                              <span style={{ position: "absolute", left: "8px", top: "8px", fontSize: "12px", color: "#64748b", fontWeight: "700" }}>₹</span>
                              <input
                                type="number"
                                required
                                value={trackingStepForm.orderAmount}
                                onChange={e => setTrackingStepForm({ ...trackingStepForm, orderAmount: e.target.value })}
                                style={{ width: "100%", padding: "6px 10px 6px 20px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                                placeholder="Amount (e.g. 50000)"
                              />
                            </div>
                          </div>
                        )}

                        {nextStage?.key === "follow_up" && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px", color: "#475569" }}>Next Follow up Date</label>
                            <input
                              type="date"
                              min={new Date().toISOString().split('T')[0]}
                              value={trackingStepForm.followUpDate}
                              onChange={e => setTrackingStepForm({ ...trackingStepForm, followUpDate: e.target.value })}
                              style={{ width: "100%", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", boxSizing: "border-box" }}
                            />
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateStep("lost")}
                            className="secondary"
                            disabled={trackingLoading}
                            style={{ padding: "6px 12px", fontSize: "12px", color: "#dc2626", borderColor: "#fca5a5" }}
                          >
                            Mark As Lost
                          </button>
                          {nextStage && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStep(nextStage.key)}
                              className="primary"
                              disabled={trackingLoading}
                              style={{ backgroundColor: "#176b5b", color: "#fff", display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", fontSize: "12px" }}
                            >
                              Advance to {nextStage.label} <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="followup-action-footer" style={{ padding: "10px 20px", background: "#fff", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" className="secondary" onClick={() => setTrackingInquiry(null)}>Close Tracker</button>
            </div>
          </div>
        </div>
      )}

      {/* History Log Drawer / Modal */}
      {historyModalOpen && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: "600px", width: "95%", backgroundColor: "#fff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
            <div className="modal-head" style={{ backgroundColor: "#176b5b", color: "#fff", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "15px", margin: 0, fontWeight: "700" }}>Opportunity Activity Log</h2>
              <button onClick={() => setHistoryModalOpen(false)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: "20px", maxHeight: "60vh", overflowY: "auto" }}>
              {historyLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>Loading timeline...</div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No activity logs found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {historyData
                    .filter(h => !historyFilterKey || (Array.isArray(historyFilterKey) ? historyFilterKey.includes(h.property_key) : h.property_key === historyFilterKey))
                    .map(h => (
                      <div key={h.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                          <span>{new Date(h.created_at).toLocaleString()}</span>
                          <span>{h.user_name || "System"}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#334155" }}>
                          {h.property_key === "connected_source" ? (
                            <><strong>{h.remark || "Connected source logged"}</strong> on {new Date(h.created_at).toLocaleDateString()}</>
                          ) : (
                            <>Changed <strong>{h.property_name}</strong> from <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>{h.old_value || "(empty)"}</span> to <span style={{ color: "#176b5b", fontWeight: "600" }}>{h.new_value || "(empty)"}</span></>
                          )}
                        </div>
                        {h.remark && h.property_key !== "connected_source" && (
                          <div style={{ marginTop: "6px", padding: "8px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "12px", color: "#475569" }}>
                            <strong>Remark / Update:</strong> {h.remark}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled tokens tailored to base theme */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .inquiries-page { gap: 0px; }
        .inquiry-command-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          margin-bottom: 12px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .inquiry-search {
          width: min(360px, 100%);
        }
        @media (max-width: 760px) {
          .inquiry-command-bar {
            align-items: stretch;
            flex-direction: column;
          }
          .inquiry-search {
            width: 100%;
          }
        }


        .stepper-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          padding-left: 20px;
        }
        .stepper-timeline::before {
          content: "";
          position: absolute;
          top: 8px;
          left: 4px;
          bottom: 8px;
          width: 2px;
          background: #cbd5e1;
        }
        .stepper-node {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stepper-dot {
          position: absolute;
          left: -20px;
          top: 4px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #cbd5e1;
          border: 2px solid #fff;
          box-shadow: 0 0 0 1px #cbd5e1;
        }
        .stepper-node.completed .stepper-dot {
          background: #16a34a;
          box-shadow: 0 0 0 1px #16a34a;
        }
        .stepper-node.active .stepper-dot {
          background: #176b5b;
          box-shadow: 0 0 0 3px rgba(23, 107, 91, 0.2);
          transform: scale(1.2);
        }
        .stepper-title {
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
        }
        .stepper-node.active .stepper-title {
          color: #176b5b;
          font-weight: 800;
        }
        .stepper-node.completed .stepper-title {
          color: #334155;
        }

        .inquiries-page .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
        .inquiries-page .company-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: max-content; }
        .inquiries-page .company-table th,
        .inquiries-page .company-table td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left; }
        .inquiries-page .company-table thead th { background: #f8fafc; font-weight: 700; position: sticky; top: 0; z-index: 20; color: #475569; }
        .inquiries-page .filter-row th { background: #f8fafc; position: sticky; top: 38px; z-index: 15; padding: 4px 8px; }
        .inquiries-page .filter-input { width: 100%; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
        .sort-header { background: none; border: none; font: inherit; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 6px; width: 100%; color: inherit; }
        .sort-header span { color: #94a3b8; font-size: 10px; }
        .cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cell-subtext { display: block; color: #64748b; font-size: 10px; margin-top: 2px; }
        .small-action { height: 30px; padding: 0 12px; font-size: 12px; }
        .split-toolbar { gap: 12px; align-items: center; flex-wrap: wrap; }
        .followup-filter-tabs { display: inline-flex; align-items: center; gap: 6px; padding: 4px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; }
        .followup-filter-tabs button { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; color: #475569; font-size: 12px; font-weight: 700; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
        .followup-filter-tabs button.active { color: #176b5b; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); }
        
        .cell-icon-button {
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 5px;
          color: #fff;
          cursor: pointer;
          padding: 0;
          transition: transform 0.1s;
        }
        .cell-icon-button:hover { transform: scale(1.1); }
        .quick-connect-cell { display: flex; gap: 6px; align-items: center; }
        .connect-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: #fff; text-decoration: none; transition: transform 0.15s; }
        .connect-btn:hover { transform: scale(1.15); }
        .connect-btn.whatsapp { background-color: #25D366; }
        .connect-btn.call { background-color: #3b82f6; }
        .connect-btn.email { background-color: #ef4444; }
        .connect-btn.disabled { background-color: #f1f5f9; color: #cbd5e1; cursor: not-allowed; pointer-events: none; }
      `}} />
    </div>
  );
}
