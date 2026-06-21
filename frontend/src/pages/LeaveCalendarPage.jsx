import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { LeaveDetailsDrawer } from "./LeaveDetailsDrawer";

export function LeaveCalendarPage({ setPage }) {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarItems, setCalendarItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeaveId, setSelectedLeaveId] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-indexed for backend

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      const data = await api.leaveCalendar(month, year);
      setCalendarItems(data);
    } catch (err) {
      console.error("Failed to load leave calendar items", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Generate days in the calendar grid
  const getDaysInMonth = () => {
    const firstDayIndex = new Date(year, currentDate.getMonth(), 1).getDay();
    const totalDays = new Date(year, month, 0).getDate();
    const prevMonthTotalDays = new Date(year, currentDate.getMonth(), 0).getDate();

    const days = [];

    // Fill preceding blank days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        dayNumber: prevMonthTotalDays - i,
        isCurrentMonth: false,
        dateString: `${year}-${String(currentDate.getMonth()).padStart(2, "0")}-${String(prevMonthTotalDays - i).padStart(2, "0")}`
      });
    }

    // Fill current month days
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dayNumber: i,
        isCurrentMonth: true,
        dateString: dateStr
      });
    }

    // Fill succeeding blank days
    const totalCells = 42; // standard 6 rows
    const remainingCells = totalCells - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        dayNumber: i,
        isCurrentMonth: false,
        dateString: `${year}-${String(currentDate.getMonth() + 2).padStart(2, "0")}-${String(i).padStart(2, "0")}`
      });
    }

    return days;
  };

  const daysGrid = getDaysInMonth();
  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const getItemsForDate = (dateStr) => {
    return calendarItems.filter((item) => {
      const itemFrom = item.from_date;
      const itemTo = item.to_date;
      return dateStr >= itemFrom && dateStr <= itemTo;
    });
  };

  return (
    <div className="calendar-page-container">
      {/* Header */}
      <div className="calendar-header-nav">
        <button className="back-btn" onClick={() => setPage("leave-my")}>
          <ArrowLeft size={16} /> My Leaves
        </button>
        
        <div className="calendar-controls">
          <div className="month-selector">
            <button className="ctrl-btn" onClick={handlePrevMonth}>
              <ChevronLeft size={18} />
            </button>
            <h2>{monthName} {year}</h2>
            <button className="ctrl-btn" onClick={handleNextMonth}>
              <ChevronRight size={18} />
            </button>
          </div>
          <button className="today-btn" onClick={handleToday}>
            Today
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <div className="legend-item"><span className="dot approved-leave"></span>Approved Leave</div>
        <div className="legend-item"><span className="dot pending-leave"></span>Pending Leave</div>
        <div className="legend-item"><span className="dot holiday"></span>Holiday</div>
        <div className="legend-item"><span className="dot week-off"></span>Week Off (Sunday)</div>
      </div>

      {loading ? (
        <div className="loader">Loading Calendar...</div>
      ) : (
        <div className="calendar-card">
          <div className="weekday-header">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="calendar-grid">
            {daysGrid.map((cell, idx) => {
              const items = cell.isCurrentMonth ? getItemsForDate(cell.dateString) : [];
              const isToday = cell.isCurrentMonth && new Date().toDateString() === new Date(year, currentDate.getMonth(), cell.dayNumber).toDateString();
              
              return (
                <div 
                  className={`calendar-cell ${cell.isCurrentMonth ? "current" : "other"} ${isToday ? "today" : ""}`}
                  key={idx}
                >
                  <span className="day-number">{cell.dayNumber}</span>
                  <div className="cell-events">
                    {items.map((item, itemIdx) => {
                      let itemClass = "event-item ";
                      if (item.type === "holiday") itemClass += "holiday";
                      else if (item.type === "week_off") itemClass += "week-off";
                      else itemClass += item.status.toLowerCase();

                      return (
                        <div
                          className={itemClass}
                          key={itemIdx}
                          title={`${item.title}`}
                          onClick={() => {
                            if (item.id) {
                              setSelectedLeaveId(item.id);
                            }
                          }}
                          style={{ cursor: item.id ? "pointer" : "default" }}
                        >
                          <span className="event-title">{item.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer */}
      {selectedLeaveId && (
        <LeaveDetailsDrawer
          leaveId={selectedLeaveId}
          currentUser={user}
          onClose={() => setSelectedLeaveId(null)}
          onRefresh={fetchCalendarData}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .calendar-page-container {
          padding: 16px;
        }
        .calendar-header-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .back-btn {
          border: none;
          background: transparent;
          color: #64748b;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .back-btn:hover {
          color: #0f172a;
        }
        
        .calendar-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .month-selector {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .month-selector h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
          min-width: 160px;
          text-align: center;
        }
        .ctrl-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          color: #475569;
          display: flex;
          align-items: center;
        }
        .ctrl-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .today-btn {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          padding: 6px 14px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          color: #0f172a;
        }
        .today-btn:hover {
          background: #f1f5f9;
        }
        
        .calendar-legend {
          display: flex;
          gap: 20px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .dot.approved-leave { background: #16a34a; }
        .dot.pending-leave { background: #d97706; }
        .dot.holiday { background: #0f766e; }
        .dot.week-off { background: #cbd5e1; }
        
        .loader {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
        
        .calendar-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          overflow: hidden;
        }
        
        .weekday-header {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          text-align: center;
          font-weight: 700;
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 10px 0;
        }
        
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          grid-auto-rows: minmax(100px, 1fr);
          border-collapse: collapse;
        }
        
        .calendar-cell {
          border-right: 1px solid #f1f5f9;
          border-bottom: 1px solid #f1f5f9;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: #ffffff;
        }
        .calendar-cell:nth-child(7n) {
          border-right: none;
        }
        .calendar-cell.other {
          background: #fafbfc;
        }
        .calendar-cell.other .day-number {
          color: #cbd5e1;
        }
        .calendar-cell.today {
          background: #f0fdfa;
        }
        .calendar-cell.today .day-number {
          background: #0f766e;
          color: #ffffff;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }
        
        .day-number {
          font-size: 13px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 4px;
        }
        
        .cell-events {
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
          max-height: 80px;
        }
        
        .event-item {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .event-item.approved { background: #dcfce7; color: #166534; border-left: 3px solid #16a34a; }
        .event-item.pending { background: #fef3c7; color: #92400e; border-left: 3px solid #d97706; }
        .event-item.holiday { background: #ccfbf1; color: #115e59; border-left: 3px solid #0f766e; }
        .event-item.week-off { background: #f1f5f9; color: #64748b; border-left: 3px solid #cbd5e1; }
        .event-title {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        ` }} />
    </div>
  );
}
