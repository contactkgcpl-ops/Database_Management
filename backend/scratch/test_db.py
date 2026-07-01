import sys
sys.path.append('c:\\Salvin\\Data-Management\\backend')
from app.db import SessionLocal
from app.models import UserLocationLog, UserTimeLog

db = SessionLocal()
try:
    loc_count = db.query(UserLocationLog).count()
    time_logs_count = db.query(UserTimeLog).count()
    print(f"UserLocationLog count: {loc_count}")
    print(f"UserTimeLog count: {time_logs_count}")
    
    # Print columns of UserTimeLog
    from sqlalchemy import inspect
    inspector = inspect(db.bind)
    cols = [c['name'] for c in inspector.get_columns('user_time_logs')]
    print("UserTimeLog columns:", cols)
    
    # Print latest entries
    latest_locs = db.query(UserLocationLog).order_by(UserLocationLog.id.desc()).limit(5).all()
    for l in latest_locs:
        print(f"ID: {l.id}, User ID: {l.user_id}, Date: {l.work_date}, Lat: {l.latitude}, Lng: {l.longitude}, Time: {l.recorded_at}")
except Exception as e:
    print("Error:", e)
finally:
    db.close()
