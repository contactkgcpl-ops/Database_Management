from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, require_any_permission, require_permission
from app.models import User
from app.modules.time_tracking.services import (
    close_day_log,
    end_break,
    get_today_log,
    list_my_logs,
    list_user_logs,
    start_break,
    start_day_log,
    to_time_log_out,
)
from app.schemas import UserTimeLogOut

router = APIRouter(prefix="/time", tags=["time"])


@router.get("/today", response_model=UserTimeLogOut | None)
def today_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.view", "time.break", "time.manage")),
):
    log = get_today_log(db, user, create=True)
    return to_time_log_out(log) if log else None


@router.get("/my", response_model=list[UserTimeLogOut])
def my_time_logs(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.view", "time.break", "time.manage")),
):
    return [to_time_log_out(log) for log in list_my_logs(db, user, start, end)]


@router.get("/users", response_model=list[UserTimeLogOut])
def user_time_logs(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("time.manage")),
):
    return [to_time_log_out(log) for log in list_user_logs(db, start, end, user_id)]


@router.post("/login", response_model=UserTimeLogOut)
def mark_login(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return to_time_log_out(start_day_log(db, user))


@router.post("/logout", response_model=UserTimeLogOut)
def mark_logout(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return to_time_log_out(close_day_log(db, user))


@router.post("/break/start", response_model=UserTimeLogOut)
def start_user_break(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.break", "time.view", "time.manage")),
):
    return to_time_log_out(start_break(db, user))


@router.post("/break/end", response_model=UserTimeLogOut)
def end_user_break(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.break", "time.view", "time.manage")),
):
    return to_time_log_out(end_break(db, user))
