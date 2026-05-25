from datetime import date, datetime

from sqlalchemy.orm import Session, joinedload

from app.models import User, UserBreakLog, UserTimeLog
from app.schemas import UserBreakLogOut, UserTimeLogOut


def today() -> date:
    return datetime.now().date()


def now() -> datetime:
    return datetime.now()


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
    return UserTimeLogOut(
        id=log.id,
        user_id=log.user_id,
        user_name=log.user.name if log.user else None,
        work_date=log.work_date.isoformat(),
        login_at=log.login_at,
        logout_at=log.logout_at,
        total_break_seconds=break_seconds,
        total_work_seconds=work_seconds,
        status=log.status,
        active_break_start=active.break_start if active else None,
        breaks=[UserBreakLogOut.model_validate(item) for item in log.breaks],
        server_time=current_time,
    )
