import json
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import (
    User,
    UserTimeLog,
    UserBreakLog,
    StrictReportingConfig,
    DailyWorkPlan,
    WorkProgressReport,
    EmailReportConfig
)
from app.modules.strict_reporting.schemas import (
    StrictReportingConfigUpdate,
    DailyWorkPlanCreate,
    WorkProgressReportCreate,
    LogoutReportSubmit
)

def get_or_create_config(db: Session) -> StrictReportingConfig:
    config = db.query(StrictReportingConfig).first()
    if not config:
        config = StrictReportingConfig(
            plan_submission_limit_minutes=15,
            report_interval_minutes=30,
            alert_interval_1_minutes=5,
            alert_interval_2_minutes=10,
            alert_interval_3_minutes=15,
            logout_report_cutoff_time="19:00",
            cc_emails_json="{}"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

def update_config(db: Session, payload: StrictReportingConfigUpdate) -> StrictReportingConfig:
    config = get_or_create_config(db)
    if payload.plan_submission_limit_minutes is not None:
        config.plan_submission_limit_minutes = payload.plan_submission_limit_minutes
    if payload.report_interval_minutes is not None:
        config.report_interval_minutes = payload.report_interval_minutes
    if payload.alert_interval_1_minutes is not None:
        config.alert_interval_1_minutes = payload.alert_interval_1_minutes
    if payload.alert_interval_2_minutes is not None:
        config.alert_interval_2_minutes = payload.alert_interval_2_minutes
    if payload.alert_interval_3_minutes is not None:
        config.alert_interval_3_minutes = payload.alert_interval_3_minutes
    if payload.logout_report_cutoff_time is not None:
        config.logout_report_cutoff_time = payload.logout_report_cutoff_time
    if payload.cc_emails_json is not None:
        config.cc_emails_json = payload.cc_emails_json
    db.commit()
    db.refresh(config)
    return config

def get_break_seconds_since(db: Session, time_log_id: int, start_time: datetime) -> float:
    breaks = db.query(UserBreakLog).filter(UserBreakLog.time_log_id == time_log_id).all()
    break_sec = 0.0
    now_time = datetime.utcnow()
    for b in breaks:
        b_end = b.break_end or now_time
        b_start = b.break_start
        if b_end <= start_time:
            continue
        overlap_start = max(b_start, start_time)
        overlap_end = b_end
        if overlap_end > overlap_start:
            break_sec += (overlap_end - overlap_start).total_seconds()
    return break_sec

def get_reporting_status(db: Session, user: User) -> dict:
    config = get_or_create_config(db)
    today = date.today()
    
    # Default values if not logged in or restricted
    res = {
        "restrict_reporting": bool(user.restrict_reporting),
        "plan_submitted": False,
        "minutes_since_login": 0,
        "minutes_since_last_report": 0,
        "config": config,
        "is_on_break": False,
        "alert_level": 0
    }
    
    if user.restrict_reporting:
        return res

    # Retrieve daily time log
    time_log = db.query(UserTimeLog).filter(
        UserTimeLog.user_id == user.id,
        UserTimeLog.work_date == today
    ).first()
    
    if not time_log:
        return res

    res["is_on_break"] = (time_log.status == "break")
    
    now_time = datetime.utcnow()
    
    # 1. Calculate active seconds since login (excluding breaks)
    active_break_sec = 0.0
    if time_log.status == "break":
        active_break = db.query(UserBreakLog).filter(
            UserBreakLog.time_log_id == time_log.id,
            UserBreakLog.break_end == None
        ).first()
        if active_break:
            active_break_sec = (now_time - active_break.break_start).total_seconds()

    total_break_sec = time_log.total_break_seconds + active_break_sec
    elapsed_total_sec = (now_time - time_log.login_at).total_seconds()
    active_work_sec = max(0.0, elapsed_total_sec - total_break_sec)
    
    minutes_since_login = int(active_work_sec // 60)
    res["minutes_since_login"] = minutes_since_login

    # 2. Check if daily plan has been submitted
    plan_tasks = db.query(DailyWorkPlan).filter(
        DailyWorkPlan.user_id == user.id,
        DailyWorkPlan.work_date == today
    ).all()
    plan_submitted = len(plan_tasks) > 0
    res["plan_submitted"] = plan_submitted

    # 3. Calculate active seconds since last progress report
    if plan_submitted:
        last_report = db.query(WorkProgressReport).filter(
            WorkProgressReport.user_id == user.id,
            WorkProgressReport.work_date == today
        ).order_by(WorkProgressReport.reported_at.desc()).first()
        
        if last_report:
            start_time = last_report.reported_at
            breaks_since = get_break_seconds_since(db, time_log.id, start_time)
            elapsed_since_report = (now_time - start_time).total_seconds()
            active_since_report = max(0.0, elapsed_since_report - breaks_since)
            minutes_since_last_report = int(active_since_report // 60)
        else:
            # If no report submitted yet, elapsed time is since login
            minutes_since_last_report = minutes_since_login
            
        res["minutes_since_last_report"] = minutes_since_last_report

    # 4. Calculate Alert Levels
    # Plan Alert Levels
    if not plan_submitted:
        limit = config.plan_submission_limit_minutes
        if minutes_since_login < limit:
            res["alert_level"] = 0
        elif minutes_since_login < limit + config.alert_interval_1_minutes:
            res["alert_level"] = 1
        elif minutes_since_login < limit + config.alert_interval_2_minutes:
            res["alert_level"] = 2
        else:
            res["alert_level"] = 3
    else:
        # Report Alert Levels
        limit = config.report_interval_minutes
        minutes_overdue = minutes_since_last_report - limit
        if minutes_overdue <= 0:
            res["alert_level"] = 0
        elif minutes_overdue < config.alert_interval_1_minutes:
            res["alert_level"] = 1
        elif minutes_overdue < config.alert_interval_2_minutes:
            res["alert_level"] = 2
        else:
            res["alert_level"] = 3

    return res

def submit_plan(db: Session, user: User, tasks: list[DailyWorkPlanCreate]) -> list[DailyWorkPlan]:
    today = date.today()
    # Delete existing plan tasks for today before inserting to avoid duplicates
    db.query(DailyWorkPlan).filter(
        DailyWorkPlan.user_id == user.id,
        DailyWorkPlan.work_date == today
    ).delete()
    
    created_plans = []
    for task in tasks:
        plan = DailyWorkPlan(
            user_id=user.id,
            work_date=today,
            work_title=task.work_title,
            description=task.description,
            count=task.count,
            eta_time=task.eta_time,
            status="planned"
        )
        db.add(plan)
        created_plans.append(plan)
    db.commit()
    for plan in created_plans:
        db.refresh(plan)
    return created_plans

def get_today_plan(db: Session, user: User) -> list[DailyWorkPlan]:
    today = date.today()
    return db.query(DailyWorkPlan).filter(
        DailyWorkPlan.user_id == user.id,
        DailyWorkPlan.work_date == today
    ).all()

def get_previous_unfinished_tasks(db: Session, user: User) -> list[DailyWorkPlan]:
    # Find the user's last working date before today
    last_log = db.query(UserTimeLog).filter(
        UserTimeLog.user_id == user.id,
        UserTimeLog.work_date < date.today()
    ).order_by(UserTimeLog.work_date.desc()).first()

    if not last_log:
        return []

    # Get unfinished tasks (pending, ongoing) from that last working date
    return db.query(DailyWorkPlan).filter(
        DailyWorkPlan.user_id == user.id,
        DailyWorkPlan.work_date == last_log.work_date,
        DailyWorkPlan.status.in_(["pending", "ongoing"])
    ).all()

def submit_progress_report(db: Session, user: User, payload: WorkProgressReportCreate) -> WorkProgressReport:
    today = date.today()
    report = WorkProgressReport(
        user_id=user.id,
        work_date=today,
        reported_at=datetime.utcnow(),
        daily_work_plan_id=payload.daily_work_plan_id,
        custom_task_title=payload.custom_task_title,
        progress_description=payload.progress_description,
        next_task=payload.next_task
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

def submit_logout_report(db: Session, user: User, payload: LogoutReportSubmit) -> bool:
    for task_status in payload.tasks:
        task = db.query(DailyWorkPlan).filter(
            DailyWorkPlan.id == task_status.id,
            DailyWorkPlan.user_id == user.id
        ).first()
        if task:
            task.status = task_status.status
            if task_status.status == "ongoing":
                task.ongoing_remark = task_status.ongoing_remark
    db.commit()
    return True

def send_custom_email(db: Session, to_emails: list[str], cc_emails: list[str], subject: str, html_body: str):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    config = db.query(EmailReportConfig).first()
    if not config or not config.smtp_user or not config.smtp_password:
        print("SMTP credentials are not configured in EmailReportConfig.")
        return

    msg = MIMEMultipart()
    msg['From'] = config.smtp_user
    msg['To'] = ", ".join(to_emails)
    if cc_emails:
        msg['Cc'] = ", ".join(cc_emails)
    msg['Subject'] = subject
    msg.attach(MIMEText(html_body, 'html'))

    all_recipients = to_emails + (cc_emails or [])

    server = smtplib.SMTP(config.smtp_host, config.smtp_port)
    server.starttls()
    server.login(config.smtp_user, config.smtp_password)
    server.sendmail(config.smtp_user, all_recipients, msg.as_string())
    server.quit()
    print(f"SMTP Alert Sent to {to_emails} CC {cc_emails}")

def trigger_alert_email(db: Session, user: User, alert_type: str) -> bool:
    config = get_or_create_config(db)
    
    # 1. Determine recipients
    to_email = user.crm_notification_email or user.email
    if not to_email:
        return False
        
    cc_list = []
    # 2. Get CCs from configuration JSON
    if config.cc_emails_json:
        try:
            cc_config = json.loads(config.cc_emails_json)
            # Fetch user-specific list or default
            cc_list = cc_config.get(str(user.id)) or cc_config.get("default") or []
        except Exception:
            cc_list = []

    # 3. Add manager to CC if exists
    if user.parent and user.parent.email:
        cc_list.append(user.parent.email)
        
    # Deduplicate CC emails
    cc_list = list(set([email.strip() for email in cc_list if email.strip()]))

    # 4. Craft email contents
    if alert_type == "plan":
        subject = f"CRITICAL: Daily Work Plan Pending - {user.name}"
        body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #b42318;">Work Plan Pending Notification</h2>
            <p>Dear {user.name},</p>
            <p>Our system has detected that you logged in today but have <strong>not submitted your Daily Work Plan</strong> within the required limit.</p>
            <p style="font-weight: bold; color: #b42318;">Please log in to the CRM and submit your today's plan immediately to avoid further action.</p>
            <br/>
            <p style="font-size: 11px; color: #666;">This is an automated notification from the CRM strict reporting module.</p>
          </body>
        </html>
        """
    elif alert_type == "report":
        subject = f"CRITICAL: 30-Min Progress Report Overdue - {user.name}"
        body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #b42318;">Progress Report Overdue Notification</h2>
            <p>Dear {user.name},</p>
            <p>Our system has detected that your <strong>Work Progress Report is overdue</strong> by more than the allowed warning thresholds.</p>
            <p style="font-weight: bold; color: #b42318;">Please open the CRM and fill in your current task progress report immediately.</p>
            <br/>
            <p style="font-size: 11px; color: #666;">This is an automated notification from the CRM strict reporting module.</p>
          </body>
        </html>
        """
    elif alert_type == "logout":
        subject = f"CRITICAL: End-of-Day Logout Report Pending - {user.name}"
        body = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #b42318;">Logout Completion Report Pending</h2>
            <p>Dear {user.name},</p>
            <p>You have logged out or the work hours completed, but you have <strong>not submitted the task finalization report</strong> (End-of-Day status of each planned task).</p>
            <p style="font-weight: bold; color: #b42318;">Please log back in and finalize your task statuses (Done, Pending, or Ongoing) immediately.</p>
            <br/>
            <p style="font-size: 11px; color: #666;">This is an automated notification from the CRM strict reporting module.</p>
          </body>
        </html>
        """
    else:
        return False

    try:
        send_custom_email(db, [to_email], cc_list, subject, body)
        return True
    except Exception as e:
        print(f"Error sending warning email: {e}")
        return False
