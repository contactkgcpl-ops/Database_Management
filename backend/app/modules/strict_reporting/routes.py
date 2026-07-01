from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.db import get_db
from app.models import User
from app.deps import current_user, require_permission
from app.modules.strict_reporting import schemas, services

router = APIRouter(prefix="/strict-reporting", tags=["Strict Reporting"])

@router.get("/config", response_model=schemas.StrictReportingConfigOut)
def get_config_endpoint(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("reports.config"))
):
    return services.get_or_create_config(db)

@router.put("/config", response_model=schemas.StrictReportingConfigOut)
def update_config_endpoint(
    payload: schemas.StrictReportingConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("reports.config"))
):
    return services.update_config(db, payload)

@router.get("/status", response_model=schemas.ReportingStatusCheckOut)
def get_status_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    return services.get_reporting_status(db, user)

@router.post("/plan", response_model=List[schemas.DailyWorkPlanOut])
def submit_plan_endpoint(
    payload: List[schemas.DailyWorkPlanCreate],
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    if user.restrict_reporting:
        raise HTTPException(status_code=400, detail="Reporting is restricted for this user.")
    return services.submit_plan(db, user, payload)

@router.get("/plan/today", response_model=List[schemas.DailyWorkPlanOut])
def get_today_plan_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    return services.get_today_plan(db, user)

@router.get("/plan/previous-unfinished", response_model=List[schemas.DailyWorkPlanOut])
def get_previous_unfinished_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    return services.get_previous_unfinished_tasks(db, user)

@router.post("/report", response_model=schemas.WorkProgressReportOut)
def submit_report_endpoint(
    payload: schemas.WorkProgressReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    if user.restrict_reporting:
        raise HTTPException(status_code=400, detail="Reporting is restricted for this user.")
    return services.submit_progress_report(db, user, payload)

@router.post("/logout-report")
def submit_logout_report_endpoint(
    payload: schemas.LogoutReportSubmit,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    services.submit_logout_report(db, user, payload)
    return {"status": "success"}

@router.post("/trigger-alert-email")
def trigger_alert_email_endpoint(
    alert_type: str = Query(..., pattern="^(plan|report|logout)$"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    success = services.trigger_alert_email(db, user, alert_type)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send warning email alert.")
    return {"status": "success"}

@router.get("/reports", response_model=List[schemas.WorkProgressReportDetailOut])
def get_all_reports_endpoint(
    target_date: str = Query(None, alias="date"),
    user_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view"))
):
    from app.models import WorkProgressReport, User
    from datetime import datetime
    
    query = db.query(WorkProgressReport).join(User, WorkProgressReport.user_id == User.id)
    
    if target_date:
        try:
            parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()
            query = query.filter(WorkProgressReport.work_date == parsed_date)
        except ValueError:
            pass
            
    if user_id:
        query = query.filter(WorkProgressReport.user_id == user_id)
        
    reports = query.order_by(User.name.asc(), WorkProgressReport.reported_at.asc()).all()
    
    results = []
    for r in reports:
        task_title = r.custom_task_title or (r.daily_work_plan.work_title if r.daily_work_plan else "—")
        results.append(schemas.WorkProgressReportDetailOut(
            id=r.id,
            user_id=r.user_id,
            user_name=r.user.name,
            user_email=r.user.email,
            work_date=r.work_date,
            reported_at=r.reported_at,
            due_at=r.due_at,
            late_minutes=r.late_minutes,
            reminders_sent=r.reminders_sent,
            daily_work_plan_id=r.daily_work_plan_id,
            custom_task_title=r.custom_task_title,
            task_title=task_title,
            progress_description=r.progress_description,
            next_task=r.next_task
        ))
    return results
