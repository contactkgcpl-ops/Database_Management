from pydantic import BaseModel
from datetime import date, datetime
from typing import List, Optional

class StrictReportingConfigOut(BaseModel):
    id: int
    plan_submission_limit_minutes: int
    report_interval_minutes: int
    alert_interval_1_minutes: int
    alert_interval_2_minutes: int
    alert_interval_3_minutes: int
    logout_report_cutoff_time: str
    cc_emails_json: Optional[str] = None

    class Config:
        from_attributes = True

class StrictReportingConfigUpdate(BaseModel):
    plan_submission_limit_minutes: Optional[int] = None
    report_interval_minutes: Optional[int] = None
    alert_interval_1_minutes: Optional[int] = None
    alert_interval_2_minutes: Optional[int] = None
    alert_interval_3_minutes: Optional[int] = None
    logout_report_cutoff_time: Optional[str] = None
    cc_emails_json: Optional[str] = None

class DailyWorkPlanCreate(BaseModel):
    work_title: str
    description: str
    count: Optional[int] = None
    eta_time: str

class DailyWorkPlanOut(BaseModel):
    id: int
    user_id: int
    work_date: date
    work_title: str
    description: str
    count: Optional[int] = None
    eta_time: str
    status: str
    ongoing_remark: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DailyWorkPlanTaskStatus(BaseModel):
    id: int
    status: str  # done, pending, ongoing
    ongoing_remark: Optional[str] = None

class LogoutReportSubmit(BaseModel):
    tasks: List[DailyWorkPlanTaskStatus]

class WorkProgressReportCreate(BaseModel):
    daily_work_plan_id: Optional[int] = None
    custom_task_title: Optional[str] = None
    progress_description: str
    next_task: str

class WorkProgressReportOut(BaseModel):
    id: int
    user_id: int
    work_date: date
    reported_at: datetime
    due_at: Optional[datetime] = None
    late_minutes: int = 0
    reminders_sent: int = 0
    daily_work_plan_id: Optional[int] = None
    custom_task_title: Optional[str] = None
    progress_description: str
    next_task: str

    class Config:
        from_attributes = True

class ReportingStatusCheckOut(BaseModel):
    restrict_reporting: bool
    plan_submitted: bool
    minutes_since_login: int
    minutes_since_last_report: int
    config: StrictReportingConfigOut
    is_on_break: bool
    alert_level: int  # 0: none, 1: alert 1, 2: alert 2, 3: alert 3 (email alert)

class WorkProgressReportDetailOut(WorkProgressReportOut):
    user_name: str
    user_email: str
    task_title: Optional[str] = None
