from datetime import date
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from app.models import HourlyReport, User, HourlyReportCall
from app.schemas import HourlyReportCreate, HourlyReportUpdate

def get_reports(db: Session, user_id: int, work_date: date | None = None) -> list[HourlyReport]:
    query = db.query(HourlyReport).options(joinedload(HourlyReport.calls)).filter(HourlyReport.user_id == user_id)
    if work_date:
        query = query.filter(HourlyReport.work_date == work_date)
    return query.order_by(HourlyReport.start_time).all()

def get_all_reports(db: Session, work_date: date | None = None, user_id: int | None = None) -> list[HourlyReport]:
    query = db.query(HourlyReport).options(joinedload(HourlyReport.calls))
    if work_date:
        query = query.filter(HourlyReport.work_date == work_date)
    if user_id:
        query = query.filter(HourlyReport.user_id == user_id)
    return query.order_by(HourlyReport.work_date.desc(), HourlyReport.start_time).all()

def create_report(db: Session, user: User, report_in: HourlyReportCreate) -> HourlyReport:
    work_type = report_in.work_type if report_in.work_type else "General"
    calls_list = report_in.calls if report_in.calls is not None else []
    
    if work_type in ["Calling", "Marketing", "Purchase"]:
        if work_type in ["Calling", "Marketing"] and not calls_list:
            raise HTTPException(status_code=400, detail="Calling/Marketing tasks require at least 1 call log.")
        if len(calls_list) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 calls can be logged in a single hour slot.")
        for call in calls_list:
            if not call.contact_number.strip():
                raise HTTPException(status_code=400, detail="Contact number is required for all logged calls.")
            if not call.contact_person.strip():
                raise HTTPException(status_code=400, detail="Contact person is required for all logged calls.")
            if not call.contact_for.strip():
                raise HTTPException(status_code=400, detail="Contact purpose is required for all logged calls.")
        desc = report_in.description.strip() if report_in.description else ""
        if not desc:
            if work_type in ["Calling", "Marketing"]:
                desc = f"Calling Activity: Logged {len(calls_list)} calls."
            elif work_type == "Purchase" and calls_list:
                desc = f"Purchase Activity: Logged {len(calls_list)} calls."
            else:
                raise HTTPException(status_code=400, detail="Work description is required.")
    else:
        if not report_in.description.strip():
            raise HTTPException(status_code=400, detail="Work description is required.")
        desc = report_in.description
        calls_list = []

    report = HourlyReport(
        user_id=user.id,
        work_date=report_in.work_date,
        start_time=report_in.start_time,
        end_time=report_in.end_time,
        description=desc,
        status=report_in.status,
        work_type=work_type
    )
    db.add(report)
    db.commit() # Commit to generate report.id
    
    for c in calls_list:
        db_call = HourlyReportCall(
            report_id=report.id,
            contact_number=c.contact_number,
            contact_person=c.contact_person,
            contact_for=c.contact_for
        )
        db.add(db_call)
    
    db.commit()
    db.refresh(report)
    return report

def update_report(db: Session, report: HourlyReport, report_in: HourlyReportUpdate) -> HourlyReport:
    work_type = report_in.work_type if report_in.work_type is not None else report.work_type
    
    if report_in.calls is not None:
        calls_list = report_in.calls
    else:
        if work_type not in ["Calling", "Marketing", "Purchase"]:
            calls_list = []
        else:
            calls_list = report.calls

    if work_type in ["Calling", "Marketing", "Purchase"]:
        if work_type in ["Calling", "Marketing"] and not calls_list:
            raise HTTPException(status_code=400, detail="Calling/Marketing tasks require at least 1 call log.")
        if len(calls_list) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 calls can be logged in a single hour slot.")
        for call in calls_list:
            if not call.contact_number.strip():
                raise HTTPException(status_code=400, detail="Contact number is required for all logged calls.")
            if not call.contact_person.strip():
                raise HTTPException(status_code=400, detail="Contact person is required for all logged calls.")
            if not call.contact_for.strip():
                raise HTTPException(status_code=400, detail="Contact purpose is required for all logged calls.")
        
        if report_in.description is not None:
            desc = report_in.description.strip()
            if not desc:
                if work_type in ["Calling", "Marketing"]:
                    desc = f"Calling Activity: Logged {len(calls_list)} calls."
                elif work_type == "Purchase" and calls_list:
                    desc = f"Purchase Activity: Logged {len(calls_list)} calls."
                else:
                    raise HTTPException(status_code=400, detail="Work description is required.")
        else:
            if not report.description.strip() or report.description.startswith("Calling Activity:") or report.description.startswith("Purchase Activity:"):
                if work_type in ["Calling", "Marketing"]:
                    desc = f"Calling Activity: Logged {len(calls_list)} calls."
                elif work_type == "Purchase" and calls_list:
                    desc = f"Purchase Activity: Logged {len(calls_list)} calls."
                else:
                    desc = report.description
            else:
                desc = report.description
    else:
        if report_in.description is not None:
            desc = report_in.description.strip()
            if not desc:
                raise HTTPException(status_code=400, detail="Work description is required.")
        else:
            desc = report.description
            if not desc.strip():
                raise HTTPException(status_code=400, detail="Work description is required.")
        calls_list = []

    if report_in.start_time is not None:
        report.start_time = report_in.start_time
    if report_in.end_time is not None:
        report.end_time = report_in.end_time
    report.description = desc
    if report_in.status is not None:
        report.status = report_in.status
    report.work_type = work_type

    db.query(HourlyReportCall).filter(HourlyReportCall.report_id == report.id).delete()
    for c in calls_list:
        db_call = HourlyReportCall(
            report_id=report.id,
            contact_number=c.contact_number,
            contact_person=c.contact_person,
            contact_for=c.contact_for
        )
        db.add(db_call)
        
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
