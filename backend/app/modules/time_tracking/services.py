from datetime import date, datetime, timezone, timedelta

from sqlalchemy.orm import Session, joinedload

from app.models import User, UserBreakLog, UserTimeLog, LeaveRequest
from app.schemas import (
    UserBreakLogOut,
    UserTimeLogOut,
    AttendanceReportItem,
    AttendanceSummaryItem,
    AttendanceReportResponse,
)


def today() -> date:
    return datetime.now().date()


def now() -> datetime:
    return datetime.utcnow()


def add_utc_tz(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc)


def active_break(log: UserTimeLog) -> UserBreakLog | None:
    return next((item for item in log.breaks if item.break_end is None), None)


def calculate_break_seconds(log: UserTimeLog, current_time: datetime | None = None) -> int:
    current_time = current_time or now()
    total = 0
    for item in log.breaks:
        end = item.break_end or current_time
        total += max(0, int((end - item.break_start).total_seconds()))
    return total


def calculate_work_seconds(log: UserTimeLog, current_time: datetime | None = None) -> int:
    current_time = current_time or now()
    end = log.logout_at or current_time
    gross = max(0, int((end - log.login_at).total_seconds()))
    return max(0, gross - calculate_break_seconds(log, current_time))


def recalculate_log(log: UserTimeLog, current_time: datetime | None = None) -> None:
    current_time = current_time or now()
    log.total_break_seconds = calculate_break_seconds(log, current_time)
    log.total_work_seconds = calculate_work_seconds(log, current_time)


def get_today_log(db: Session, user: User, create: bool = False) -> UserTimeLog | None:
    work_date = today()
    log = (
        db.query(UserTimeLog)
        .options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
        .filter(UserTimeLog.user_id == user.id, UserTimeLog.work_date == work_date)
        .first()
    )
    if log or not create:
        return log

    log = UserTimeLog(user_id=user.id, work_date=work_date, login_at=now(), status="active")
    db.add(log)
    db.commit()
    db.refresh(log)
    return (
        db.query(UserTimeLog)
        .options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
        .filter(UserTimeLog.id == log.id)
        .first()
    )


def start_day_log(db: Session, user: User) -> UserTimeLog:
    log = get_today_log(db, user, create=True)
    if log.logout_at is not None:
        offline_seconds = max(0, int((now() - log.logout_at).total_seconds()))
        if offline_seconds > 30:
            db.add(UserBreakLog(
                time_log_id=log.id,
                user_id=user.id,
                break_start=log.logout_at,
                break_end=now(),
                break_seconds=offline_seconds
            ))
        log.logout_at = None
        log.status = "active"
    recalculate_log(log)
    db.commit()
    db.refresh(log)
    return log


def close_day_log(db: Session, user: User) -> UserTimeLog:
    log = get_today_log(db, user, create=True)
    current_time = now()
    item = active_break(log)
    if item:
        item.break_end = current_time
        item.break_seconds = max(0, int((item.break_end - item.break_start).total_seconds()))
    log.logout_at = current_time
    log.status = "completed"
    recalculate_log(log, current_time)
    

        
    db.commit()
    db.refresh(log)
    return log


def start_break(db: Session, user: User) -> UserTimeLog:
    log = get_today_log(db, user, create=True)
    if log.logout_at is not None:
        log.logout_at = None
    if not active_break(log):
        db.add(UserBreakLog(time_log_id=log.id, user_id=user.id, break_start=now()))
    log.status = "on_break"
    recalculate_log(log)
    db.commit()
    db.refresh(log)
    return (
        db.query(UserTimeLog)
        .options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
        .filter(UserTimeLog.id == log.id)
        .first()
    )


def end_break(db: Session, user: User) -> UserTimeLog:
    log = get_today_log(db, user, create=True)
    item = active_break(log)
    if item:
        item.break_end = now()
        item.break_seconds = max(0, int((item.break_end - item.break_start).total_seconds()))
    log.status = "active"
    recalculate_log(log)
    db.commit()
    db.refresh(log)
    return (
        db.query(UserTimeLog)
        .options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
        .filter(UserTimeLog.id == log.id)
        .first()
    )


def list_my_logs(db: Session, user: User, start: date | None = None, end: date | None = None) -> list[UserTimeLog]:
    query = (
        db.query(UserTimeLog)
        .options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
        .filter(UserTimeLog.user_id == user.id)
    )
    if start:
        query = query.filter(UserTimeLog.work_date >= start)
    if end:
        query = query.filter(UserTimeLog.work_date <= end)
    return query.order_by(UserTimeLog.work_date.desc(), UserTimeLog.id.desc()).all()


def list_user_logs(
    db: Session,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> list[UserTimeLog]:
    query = db.query(UserTimeLog).options(joinedload(UserTimeLog.breaks), joinedload(UserTimeLog.user))
    if user_id:
        query = query.filter(UserTimeLog.user_id == user_id)
    if start:
        query = query.filter(UserTimeLog.work_date >= start)
    if end:
        query = query.filter(UserTimeLog.work_date <= end)
    return query.order_by(UserTimeLog.work_date.desc(), UserTimeLog.user_id, UserTimeLog.id.desc()).all()


def to_time_log_out(log: UserTimeLog) -> UserTimeLogOut:
    current_time = now()
    active = active_break(log)
    break_seconds = calculate_break_seconds(log, current_time)
    work_seconds = calculate_work_seconds(log, current_time)
    
    breaks = []
    for item in log.breaks:
        out = UserBreakLogOut.model_validate(item)
        out.break_start = add_utc_tz(out.break_start)
        out.break_end = add_utc_tz(out.break_end)
        breaks.append(out)

    return UserTimeLogOut(
        id=log.id,
        user_id=log.user_id,
        user_name=log.user.name if log.user else None,
        work_date=log.work_date.isoformat(),
        login_at=add_utc_tz(log.login_at),
        logout_at=add_utc_tz(log.logout_at),
        total_break_seconds=break_seconds,
        total_work_seconds=work_seconds,
        status=log.status,
        active_break_start=add_utc_tz(active.break_start) if active else None,
        breaks=breaks,
        server_time=add_utc_tz(current_time),
        login_latitude=log.login_latitude,
        login_longitude=log.login_longitude,
        latitude=log.latitude,
        longitude=log.longitude,
        location_timestamp=add_utc_tz(log.location_timestamp),
    )


def get_attendance_report(
    db: Session,
    start_date: date,
    end_date: date,
    user_id: int | None = None,
) -> AttendanceReportResponse:
    # 1. Generate dates list
    delta = end_date - start_date
    dates = [start_date + timedelta(days=i) for i in range(delta.days + 1)]

    # 2. Get active users
    users_query = db.query(User).filter(User.is_active == True)
    if user_id:
        users_query = users_query.filter(User.id == user_id)
    users = users_query.order_by(User.name).all()

    # 3. Fetch Time Logs
    logs_query = db.query(UserTimeLog).filter(
        UserTimeLog.work_date >= start_date,
        UserTimeLog.work_date <= end_date
    )
    if user_id:
        logs_query = logs_query.filter(UserTimeLog.user_id == user_id)
    time_logs = logs_query.all()
    logs_map = {(log.user_id, log.work_date): log for log in time_logs}

    # 4. Fetch Leave Requests
    leaves_query = db.query(LeaveRequest).filter(
        LeaveRequest.status == "Approved",
        LeaveRequest.from_date <= end_date,
        LeaveRequest.to_date >= start_date
    )
    if user_id:
        leaves_query = leaves_query.filter(LeaveRequest.user_id == user_id)
    leave_requests = leaves_query.all()

    leaves_map = {}
    for req in leave_requests:
        leaves_map.setdefault(req.user_id, []).append(req)

    # 5. Process log items
    logs_out = []
    summaries_map = {
        user.id: {
            "user_id": user.id,
            "user_name": user.name,
            "total_days": len(dates),
            "present_days": 0,
            "leave_days": 0,
            "absent_days": 0,
            "sunday_days": 0,
            "total_work_hours": 0.0,
        }
        for user in users
    }

    for user in users:
        user_leaves = leaves_map.get(user.id, [])
        for date_item in dates:
            log = logs_map.get((user.id, date_item))

            # Check leave status
            matching_leave = next(
                (req for req in user_leaves if req.from_date <= date_item <= req.to_date),
                None
            )
            is_on_leave = matching_leave is not None
            leave_status = matching_leave.status if matching_leave else None
            leave_title = matching_leave.title if matching_leave else None

            # Determine status string
            if date_item.weekday() == 6:  # Sunday
                status_str = "Sunday"
            elif log:
                if is_on_leave:
                    status_str = "Leave (Worked)"
                else:
                    status_str = "Present"
            else:
                if is_on_leave:
                    status_str = "Leave"
                else:
                    status_str = "Unavailable"

            # Increment summary stats
            if user.id in summaries_map:
                summary = summaries_map[user.id]
                if status_str in ["Present", "Leave (Worked)"]:
                    summary["present_days"] += 1
                elif status_str == "Leave":
                    summary["leave_days"] += 1
                elif status_str == "Sunday":
                    summary["sunday_days"] += 1
                elif status_str == "Unavailable":
                    summary["absent_days"] += 1

                work_seconds = log.total_work_seconds if log else 0
                summary["total_work_hours"] += work_seconds / 3600.0

            work_seconds = log.total_work_seconds if log else 0
            logs_out.append(
                AttendanceReportItem(
                    user_id=user.id,
                    user_name=user.name,
                    work_date=date_item.isoformat(),
                    login_at=add_utc_tz(log.login_at) if log else None,
                    logout_at=add_utc_tz(log.logout_at) if log else None,
                    total_work_seconds=work_seconds,
                    is_on_leave=is_on_leave,
                    leave_status=leave_status,
                    leave_title=leave_title,
                    status=status_str,
                )
            )

    # 6. Build summary responses
    summary_out = []
    for user in users:
        if user.id in summaries_map:
            s = summaries_map[user.id]
            s["total_work_hours"] = round(s["total_work_hours"], 2)
            if s["present_days"] > 0:
                s["average_work_hours"] = round(s["total_work_hours"] / s["present_days"], 2)
            else:
                s["average_work_hours"] = 0.0
            summary_out.append(AttendanceSummaryItem(**s))

    # Sort logs_out: descending by date, then user name
    logs_out.sort(key=lambda x: (x.work_date, x.user_name), reverse=True)

    return AttendanceReportResponse(logs=logs_out, summary=summary_out)

