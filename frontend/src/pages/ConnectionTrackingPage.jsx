import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  ClipboardList,
  Search,
  Globe,
  Building2,
  Filter,
  Check,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  Layers
} from "lucide-react";
import { api } from "../api";
import { useNotify } from "../components/NotificationProvider";
import { useLoad } from "../hooks/useLoad";

// Custom Multi-Select Dropdown Component
function MultiSelectDropdown({ label, options, selected, onChange, icon: Icon, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => {
      const text = typeof opt === "string" ? opt : (opt.label || opt.name || "");
      return text.toLowerCase().includes(search.toLowerCase());
    });
  }, [options, search]);

  const handleToggle = (value) => {
    const isSelected = selected.includes(value);
    if (isSelected) {
      onChange(selected.filter(item => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    const allValues = options.map(opt => typeof opt === "string" ? opt : (opt.value !== undefined ? opt.value : opt.id));
    onChange(allValues);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const getButtonText = () => {
    if (selected.length === 0) return placeholder || `Select ${label}`;
    if (selected.length === 1) {
      const opt = options.find(o => (typeof o === "string" ? o : (o.value !== undefined ? o.value : o.id)) === selected[0]);
      return opt ? (typeof opt === "string" ? opt : (opt.label || opt.name)) : `${selected.length} Selected`;
    }
    return `${selected.length} Selected`;
  };

  return (
    <div className="multiselect-wrap" ref={dropdownRef}>
      <button
        type="button"
        className={`multiselect-trigger ${selected.length > 0 ? "has-selection" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon size={14} className="trigger-icon" />
        <span className="trigger-text">{getButtonText()}</span>
        <ChevronDown size={14} className={`arrow-icon ${isOpen ? "open" : ""}`} />
      </button>

      {isOpen && (
        <div className="multiselect-dropdown-menu">
          <div className="menu-search-box">
            <Search size={12} className="menu-search-icon" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="menu-actions">
            <button type="button" onClick={handleSelectAll}>Select All</button>
            <button type="button" onClick={handleClearAll}>Clear All</button>
          </div>

          <div className="menu-options-list">
            {filteredOptions.length === 0 ? (
              <div className="no-options">No options match</div>
            ) : (
              filteredOptions.map((opt, index) => {
                const labelText = typeof opt === "string" ? opt : (opt.label || opt.name);
                const value = typeof opt === "string" ? opt : (opt.value !== undefined ? opt.value : opt.id);
                const isChecked = selected.includes(value);

                return (
                  <label key={index} className="menu-option-item">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(value)}
                    />
                    <span className="checkbox-custom">
                      {isChecked && <Check size={10} />}
                    </span>
                    <span className="option-label" title={labelText}>{labelText}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectionTrackingPage() {
  const notify = useNotify();

  // Filter choices loaded from database
  const filtersData = useLoad(() => api.trackingFilters());
  // Load Indian states and cities mapping
  const geoData = useLoad(() => api.statesAndCities(), []);

  // Active selected filters
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [selectedIndustries, setSelectedIndustries] = useState([]);

  // Fetch tracking data based on selected filters
  const [trackingRows, setTrackingRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filtersApplied, setFiltersApplied] = useState(false);

  const filterStatesList = filtersData.data?.states || [];
  const filterCompaniesList = filtersData.data?.companies || [];
  const filterIndustriesList = filtersData.data?.industries || [];

  const blendDataWithAllCities = (backendData) => {
    if (!geoData.data || !geoData.data.states || selectedStates.length === 0) {
      return backendData;
    }

    // Find all districts for the selected states
    const targetCities = new Set();
    geoData.data.states.forEach(stateObj => {
      if (selectedStates.includes(stateObj.state)) {
        if (Array.isArray(stateObj.districts)) {
          stateObj.districts.forEach(d => {
            if (d) targetCities.add(d.trim());
          });
        }
      }
    });

    // Create a map of backend results keyed by normalized city name
    const backendDataMap = new Map();
    backendData.forEach(row => {
      const cityKey = (row.city || "").trim().toLowerCase();
      backendDataMap.set(cityKey, row);
    });

    const finalRows = [];
    const processedBackendKeys = new Set();

    // 1. Process target cities from geo data
    targetCities.forEach(city => {
      const cityKey = city.toLowerCase();
      if (backendDataMap.has(cityKey)) {
        finalRows.push(backendDataMap.get(cityKey));
        processedBackendKeys.add(cityKey);
      } else {
        // City exists in geo data but has no tracking records
        finalRows.push({
          city: city,
          total_data: 0,
          whatsapp_done: 0,
          whatsapp_pending: 0,
          email_done: 0,
          email_pending: 0,
          call_done: 0,
          call_pending: 0,
          social_media_done: 0,
          social_media_pending: 0,
          verify_pending: 0,
          verify_verified: 0,
          verify_invalid: 0
        });
      }
    });

    // 2. Add any other cities that were in the backend response but not in targetCities list
    backendData.forEach(row => {
      const cityKey = (row.city || "").trim().toLowerCase();
      if (!processedBackendKeys.has(cityKey)) {
        finalRows.push(row);
      }
    });

    // Sort alphabetically by city name
    return finalRows.sort((a, b) => (a.city || "").localeCompare(b.city || ""));
  };

  const fetchTrackingData = async () => {
    if (selectedStates.length === 0 || selectedIndustries.length === 0) {
      notify("Please select State and Industries (compulsory) to apply filter", "warning");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.connectionTracking({
        states: selectedStates,
        companies: selectedCompanies,
        industries: selectedIndustries
      });
      const blendedData = blendDataWithAllCities(data);
      setTrackingRows(blendedData);
      setFiltersApplied(true);
    } catch (err) {
      setError(err.message || "Failed to load tracking data");
      notify(err.message || "Failed to load tracking data", "error");
    } finally {
      setLoading(false);
    }
  };

  // Do not automatically load grid data on mount/filters load, keep it blank initially.

  const handleResetFilters = () => {
    setSelectedStates([]);
    setSelectedCompanies([]);
    setSelectedIndustries([]);
    setTrackingRows([]);
    setFiltersApplied(false);
    setError(null);
    notify("Filters cleared", "info");
  };

  // Compute column totals
  const totals = useMemo(() => {
    const sum = {
      total_data: 0,
      whatsapp_done: 0,
      whatsapp_pending: 0,
      email_done: 0,
      email_pending: 0,
      call_done: 0,
      call_pending: 0,
      social_media_done: 0,
      social_media_pending: 0,
      verify_pending: 0,
      verify_verified: 0,
      verify_invalid: 0,
    };
    trackingRows.forEach(row => {
      sum.total_data += row.total_data;
      sum.whatsapp_done += row.whatsapp_done;
      sum.whatsapp_pending += row.whatsapp_pending;
      sum.email_done += row.email_done;
      sum.email_pending += row.email_pending;
      sum.call_done += row.call_done;
      sum.call_pending += row.call_pending;
      sum.social_media_done += row.social_media_done;
      sum.social_media_pending += row.social_media_pending;
      sum.verify_pending += row.verify_pending || 0;
      sum.verify_verified += row.verify_verified || 0;
      sum.verify_invalid += row.verify_invalid || 0;
    });
    return sum;
  }, [trackingRows]);

  return (
    <div className="connection-tracking-page">


      {/* Filter panel */}
      <div className="filters-panel">
        <div className="filter-dropdowns-row">
          <MultiSelectDropdown
            label="State *"
            options={filterStatesList}
            selected={selectedStates}
            onChange={setSelectedStates}
            icon={Globe}
            placeholder="Select State(s) *"
          />

          <MultiSelectDropdown
            label="Company"
            options={filterCompaniesList}
            selected={selectedCompanies}
            onChange={setSelectedCompanies}
            icon={Building2}
            placeholder="All Companies"
          />

          <MultiSelectDropdown
            label="Industries *"
            options={filterIndustriesList}
            selected={selectedIndustries}
            onChange={setSelectedIndustries}
            icon={Layers}
            placeholder="Select Industry/ies *"
          />

          <button
            type="button"
            className="apply-filters-btn"
            onClick={fetchTrackingData}
            disabled={loading}
          >
            <Filter size={13} /> Apply Filter
          </button>

          {(selectedStates.length > 0 || selectedCompanies.length > 0 || selectedIndustries.length > 0) && (
            <button
              type="button"
              className="reset-filters-btn"
              onClick={handleResetFilters}
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="sheet-container">
        {filtersData.loading || (loading && trackingRows.length === 0) ? (
          <div className="sheet-loading">Loading tracking sheet data...</div>
        ) : error ? (
          <div className="sheet-error">
            <AlertTriangle size={24} />
            <span>Error loading sheet: {error}</span>
          </div>
        ) : !filtersApplied ? (
          <div className="sheet-empty">
            <Filter size={40} className="empty-icon" style={{ color: "#176b5b" }} />
            <h3>Select Filters to View Data</h3>
            <p>Please select State and Industries (Compulsory) and click "Apply Filter" to load the connection tracking sheet.</p>
          </div>
        ) : trackingRows.length === 0 ? (
          <div className="sheet-empty">
            <ClipboardList size={40} className="empty-icon" />
            <h3>No data matching filters</h3>
            <p>Try modifying your State, Company, or Industry filters to display statistics.</p>
          </div>
        ) : (
          <div className="sheet-table-wrapper">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th rowSpan="2" className="city-col">City</th>
                  <th rowSpan="2" className="total-col">Total Data</th>
                  <th colSpan="2" className="channel-group whatsapp-grp">Whatsapp</th>
                  <th colSpan="2" className="channel-group email-grp">Email</th>
                  <th colSpan="2" className="channel-group call-grp">Call</th>
                  <th colSpan="2" className="channel-group social-grp">Social Media Connect</th>
                  <th colSpan="3" className="channel-group verification-grp">Verification Status</th>
                </tr>
                <tr className="sub-headers">
                  <th className="pending-sub">Pending</th>
                  <th className="done-sub">Done</th>
                  <th className="pending-sub">Pending</th>
                  <th className="done-sub">Done</th>
                  <th className="pending-sub">Pending</th>
                  <th className="done-sub">Done</th>
                  <th className="pending-sub">Pending</th>
                  <th className="done-sub">Done</th>
                  <th className="pending-sub">Pending</th>
                  <th className="done-sub">Verified</th>
                  <th className="invalid-sub">Invalid</th>
                </tr>
              </thead>
              <tbody>
                {trackingRows.map((row, index) => (
                  <tr key={index} className={row.total_data === 0 ? "no-data-row" : ""}>
                    <td className="city-cell">{row.city}</td>
                    <td className="total-cell">{row.total_data}</td>

                    {/* Whatsapp */}
                    <td className="pending-cell">{row.whatsapp_pending}</td>
                    <td
                      className="done-cell"
                      style={row.total_data > 0 && row.whatsapp_done === 0 ? { color: "#dc2626", fontWeight: "700" } : {}}
                    >
                      {row.whatsapp_done}
                    </td>

                    {/* Email */}
                    <td className="pending-cell">{row.email_pending}</td>
                    <td
                      className="done-cell"
                      style={row.total_data > 0 && row.email_done === 0 ? { color: "#dc2626", fontWeight: "700" } : {}}
                    >
                      {row.email_done}
                    </td>

                    {/* Call */}
                    <td className="pending-cell">{row.call_pending}</td>
                    <td
                      className="done-cell"
                      style={row.total_data > 0 && row.call_done === 0 ? { color: "#dc2626", fontWeight: "700" } : {}}
                    >
                      {row.call_done}
                    </td>

                    {/* Social Media Connect */}
                    <td className="pending-cell">{row.social_media_pending}</td>
                    <td
                      className="done-cell"
                      style={row.total_data > 0 && row.social_media_done === 0 ? { color: "#dc2626", fontWeight: "700" } : {}}
                    >
                      {row.social_media_done}
                    </td>

                    {/* Verification Status */}
                    <td className="pending-cell">{row.verify_pending}</td>
                    <td
                      className="done-cell"
                      style={
                        row.total_data > 0
                          ? {
                              color: row.verify_verified >= row.total_data ? "#16a34a" : (row.verify_verified === 0 ? "#dc2626" : "#000000"),
                              fontWeight: "700",
                              textAlign: "center"
                            }
                          : { textAlign: "center" }
                      }
                    >
                      {row.verify_verified}
                    </td>
                    <td className="invalid-cell" style={{ textAlign: "center" }}>{row.verify_invalid}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="city-cell">TOTAL SUM</td>
                  <td className="total-cell">{totals.total_data}</td>

                  {/* Whatsapp totals */}
                  <td className="pending-cell">{totals.whatsapp_pending}</td>
                  <td className="done-cell">{totals.whatsapp_done}</td>

                  {/* Email totals */}
                  <td className="pending-cell">{totals.email_pending}</td>
                  <td className="done-cell">{totals.email_done}</td>

                  {/* Call totals */}
                  <td className="pending-cell">{totals.call_pending}</td>
                  <td className="done-cell">{totals.call_done}</td>

                  {/* Social Media Connect totals */}
                  <td className="pending-cell">{totals.social_media_pending}</td>
                  <td className="done-cell">{totals.social_media_done}</td>

                  {/* Verification Status totals */}
                  <td className="pending-cell" style={{ fontWeight: "800" }}>{totals.verify_pending}</td>
                  <td
                    className="done-cell"
                    style={{
                      fontWeight: "800",
                      color: totals.total_data > 0 ? (totals.verify_verified >= totals.total_data ? "#16a34a" : (totals.verify_verified === 0 ? "#dc2626" : "#000000")) : "#000000",
                      textAlign: "center"
                    }}
                  >
                    {totals.verify_verified}
                  </td>
                  <td className="invalid-cell" style={{ fontWeight: "800", textAlign: "center" }}>{totals.verify_invalid}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .connection-tracking-page {
          display: flex;
          flex-direction: column;
          gap: 20px;
          font-family: 'Inter', sans-serif;
          color: #1e293b;
        }
        .page-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
        }
        .page-title {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        .page-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
        
        /* Filters panel styling */
        .filters-panel {
          background: #ffffff;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
        }
        .filter-dropdowns-row {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          align-items: center;
          width: 100%;
        }
        .reset-filters-btn {
          background: transparent;
          border: 1px solid #cbd5e1;
          color: #64748b;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s, color 0.2s;
          margin-left: auto;
        }
        .reset-filters-btn:hover {
          background-color: #f1f5f9;
          color: #334155;
        }
        .apply-filters-btn {
          background-color: #176b5b;
          border: 1px solid #176b5b;
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .apply-filters-btn:hover {
          background-color: #115246;
          border-color: #115246;
        }
        .apply-filters-btn:disabled {
          background-color: #cbd5e1;
          border-color: #cbd5e1;
          color: #94a3b8;
          cursor: not-allowed;
        }

        /* Multiselect styling */
        .multiselect-wrap {
          position: relative;
          width: 220px;
        }
        .multiselect-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          cursor: pointer;
          font-size: 12.5px;
          color: #475569;
          outline: none;
          text-align: left;
          transition: border-color 0.2s, background-color 0.2s;
        }
        .multiselect-trigger:hover {
          border-color: #94a3b8;
          background-color: #f8fafc;
        }
        .multiselect-trigger.has-selection {
          border-color: #176b5b;
          background-color: #f0fdf4;
          color: #166534;
          font-weight: 600;
        }
        .trigger-icon {
          color: #94a3b8;
          flex-shrink: 0;
        }
        .multiselect-trigger.has-selection .trigger-icon {
          color: #176b5b;
        }
        .trigger-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .arrow-icon {
          color: #94a3b8;
          transition: transform 0.2s;
        }
        .arrow-icon.open {
          transform: rotate(180deg);
        }
        .multiselect-dropdown-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 50;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          max-height: 280px;
          overflow: hidden;
          animation: slideDown 0.15s ease-out;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .menu-search-box {
          position: relative;
          display: flex;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .menu-search-icon {
          position: absolute;
          left: 20px;
          color: #94a3b8;
        }
        .menu-search-box input {
          width: 100%;
          padding: 6px 10px 6px 26px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 11.5px;
          outline: none;
        }
        .menu-search-box input:focus {
          border-color: #176b5b;
        }
        .menu-actions {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          background-color: #f8fafc;
          border-bottom: 1px solid #f1f5f9;
        }
        .menu-actions button {
          background: transparent;
          border: none;
          color: #176b5b;
          font-size: 10.5px;
          font-weight: 700;
          cursor: pointer;
          padding: 2px 4px;
        }
        .menu-actions button:hover {
          text-decoration: underline;
        }
        .menu-options-list {
          overflow-y: auto;
          flex: 1;
          padding: 6px 0;
        }
        .no-options {
          padding: 12px;
          text-align: center;
          font-size: 11.5px;
          color: #94a3b8;
        }
        .menu-option-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.15s;
        }
        .menu-option-item:hover {
          background-color: #f8fafc;
        }
        .menu-option-item input {
          display: none;
        }
        .checkbox-custom {
          width: 15px;
          height: 15px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          flex-shrink: 0;
          color: #ffffff;
        }
        .menu-option-item input:checked + .checkbox-custom {
          background: #176b5b;
          border-color: #176b5b;
        }
        .option-label {
          font-size: 12px;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .menu-option-item input:checked ~ .option-label {
          font-weight: 600;
          color: #0f172a;
        }

        /* Spreadsheet grid styling */
        .sheet-container {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .sheet-loading, .sheet-error, .sheet-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }
        .sheet-loading {
          color: #64748b;
          font-weight: 600;
        }
        .sheet-error {
          color: #ef4444;
          gap: 10px;
        }
        .sheet-empty h3 {
          margin: 12px 0 6px 0;
          font-size: 16px;
          color: #0f172a;
        }
        .sheet-empty p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
          max-width: 340px;
          line-height: 1.4;
        }
        .empty-icon {
          color: #94a3b8;
        }
        
        .sheet-table-wrapper {
          overflow-x: auto;
          width: 100%;
        }
        
        .spreadsheet-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12.5px;
        }
        
        .spreadsheet-table th, 
        .spreadsheet-table td {
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
        }
        
        .spreadsheet-table th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: 700;
          text-align: center;
          vertical-align: middle;
        }
        
        .spreadsheet-table thead tr th {
          border-bottom: 2px solid #cbd5e1;
        }
        
        .spreadsheet-table thead tr:first-child th {
          font-size: 13px;
        }
        
        .sub-headers th {
          font-size: 11px;
          font-weight: 600;
          background-color: #f8fafc;
          color: #475569;
          border-top: none;
        }
        
        /* Columns styling */
        .city-col {
          text-align: left !important;
          min-width: 160px;
        }
        .total-col {
          min-width: 90px;
          background-color: #f1f5f9 !important;
        }
        
        .channel-group {
          font-size: 12px;
          border-bottom: none;
        }
        
        .city-cell {
          font-weight: 700;
          color: #0f172a;
          background-color: #fff;
        }
        
        .total-cell {
          text-align: center;
          font-weight: 800;
          background-color: #f8fafc;
          color: #1e293b;
        }
        
        .pending-cell, .done-cell {
          text-align: center;
          font-weight: 500;
        }
        
        .highlight-pending {
          color: #d97706; /* Amber warning text */
          background-color: #fffbeb;
          font-weight: 600;
        }
        
        .highlight-done {
          color: #166534; /* Green success text */
          background-color: #f0fdf4;
          font-weight: 700;
        }
        /* Zero-data row styling */
        .no-data-row {
          background-color: #fef2f2 !important;
          color: #991b1b !important;
        }
        .no-data-row td {
          background-color: #fef2f2 !important;
          color: #991b1b !important;
        }
        .no-data-row .city-cell {
          background-color: #fef2f2 !important;
          color: #991b1b !important;
        }
        .no-data-row .total-cell {
          background-color: #fef2f2 !important;
          color: #991b1b !important;
        }

        /* Totals footer row */
        .totals-row {
          background-color: #e2e8f0;
          font-weight: 800;
        }
        .totals-row td {
          border-top: 2px solid #94a3b8;
          border-bottom: 2px solid #94a3b8;
          background-color: #edf2f7;
          color: #0f172a;
          text-align: center;
          font-weight: 800;
        }
        .totals-row .city-cell {
          text-align: left;
          background-color: #e2e8f0;
        }
        .totals-row .total-cell {
          background-color: #e2e8f0;
        }
      ` }} />
    </div>
  );
}
