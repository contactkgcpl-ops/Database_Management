from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User, HourlyReport
from app.deps import current_user, require_permission
from app.schemas import HourlyReportCreate, HourlyReportUpdate, HourlyReportOut
from . import services

router = APIRouter(prefix="/reporting", tags=["Reporting"])

@router.get("/all", response_model=list[HourlyReportOut])
def get_all_reports(
    work_date: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    # Require time.manage permission for Team Reports
    _: User = Depends(require_permission("time.manage"))
):
    return services.get_all_reports(db, work_date, user_id)

@router.get("", response_model=list[HourlyReportOut])
def get_reports(
    work_date: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    # Allow admins to view other users' reports
    target_user_id = current_user.id
    if user_id and user_id != current_user.id:
        target_user_id = user_id
        
    return services.get_reports(db, target_user_id, work_date)

@router.post("", response_model=HourlyReportOut)
def create_report(
    report_in: HourlyReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    return services.create_report(db, current_user, report_in)

@router.put("/{report_id}", response_model=HourlyReportOut)
def update_report(
    report_id: int,
    report_in: HourlyReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    report = db.query(HourlyReport).filter(HourlyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.id:
        # Check permissions if editing someone else's report
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return services.update_report(db, report, report_in)

@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    report = db.query(HourlyReport).filter(HourlyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    services.delete_report(db, report)
    return {"status": "ok"}

@router.post("/submit")
def submit_reports(
    work_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    count = services.submit_reports_for_date(db, current_user.id, work_date)
    return {"status": "ok", "submitted": count}

@router.get("/check-pending")
def check_pending_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user)
):
    # Check if there are any drafts for today
    today = date.today()
    drafts = db.query(HourlyReport).filter(
        HourlyReport.user_id == current_user.id,
        HourlyReport.work_date == today,
        HourlyReport.status == "Draft"
    ).count()
    return {"has_pending": drafts > 0}
