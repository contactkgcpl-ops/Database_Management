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
    get_attendance_report,
)
from app.schemas import UserTimeLogOut, AttendanceReportResponse, UserLocationLogOut

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


@router.get("/attendance-report", response_model=AttendanceReportResponse)
def attendance_report(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("time.manage", "leave.manage")),
):
    if not start:
        from datetime import date as dt_date, timedelta
        start = dt_date.today() - timedelta(days=30)
    if not end:
        from datetime import date as dt_date
        end = dt_date.today()
    return get_attendance_report(db, start, end, user_id)


def broadcast_time_log(user_id: int, log_out):
    try:
        from app.modules.chat.router import send_notification_to_user_sync
        from fastapi.encoders import jsonable_encoder
        send_notification_to_user_sync(user_id, {
            "type": "time_log",
            "payload": jsonable_encoder(log_out)
        })
        
        # Also broadcast reporting status update on time log changes
        from app.db import SessionLocal
        from app.modules.strict_reporting.services import get_reporting_status
        from app.models import User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                status_data = get_reporting_status(db, user)
                send_notification_to_user_sync(user_id, {
                    "type": "reporting_status",
                    "payload": jsonable_encoder(status_data)
                })
        finally:
            db.close()
    except Exception:
        pass


@router.post("/login", response_model=UserTimeLogOut)
def mark_login(db: Session = Depends(get_db), user: User = Depends(current_user)):
    log_out = to_time_log_out(start_day_log(db, user))
    broadcast_time_log(user.id, log_out)
    return log_out


@router.post("/logout", response_model=UserTimeLogOut)
def mark_logout(db: Session = Depends(get_db), user: User = Depends(current_user)):
    log_out = to_time_log_out(close_day_log(db, user))
    broadcast_time_log(user.id, log_out)
    return log_out


@router.post("/resume", response_model=UserTimeLogOut)
def resume_time(db: Session = Depends(get_db), user: User = Depends(current_user)):
    log_out = to_time_log_out(start_day_log(db, user))
    broadcast_time_log(user.id, log_out)
    return log_out


@router.post("/break/start", response_model=UserTimeLogOut)
def start_user_break(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.break", "time.view", "time.manage")),
):
    log_out = to_time_log_out(start_break(db, user))
    broadcast_time_log(user.id, log_out)
    return log_out


@router.post("/break/end", response_model=UserTimeLogOut)
def end_user_break(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("time.break", "time.view", "time.manage")),
):
    log_out = to_time_log_out(end_break(db, user))
    broadcast_time_log(user.id, log_out)
    return log_out

from pydantic import BaseModel
class LocationPayload(BaseModel):
    latitude: float
    longitude: float

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0)**2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

@router.post("/location", response_model=UserTimeLogOut)
def update_user_location(
    payload: LocationPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    from datetime import datetime, timedelta
    from app.models import UserLocationLog
    
    # Calculate Indian timezone (IST) current time and date
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    ist_today = ist_now.date()
    
    log = get_today_log(db, user, create=True)
    
    # Check last saved location today in IST date context
    latest_log = db.query(UserLocationLog).filter(
        UserLocationLog.user_id == user.id,
        UserLocationLog.work_date == ist_today
    ).order_by(UserLocationLog.recorded_at.desc()).first()
    
    should_log = False
    if not latest_log:
        should_log = True
    else:
        # Distance calculation in meters using Haversine formula
        distance = haversine_distance_meters(
            latest_log.latitude, latest_log.longitude,
            payload.latitude, payload.longitude
        )
        # Only log if they moved more than 100 meters away from the last saved location
        if distance > 100.0:
            should_log = True
                
    if should_log:
        new_loc_log = UserLocationLog(
            user_id=user.id,
            work_date=ist_today,
            latitude=payload.latitude,
            longitude=payload.longitude,
            recorded_at=datetime.utcnow()
        )
        db.add(new_loc_log)
        
    # Also update coordinates in UserTimeLog
    if log.login_latitude is None or log.login_longitude is None:
        log.login_latitude = payload.latitude
        log.login_longitude = payload.longitude
        
    log.latitude = payload.latitude
    log.longitude = payload.longitude
    log.location_timestamp = datetime.utcnow()
    
    db.commit()
    db.refresh(log)
    
    log_out = to_time_log_out(log)
    broadcast_time_log(user.id, log_out)
    return log_out

@router.get("/location-history", response_model=list[UserLocationLogOut])
def get_location_history(
    date: str = None,
    user_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("time.manage"))
):
    from app.models import UserLocationLog, User
    from datetime import datetime
    
    query = db.query(UserLocationLog).join(User, UserLocationLog.user_id == User.id)
    
    if date:
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d").date()
            query = query.filter(UserLocationLog.work_date == parsed_date)
        except ValueError:
            pass
    else:
        # Default to today
        from datetime import date as dt_date
        query = query.filter(UserLocationLog.work_date == dt_date.today())
        
    if user_id:
        query = query.filter(UserLocationLog.user_id == user_id)
        
    logs = query.order_by(User.name.asc(), UserLocationLog.recorded_at.desc()).all()
    
    results = []
    for l in logs:
        results.append(UserLocationLogOut(
            id=l.id,
            user_id=l.user_id,
            user_name=l.user.name,
            user_email=l.user.email,
            work_date=l.work_date.isoformat(),
            latitude=l.latitude,
            longitude=l.longitude,
            recorded_at=l.recorded_at
        ))
    return results
