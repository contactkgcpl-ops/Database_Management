import sys
sys.path.append('.')
import json
from app.db import SessionLocal
from app.models import EmailReportConfig
from app.schemas import EmailReportConfigUpdate
from app.modules.email_reports.router import update_report_config

def simulate():
    db = SessionLocal()
    try:
        # Fetch current config
        cfg = db.query(EmailReportConfig).first()
        print(f"Before update: to_emails={cfg.to_emails if cfg else None}")
        
        # Simulating updating recipients list to ["test1@gmail.com", "test2@gmail.com"]
        payload = EmailReportConfigUpdate(
            to_emails=["test1@gmail.com", "test2@gmail.com"]
        )
        
        # We call the router function directly with mock admin user
        from app.models import User
        admin_user = db.query(User).first() # Just any user since we bypass auth locally
        
        res = update_report_config(payload, db, admin_user)
        print(f"Router response: to_emails={res.to_emails}")
        
        # Verify in DB
        db.expire_all()
        cfg_after = db.query(EmailReportConfig).first()
        print(f"After update in DB: to_emails={cfg_after.to_emails}")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == '__main__':
    simulate()
