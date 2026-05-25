from datetime import date
from sqlalchemy.orm import Session
from app.models import HourlyReport, User
from app.schemas import HourlyReportCreate, HourlyReportUpdate

def get_reports(db: Session, user_id: int, work_date: date | None = None) -> list[HourlyReport]:
    query = db.query(HourlyReport).filter(HourlyReport.user_id == user_id)
    if work_date:
        query = query.filter(HourlyReport.work_date == work_date)
    return query.order_by(HourlyReport.start_time).all()

def get_all_reports(db: Session, work_date: date | None = None, user_id: int | None = None) -> list[HourlyReport]:
    query = db.query(HourlyReport)
    if work_date:
        query = query.filter(HourlyReport.work_date == work_date)
    if user_id:
        query = query.filter(HourlyReport.user_id == user_id)
    return query.order_by(HourlyReport.work_date.desc(), HourlyReport.start_time).all()

def create_report(db: Session, user: User, report_in: HourlyReportCreate) -> HourlyReport:
    report = HourlyReport(
        user_id=user.id,
        work_date=report_in.work_date,
        start_time=report_in.start_time,
        end_time=report_in.end_time,
        description=report_in.description,
        status=report_in.status
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

def update_report(db: Session, report: HourlyReport, report_in: HourlyReportUpdate) -> HourlyReport:
    if report_in.start_time is not None:
        report.start_time = report_in.start_time
    if report_in.end_time is not None:
        report.end_time = report_in.end_time
    if report_in.description is not None:
        report.description = report_in.description
    if report_in.status is not None:
        report.status = report_in.status
    
    db.commit()
    db.refresh(report)
    return report

def delete_report(db: Session, report: HourlyReport):
    db.delete(report)
    db.commit()

def submit_reports_for_date(db: Session, user_id: int, work_date: date):
    reports = db.query(HourlyReport).filter(
        HourlyReport.user_id == user_id,
        HourlyReport.work_date == work_date,
        HourlyReport.status.in_(["Draft", "Saved"])
    ).all()
    
    for report in reports:
        report.status = "Submitted"
        
    db.commit()
    return len(reports)
