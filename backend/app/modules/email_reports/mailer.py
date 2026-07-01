import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import date

def send_outlook_email(smtp_host: str, smtp_port: int, smtp_user: str, smtp_pass: str, to_emails: list[str], excel_bytes: bytes, target_date: date):
    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = ", ".join(to_emails)
    msg['Subject'] = f"Daily Activity & Performance Report — {target_date.strftime('%d-%b-%Y')}"
    
    body_text = f"""
    <html>
      <body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #333333;">
        <p>Dear Team,</p>
        <p>Please find attached the <strong>Daily Activity and Performance Report</strong> for today, <strong>{target_date.strftime('%d-%b-%Y')}</strong>.</p>
        <p>The report includes:
          <ul>
            <li><strong>🔵 Section A:</strong> Company & User summary counts</li>
            <li><strong>🟢 Section B:</strong> User login, logout, break logs, and status</li>
            <li><strong>🟠 Section C:</strong> User pending work summary</li>
            <li><strong>🟣 Section D:</strong> City & Industry activity breakdown</li>
            <li><strong>📄 Sheets 2+:</strong> Detailed user-level performance and call details</li>
          </ul>
        </p>
        <br/>
        <p style="font-size: 9pt; color: #777777;">This is an automated system-generated report. Please do not reply directly to this email.</p>
      </body>
    </html>
    """
    msg.attach(MIMEText(body_text, 'html'))
    
    filename = f"Daily_Activity_Report_{target_date.strftime('%Y-%m-%d')}.xlsx"
    part = MIMEBase('application', 'octet-stream')
    part.set_payload(excel_bytes)
    encoders.encode_base64(part)
    part.add_header('Content-Disposition', f"attachment; filename= {filename}")
    msg.attach(part)
    
    print(f"Connecting to SMTP server {smtp_host}:{smtp_port}...")
    if smtp_port == 465:
        server = smtplib.SMTP_SSL(smtp_host, smtp_port)
    else:
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
    print(f"Logging in to SMTP as {smtp_user}...")
    server.login(smtp_user, smtp_pass)
    
    print(f"Sending email to {to_emails}...")
    server.sendmail(smtp_user, to_emails, msg.as_string())
    server.quit()
    print("Email sent successfully.")
