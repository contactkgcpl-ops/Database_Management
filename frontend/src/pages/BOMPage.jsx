import React, { useState, useEffect } from "react";
import { ArrowLeft, Save, FileText, Upload, Download, Plus, Trash2, Calendar, Info, Send } from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";

export function BOMPage({ onBack, activeOrderId }) {
  const notify = useNotify();

  // Load Order Details
  const orderDetails = useLoad(() => api.order(activeOrderId), [activeOrderId]);
  
  const [items, setItems] = useState([]);
  const [bomStatus, setBomStatus] = useState("Draft");
  const [loadingBOM, setLoadingBOM] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vendorsList, setVendorsList] = useState([]);

  // Load vendors list for supplier dropdown
  useEffect(() => {
    api.vendors()
      .then(data => {
        if (Array.isArray(data)) {
          setVendorsList(data);
        }
      })
      .catch(err => console.error(err));
  }, []);

  // Load existing BOM if the order already has one
  useEffect(() => {
    if (orderDetails.data?.has_bom) {
      setLoadingBOM(true);
      api.getBOM(activeOrderId)
        .then(data => {
          if (data && data.items) {
            setItems(data.items.map((it, idx) => ({
              ...it,
              id: it.id || `db_${idx}_${Date.now()}`
            })));
            setBomStatus(data.status);
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingBOM(false));
    } else {
      setItems([]);
      setBomStatus("Draft");
    }
  }, [orderDetails.data, activeOrderId]);

  // CSV file template download helper
  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Item Name,Required Qty,Available Stock,Unit,Supplier,Est. Rate,Remarks\n"
      + "MS Steel Plate 2mm,10,6,Pcs,Steel World Pvt. Ltd.,45.00,Grade SS304\n"
      + "Nut Bolt M10,20,5,Pcs,Fasten Corp.,2.50,Galvanized\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "boi_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV file parser helper
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
          notify("The uploaded CSV file is empty", "error");
          return;
        }

        // Parse headers to match index keys
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item') || h.includes('material'));
        const reqQtyIdx = headers.findIndex(h => h.includes('req') || h.includes('quantity') || h.includes('qty') || h.includes('required'));
        const availIdx = headers.findIndex(h => h.includes('avail') || h.includes('stock'));
        const unitIdx = headers.findIndex(h => h.includes('unit'));
        const supplierIdx = headers.findIndex(h => h.includes('supplier'));
        const rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('cost') || h.includes('price') || h.includes('est'));
        const remarkIdx = headers.findIndex(h => h.includes('remark') || h.includes('note') || h.includes('comment'));

        if (nameIdx === -1) {
          notify("Could not find an 'Item Name' header column in the CSV.", "error");
          return;
        }

        const parsedItems = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = [];
          let current = "";
          let insideQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') insideQuotes = !insideQuotes;
            else if (char === ',' && !insideQuotes) {
              values.push(current.trim());
              current = "";
            } else current += char;
          }
          values.push(current.trim());

          const item_name = (values[nameIdx] || "").replace(/^"|"$/g, '');
          const quantity = reqQtyIdx !== -1 ? parseFloat(values[reqQtyIdx] || 0) : 1;
          const available_stock = availIdx !== -1 ? parseFloat(values[availIdx] || 0) : 0;
          const unit = unitIdx !== -1 ? (values[unitIdx] || "").replace(/^"|"$/g, '') : "Pcs";
          const supplier = supplierIdx !== -1 ? (values[supplierIdx] || "").replace(/^"|"$/g, '') : "";
          const estimated_cost = rateIdx !== -1 ? parseFloat(values[rateIdx] || 0) : 0.0;
          const remarks = remarkIdx !== -1 ? (values[remarkIdx] || "").replace(/^"|"$/g, '') : "";

          if (item_name.trim()) {
            parsedItems.push({
              item_name: item_name.trim(),
              quantity: isNaN(quantity) ? 1 : quantity,
              available_stock: isNaN(available_stock) ? 0 : available_stock,
              unit: unit || "Pcs",
              supplier: supplier || "",
              specification: "",
              estimated_cost: isNaN(estimated_cost) ? 0.0 : estimated_cost,
              remarks: remarks.trim(),
              id: `csv_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`
            });
          }
        }

        if (parsedItems.length === 0) {
          notify("No valid item rows found in the CSV file", "error");
        } else {
          setItems(prev => [...prev, ...parsedItems]);
          notify(`Successfully loaded ${parsedItems.length} items from CSV`, "success");
        }
      } catch (err) {
        notify("Failed to parse CSV file. Verify the formatting.", "error");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset input
  };

  const handleCellChange = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i === idx) {
        let val = value;
        if (field === "quantity") {
          val = parseFloat(value);
          if (isNaN(val) || val < 0) val = 0;
        } else if (field === "available_stock") {
          val = parseFloat(value);
          if (isNaN(val) || val < 0) val = 0;
        } else if (field === "estimated_cost") {
          val = parseFloat(value);
          if (isNaN(val) || val < 0) val = 0;
        }
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  const handleDeleteRow = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddBlankRow = () => {
    const blank = {
      item_name: "",
      quantity: 1,
      available_stock: 0,
      unit: "Pcs",
      supplier: "",
      specification: "",
      estimated_cost: 0,
      remarks: "",
      id: `blank_${Date.now()}_${Math.random()}`
    };
    setItems(prev => [...prev, blank]);
  };

  const handleSaveBOM = async () => {
    if (items.length === 0) {
      notify("Please add at least one item to the Bill of Materials", "error");
      return;
    }

    if (items.some(it => !it.item_name?.trim())) {
      notify("All rows must have an Item Name", "error");
      return;
    }

    setSaving(true);
    try {
      await api.saveBOM(activeOrderId, {
        items: items.map(it => ({
          item_name: it.item_name,
          quantity: Number(it.quantity),
          available_stock: Number(it.available_stock || 0),
          unit: it.unit || "Pcs",
          supplier: it.supplier || null,
          specification: it.specification || "",
          estimated_cost: Number(it.estimated_cost || 0),
          remarks: it.remarks || ""
        }))
      });
      notify("Bill of Materials saved successfully", "success");
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToPurchase = async () => {
    if (items.length === 0) {
      notify("Please add at least one item to the Bill of Materials", "error");
      return;
    }

    if (items.some(it => !it.item_name?.trim())) {
      notify("All rows must have an Item Name", "error");
      return;
    }

    if (!window.confirm("Are you sure you want to send this BOM to purchase? Once sent, it will notify the purchase department.")) return;

    setSaving(true);
    try {
      // Save the edits first
      await api.saveBOM(activeOrderId, {
        items: items.map(it => ({
          item_name: it.item_name,
          quantity: Number(it.quantity),
          available_stock: Number(it.available_stock || 0),
          unit: it.unit || "Pcs",
          supplier: it.supplier || null,
          specification: it.specification || "",
          estimated_cost: Number(it.estimated_cost || 0),
          remarks: it.remarks || ""
        }))
      });

      // Send to purchase
      await api.sendBOMToPurchase(activeOrderId);
      notify("BOM successfully sent to purchase department", "success");
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Helper to calculate total cost of BOM based on Purchase Qty * Est. Rate
  const totalCost = items.reduce((acc, it) => {
    const req = Number(it.quantity || 0);
    const avail = Number(it.available_stock || 0);
    const purchaseQty = Math.max(0, requiredQuantity(req, avail));
    return acc + (purchaseQty * Number(it.estimated_cost || 0));
  }, 0);

  function requiredQuantity(req, avail) {
    return Math.max(0, req - avail);
  }

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
    <div className="boi-view-wrapper">
      <div className="boi-container">
        {/* Header Section */}
        <div className="boi-header">
          <div>
            <h1 className="boi-title">Create BOI</h1>
            {orderDetails.data && (
              <span className="boi-subtitle">Order No: {orderDetails.data.order_number}</span>
            )}
          </div>
          <button type="button" className="boi-btn-back" onClick={onBack}>
            <ArrowLeft size={16} /> Back to BOM
          </button>
        </div>

        {loadingBOM ? (
          <div className="boi-loading">Loading BOI details...</div>
        ) : (
          <div className="stack" style={{ gap: "24px" }}>
            
            {/* Summary cards row */}
            <div className="boi-summary-bar">
              <div className="boi-summary-card">
                <div className="boi-summary-field">
                  <span className="boi-summary-label">Order No</span>
                  <span className="boi-summary-val">{orderDetails.data?.order_number || "-"}</span>
                </div>
                <div className="boi-summary-field">
                  <span className="boi-summary-label">Company</span>
                  <span className="boi-summary-val">{orderDetails.data?.company_name || "-"}</span>
                </div>
                <div className="boi-summary-field">
                  <span className="boi-summary-label">BOI Status</span>
                  <span className={`boi-status-badge ${bomStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                    {bomStatus}
                  </span>
                </div>
                <div className="boi-summary-field">
                  <span className="boi-summary-label">Created Date</span>
                  <span className="boi-summary-val boi-date-val">
                    <Calendar size={15} style={{ marginRight: "6px", color: "#64748b" }} />
                    {formatDate(orderDetails.data?.created_at)}
                  </span>
                </div>
              </div>

              <div className="boi-total-amount-card">
                <span className="boi-summary-label">BOI Total Amount</span>
                <span className="boi-total-amount-val">
                  ₹{Number(orderDetails.data?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Main Items Block */}
            <div className="boi-card">
              <div className="boi-card-header">
                <h2 className="boi-card-title">BOI Items</h2>
                <div className="boi-toolbar-actions">
                  <label className="boi-btn-secondary" style={{ cursor: "pointer" }}>
                    <Upload size={15} /> Upload CSV
                    <input type="file" accept=".csv" onChange={handleCSVUpload} hidden />
                  </label>
                  <button type="button" className="boi-btn-secondary" onClick={handleDownloadTemplate}>
                    <Download size={15} /> Download Template
                  </button>
                  <button type="button" className="boi-btn-primary" onClick={handleAddBlankRow}>
                    <Plus size={15} /> Add New Item
                  </button>
                </div>
              </div>

              <div className="boi-table-wrap">
                <table className="boi-table">
                  <thead>
                    <tr>
                      <th style={{ width: "45px", textAlign: "center" }}>#</th>
                      <th style={{ minWidth: "200px" }}>Item Name *<br /><small style={{ fontSize: "10px", fontWeight: "normal", color: "#64748b" }}>(Double click to edit)</small></th>
                      <th style={{ width: "110px", textAlign: "center" }}>Required Qty *</th>
                      <th style={{ width: "125px", textAlign: "center" }}>Available Stock</th>
                      <th style={{ width: "125px", textAlign: "center" }}>Purchase Qty<br /><small style={{ fontSize: "10px", fontWeight: "normal", color: "#64748b" }}>(Auto)</small></th>
                      <th style={{ width: "95px", textAlign: "center" }}>Unit</th>
                      <th style={{ width: "200px" }}>Supplier</th>
                      <th style={{ width: "120px", textAlign: "right" }}>Est. Rate (₹)</th>
                      <th style={{ width: "140px", textAlign: "right" }}>Total Amount (₹)<br /><small style={{ fontSize: "10px", fontWeight: "normal", color: "#64748b" }}>(Auto)</small></th>
                      <th style={{ width: "60px", textAlign: "center" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="boi-empty-row">
                          No items added. Click "Add New Item" or "Upload CSV" to begin.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => {
                        const required = Number(item.quantity || 0);
                        const available = Number(item.available_stock || 0);
                        const purchaseQty = Math.max(0, required - available);
                        const lineTotal = purchaseQty * Number(item.estimated_cost || 0);
                        const isStockLow = available < required;

                        return (
                          <tr key={item.id || idx}>
                            <td style={{ textAlign: "center", fontWeight: "600", color: "#64748b" }}>{idx + 1}</td>
                            
                            {/* Item Name */}
                            <td>
                              <input
                                type="text"
                                className="boi-cell-input"
                                value={item.item_name}
                                placeholder="Enter item name..."
                                onChange={(e) => handleCellChange(idx, "item_name", e.target.value)}
                              />
                            </td>

                            {/* Required Qty */}
                            <td>
                              <input
                                type="number"
                                className="boi-cell-input text-center"
                                value={item.quantity}
                                min="0"
                                step="any"
                                onChange={(e) => handleCellChange(idx, "quantity", e.target.value)}
                              />
                            </td>

                            {/* Available Stock */}
                            <td>
                              <input
                                type="number"
                                className={`boi-cell-input text-center font-bold ${isStockLow ? "color-red" : "color-green"}`}
                                value={item.available_stock}
                                min="0"
                                step="any"
                                onChange={(e) => handleCellChange(idx, "available_stock", e.target.value)}
                              />
                            </td>

                            {/* Purchase Qty (Auto) */}
                            <td>
                              <input
                                type="number"
                                className="boi-cell-input text-center font-bold"
                                value={purchaseQty}
                                disabled
                                style={{ backgroundColor: "#f8fafc", color: "#334155" }}
                              />
                            </td>

                            {/* Unit */}
                            <td>
                              <input
                                type="text"
                                className="boi-cell-input text-center"
                                value={item.unit}
                                placeholder="e.g. Pcs"
                                onChange={(e) => handleCellChange(idx, "unit", e.target.value)}
                              />
                            </td>

                            {/* Supplier dropdown list */}
                            <td>
                              <select
                                className="boi-cell-select"
                                value={item.supplier || ""}
                                onChange={(e) => handleCellChange(idx, "supplier", e.target.value)}
                              >
                                <option value="">- Select Supplier -</option>
                                {vendorsList.map((v) => (
                                  <option key={v.id} value={v.company_name}>
                                    {v.company_name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Est. Rate */}
                            <td>
                              <input
                                type="number"
                                className="boi-cell-input text-right"
                                value={item.estimated_cost}
                                min="0"
                                step="0.01"
                                onChange={(e) => handleCellChange(idx, "estimated_cost", e.target.value)}
                              />
                            </td>

                            {/* Line Total */}
                            <td style={{ textAlign: "right", fontWeight: "700", color: "#334155", paddingRight: "16px" }}>
                              ₹{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Actions */}
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="boi-btn-delete"
                                onClick={() => handleDeleteRow(idx)}
                                title="Delete Item"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Dashed Add Button */}
              <button type="button" className="boi-btn-add-dashed" onClick={handleAddBlankRow}>
                <Plus size={16} /> Add New Item
              </button>

              {/* Summary totals row */}
              <div className="boi-totals-bar">
                <div className="boi-totals-item">
                  <span>Total Items:</span>
                  <strong>{items.length}</strong>
                </div>
                <div className="boi-totals-item" style={{ fontSize: "16px" }}>
                  <span>Total Amount:</span>
                  <strong style={{ color: "#16a34a" }}>
                    ₹{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Informational Tip Banner */}
            <div className="boi-tip-banner">
              <Info size={16} style={{ color: "#2563eb", flexShrink: 0 }} />
              <span>Tip: Double-click any cell to edit its content inline. Press Enter to save.</span>
            </div>

            {/* Main Action Buttons */}
            <div className="boi-footer-actions">
              <button type="button" className="boi-btn-cancel" onClick={onBack}>
                Cancel
              </button>
              <button
                type="button"
                className="boi-btn-save-draft"
                onClick={handleSaveBOM}
                disabled={saving || items.length === 0}
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="button"
                className="boi-btn-submit"
                onClick={handleSubmitToPurchase}
                disabled={saving || items.length === 0}
              >
                <Send size={16} />
                {saving ? "Submitting..." : "Submit to Purchase"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .boi-view-wrapper {
          background: #f8fafc;
          min-height: calc(100vh - 80px);
          margin: -20px;
          padding: 20px;
        }
        .boi-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 8px 16px 40px;
          color: #1e293b;
        }
        .boi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .boi-title {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .boi-subtitle {
          font-size: 13px;
          color: #64748b;
          display: block;
          margin-top: 4px;
        }
        .boi-btn-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s;
        }
        .boi-btn-back:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .boi-loading {
          text-align: center;
          padding: 60px;
          font-size: 15px;
          color: #64748b;
        }
        .boi-summary-bar {
          display: grid;
          grid-template-columns: 3fr 1.2fr;
          gap: 20px;
        }
        .boi-summary-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .boi-summary-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .boi-summary-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .boi-summary-val {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
        }
        .boi-date-val {
          display: flex;
          align-items: center;
        }
        .boi-status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          width: fit-content;
        }
        .boi-status-badge.draft {
          background-color: #ffedd5;
          color: #d97706;
          border: 1px solid #fed7aa;
        }
        .boi-status-badge.sent-to-purchase {
          background-color: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .boi-status-badge.bom-sent-to-purchase {
          background-color: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .boi-total-amount-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px 24px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-end;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .boi-total-amount-val {
          font-size: 22px;
          font-weight: 800;
          color: #16a34a;
          margin-top: 4px;
        }
        .boi-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          overflow: hidden;
          padding: 24px;
        }
        .boi-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .boi-card-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .boi-toolbar-actions {
          display: flex;
          gap: 10px;
        }
        .boi-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0f766e;
          border: 1px solid #0d9488;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }
        .boi-btn-primary:hover {
          background: #115e59;
          border-color: #0f766e;
        }
        .boi-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          transition: all 0.2s;
        }
        .boi-btn-secondary:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .boi-table-wrap {
          overflow-x: auto;
          margin-bottom: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .boi-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .boi-table th {
          background-color: #f8fafc;
          color: #475569;
          font-weight: 700;
          padding: 12px 14px;
          border-bottom: 2px solid #e2e8f0;
          text-align: left;
          white-space: nowrap;
        }
        .boi-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .boi-cell-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          color: #1e293b;
          background-color: #fff;
          transition: border-color 0.15s;
        }
        .boi-cell-input:focus {
          border-color: #0f766e;
          outline: none;
          box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.1);
        }
        .boi-cell-select {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          color: #1e293b;
          background-color: #fff;
          cursor: pointer;
        }
        .boi-cell-select:focus {
          border-color: #0f766e;
          outline: none;
        }
        .boi-cell-input.text-center {
          text-align: center;
        }
        .boi-cell-input.text-right {
          text-align: right;
        }
        .font-bold {
          font-weight: 700;
        }
        .color-green {
          color: #16a34a !important;
          border-color: #bbf7d0 !important;
          background-color: #f0fdf4 !important;
        }
        .color-red {
          color: #dc2626 !important;
          border-color: #fecaca !important;
          background-color: #fef2f2 !important;
        }
        .boi-empty-row {
          text-align: center;
          padding: 32px !important;
          color: #64748b;
          font-style: italic;
        }
        .boi-btn-delete {
          background: transparent;
          border: none;
          color: #ef4444;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s;
        }
        .boi-btn-delete:hover {
          background: #fee2e2;
        }
        .boi-btn-add-dashed {
          width: 100%;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          background: transparent;
          color: #0f766e;
          padding: 10px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.2s;
        }
        .boi-btn-add-dashed:hover {
          border-color: #0d9488;
          background-color: #f0fdfa;
        }
        .boi-totals-bar {
          display: flex;
          justify-content: flex-end;
          gap: 24px;
          margin-top: 20px;
          border-top: 1px solid #f1f5f9;
          padding-top: 16px;
        }
        .boi-totals-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #475569;
        }
        .boi-totals-item strong {
          color: #0f172a;
          font-size: 15px;
        }
        .boi-tip-banner {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 12px 16px;
          background-color: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          color: #1e40af;
          font-size: 13px;
        }
        .boi-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
        }
        .boi-btn-cancel {
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 6px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .boi-btn-cancel:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .boi-btn-save-draft {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0f766e;
          border: 1px solid #0d9488;
          color: #fff;
          border-radius: 6px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .boi-btn-save-draft:hover {
          background: #115e59;
        }
        .boi-btn-submit {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #115e59;
          border: 1px solid #0f766e;
          color: #fff;
          border-radius: 6px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .boi-btn-submit:hover {
          background: #134e4a;
        }
        `
      }} />
    </div>
  );
}
