from datetime import date, datetime
import json
import logging
import threading
import time
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import EmailReportConfig, EmailReportLog
from app.modules.email_reports.services import get_report_data
from app.modules.email_reports.generators import generate_excel_report
from app.modules.email_reports.mailer import send_outlook_email

logger = logging.getLogger("email_reports_scheduler")
logger.setLevel(logging.INFO)

class DailyReportScheduler:
    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()
        self.running = False
        
        self.config_hour = 20
        self.config_minute = 0
        self.is_active = False
        self._last_run_date = None

    def start(self):
        if not self.running:
            self.running = True
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._loop, name="DailyReportSchedulerThread", daemon=True)
            self._thread.start()
            logger.info("Custom background scheduler started.")

    def stop(self):
        self._stop_event.set()
        self.running = False

    def update_config(self, hour: int, minute: int, is_active: bool):
        self.config_hour = hour
        self.config_minute = minute
        self.is_active = is_active
        logger.info(f"Scheduler configuration updated: run at {hour:02d}:{minute:02d}, active={is_active}")

    def _loop(self):
        while not self._stop_event.is_set():
            try:
                now = datetime.now()
                if self.is_active:
                    if now.hour == self.config_hour and now.minute == self.config_minute:
                        today_date = date.today()
                        if self._last_run_date != today_date:
                            self._last_run_date = today_date
                            logger.info("Time matches and task has not run today yet. Executing task...")
                            threading.Thread(target=send_daily_report_task, daemon=True).start()
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
            time.sleep(10)

scheduler = DailyReportScheduler()

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
        # Check if already sent today
        already_sent = db.query(EmailReportLog).filter(
            EmailReportLog.report_date == today,
            EmailReportLog.status == "success"
        ).first()
        if already_sent:
            logger.info(f"Daily report already sent successfully for {today}. Skipping.")
            return

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
    scheduler.start()
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
        
    if config.is_active:
        try:
            time_parts = config.schedule_time.split(":")
            hour = int(time_parts[0])
            minute = int(time_parts[1])
        except Exception:
            logger.error(f"Invalid schedule time format: {config.schedule_time}. Defaulting to 20:00.")
            hour, minute = 20, 0
            
        scheduler.update_config(hour, minute, True)
    else:
        scheduler.update_config(20, 0, False)
