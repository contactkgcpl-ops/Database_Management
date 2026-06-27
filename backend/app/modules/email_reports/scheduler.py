from datetime import date, datetime
import json
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import EmailReportConfig, EmailReportLog
from app.modules.email_reports.services import get_report_data
from app.modules.email_reports.generators import generate_excel_report
from app.modules.email_reports.mailer import send_outlook_email

logger = logging.getLogger("email_reports_scheduler")
logger.setLevel(logging.INFO)

scheduler = BackgroundScheduler()

def send_daily_report_task():
    logger.info("Executing scheduled daily email report task...")
    db = SessionLocal()
    try:
        config = db.query(EmailReportConfig).first()
        if not config or not config.is_active:
            logger.info("No active report configuration found. Skipping.")
            return
            
        to_emails = json.loads(config.to_emails or "[]")
        if not to_emails:
            logger.info("No recipient emails configured. Skipping.")
            return
            
        today = date.today()
        logger.info(f"Generating daily activity report for date: {today}")
        data = get_report_data(db, today)
        excel_bytes = generate_excel_report(data, today)
        
        send_outlook_email(
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_pass=config.smtp_password,
            to_emails=to_emails,
            excel_bytes=excel_bytes,
            target_date=today
        )
        
        report_log = EmailReportLog(
            report_date=today,
            sent_at=datetime.utcnow(),
            status="success",
            recipients_count=len(to_emails),
            recipients=", ".join(to_emails)
        )
        db.add(report_log)
        db.commit()
        logger.info("Daily email report sent and logged successfully.")
        
    except Exception as e:
        logger.error(f"Failed to send scheduled daily report: {str(e)}")
        try:
            today = date.today()
            report_log = EmailReportLog(
                report_date=today,
                sent_at=datetime.utcnow(),
                status="failed",
                error_message=str(e),
                recipients_count=0,
                recipients=", ".join(to_emails) if 'to_emails' in locals() else None
            )
            db.add(report_log)
            db.commit()
        except Exception as log_ex:
            logger.error(f"Could not write failure log: {str(log_ex)}")
    finally:
        db.close()

def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler Background Scheduler started.")
        
        db = SessionLocal()
        try:
            reschedule_report_job(db)
        finally:
            db.close()

def reschedule_report_job(db: Session):
    config = db.query(EmailReportConfig).first()
    if not config:
        config = EmailReportConfig(
            smtp_host="smtp.office365.com",
            smtp_port=587,
            smtp_user="",
            smtp_password="",
            to_emails="[]",
            schedule_time="20:00",
            is_active=False
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        
    try:
        scheduler.remove_job("daily_email_report")
        logger.info("Removed existing scheduled job.")
    except Exception:
        pass
        
    if config.is_active:
        try:
            time_parts = config.schedule_time.split(":")
            hour = int(time_parts[0])
            minute = int(time_parts[1])
        except Exception:
            logger.error(f"Invalid schedule time format: {config.schedule_time}. Defaulting to 20:00.")
            hour, minute = 20, 0
            
        trigger = CronTrigger(hour=hour, minute=minute)
        scheduler.add_job(
            send_daily_report_task,
            trigger=trigger,
            id="daily_email_report",
            replace_existing=True
        )
        logger.info(f"Scheduled new daily report job to run at {hour:02d}:{minute:02d} local time.")
    else:
        logger.info("Scheduled job not added because email report config is inactive.")
