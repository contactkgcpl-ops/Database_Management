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
