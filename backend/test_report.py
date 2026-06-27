import sys
sys.path.append('.')
from datetime import date
from app.db import SessionLocal
from app.modules.email_reports.services import get_report_data
from app.modules.email_reports.generators import generate_excel_report
from app.modules.email_reports.mailer import send_outlook_email
from app.models import EmailReportConfig

def test():
    db = SessionLocal()
    try:
        today = date.today()
        print("1. Fetching report data...")
        data = get_report_data(db, today)
        print("Data fetched keys:", data.keys())
        
        print("2. Generating Excel report...")
        excel_bytes = generate_excel_report(data, today)
        print(f"Excel generated successfully! Length: {len(excel_bytes)} bytes")
        
        config = db.query(EmailReportConfig).first()
        if not config:
            print("No email config found in database!")
            return
            
        import json
        emails = json.loads(config.to_emails)
        print(f"Config found: Host={config.smtp_host}, User={config.smtp_user}, Recipient={emails}")
        
        if not config.smtp_user or not config.smtp_password:
            print("SMTP User or Password not configured!")
            return
            
        if not emails:
            print("No recipient emails configured!")
            return
            
        print("3. Attempting to send email...")
        send_outlook_email(
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_pass=config.smtp_password,
            to_emails=emails,
            excel_bytes=excel_bytes,
            target_date=today
        )
        print("Email sent successfully in test!")
        
    except Exception as e:
        import traceback
        print("ERROR:")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == '__main__':
    test()
