from datetime import date, datetime
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from io import BytesIO

from app.db import get_db
from app.models import User, EmailReportLog
from app.schemas import EmailReportConfigOut, EmailReportConfigUpdate, EmailReportLogOut
from app.deps import current_user, require_permission
from app.modules.email_reports.services import get_report_data
from app.modules.email_reports.generators import generate_excel_report
from app.modules.email_reports.mailer import send_outlook_email
from app.modules.email_reports.scheduler import reschedule_report_job

router = APIRouter(prefix="/reports", tags=["Email Reports"])

@router.get("/download")
def download_report(
    target_date: str = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view"))
):
    try:
        if target_date:
            rep_date = date.fromisoformat(target_date)
        else:
            rep_date = date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        
    data = get_report_data(db, rep_date)
    excel_bytes = generate_excel_report(data, rep_date)
    
    filename = f"Daily_Activity_Report_{rep_date.strftime('%Y-%m-%d')}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/send-now")
def send_report_now(
    target_date: str = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.config"))
):
    try:
        if target_date:
            rep_date = date.fromisoformat(target_date)
        else:
            rep_date = date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        
    config = db.query(EmailReportConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Email report settings not configured.")
        
    to_emails = json.loads(config.to_emails or "[]")
    if not to_emails:
        raise HTTPException(status_code=400, detail="No recipient emails configured in settings.")
        
    try:
        data = get_report_data(db, rep_date)
        excel_bytes = generate_excel_report(data, rep_date)
        
        send_outlook_email(
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_pass=config.smtp_password,
            to_emails=to_emails,
            excel_bytes=excel_bytes,
            target_date=rep_date
        )
        
        # Log success
        report_log = EmailReportLog(
            report_date=rep_date,
            sent_at=datetime.utcnow(),
            status="success",
            recipients_count=len(to_emails),
            recipients=", ".join(to_emails)
        )
        db.add(report_log)
        db.commit()
        
        return {"status": "success", "message": f"Report for {rep_date} sent to {len(to_emails)} recipients."}
    except Exception as e:
        report_log = EmailReportLog(
            report_date=rep_date,
            sent_at=datetime.utcnow(),
            status="failed",
            error_message=str(e),
            recipients_count=0,
            recipients=", ".join(to_emails) if 'to_emails' in locals() else None
        )
        db.add(report_log)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

from app.core.settings import get_system_setting, set_system_setting

@router.get("/config", response_model=EmailReportConfigOut)
def get_report_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view"))
):
    smtp_host = get_system_setting(db, "email_smtp", "smtp_host", "smtp.office365.com")
    smtp_port_str = get_system_setting(db, "email_smtp", "smtp_port", "587")
    smtp_user = get_system_setting(db, "email_smtp", "smtp_user", "")
    smtp_password = get_system_setting(db, "email_smtp", "smtp_password", "")
    to_emails_str = get_system_setting(db, "email_smtp", "to_emails", "[]")
    schedule_time = get_system_setting(db, "email_smtp", "schedule_time", "20:00")
    is_active_str = get_system_setting(db, "email_smtp", "is_active", "false")
    
    try:
        smtp_port = int(smtp_port_str)
    except Exception:
        smtp_port = 587
        
    try:
        emails = json.loads(to_emails_str)
    except Exception:
        emails = []
        
    is_active = (is_active_str.lower() == "true")
        
    return EmailReportConfigOut(
        id=1,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        to_emails=emails,
        schedule_time=schedule_time,
        is_active=is_active,
        has_password=bool(smtp_password),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

@router.put("/config", response_model=EmailReportConfigOut)
def update_report_config(
    payload: EmailReportConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.config"))
):
    if payload.smtp_host is not None:
        set_system_setting(db, "email_smtp", "smtp_host", payload.smtp_host)
    if payload.smtp_port is not None:
        set_system_setting(db, "email_smtp", "smtp_port", str(payload.smtp_port))
    if payload.smtp_user is not None:
        set_system_setting(db, "email_smtp", "smtp_user", payload.smtp_user)
    if payload.smtp_password is not None and payload.smtp_password.strip() != "":
        set_system_setting(db, "email_smtp", "smtp_password", payload.smtp_password)
    if payload.to_emails is not None:
        set_system_setting(db, "email_smtp", "to_emails", json.dumps(payload.to_emails))
    if payload.schedule_time is not None:
        set_system_setting(db, "email_smtp", "schedule_time", payload.schedule_time)
    if payload.is_active is not None:
        set_system_setting(db, "email_smtp", "is_active", "true" if payload.is_active else "false")
        
    reschedule_report_job(db)
    
    # Reload values
    smtp_host = get_system_setting(db, "email_smtp", "smtp_host", "smtp.office365.com")
    smtp_port_str = get_system_setting(db, "email_smtp", "smtp_port", "587")
    smtp_user = get_system_setting(db, "email_smtp", "smtp_user", "")
    smtp_password = get_system_setting(db, "email_smtp", "smtp_password", "")
    to_emails_str = get_system_setting(db, "email_smtp", "to_emails", "[]")
    schedule_time = get_system_setting(db, "email_smtp", "schedule_time", "20:00")
    is_active_str = get_system_setting(db, "email_smtp", "is_active", "false")
    
    try:
        smtp_port = int(smtp_port_str)
    except Exception:
        smtp_port = 587
        
    try:
        emails = json.loads(to_emails_str)
    except Exception:
        emails = []
        
    is_active = (is_active_str.lower() == "true")
        
    return EmailReportConfigOut(
        id=1,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        to_emails=emails,
        schedule_time=schedule_time,
        is_active=is_active,
        has_password=bool(smtp_password),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

@router.get("/logs", response_model=list[EmailReportLogOut])
def get_report_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view"))
):
    logs = db.query(EmailReportLog).order_by(EmailReportLog.sent_at.desc()).limit(50).all()
    return logs
