
import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
parts = db_url.replace("mysql+pymysql://", "").replace("@", "/").replace(":", "/").split("/")
user = parts[0]
password = parts[1]
host = parts[2]
port = int(parts[3])
db_name = parts[4]

conn = pymysql.connect(host=host, user=user, password=password, port=port, database=db_name)
cursor = conn.cursor()

try:
    print("Adding assignment columns to leads table...")
    cursor.execute("SHOW COLUMNS FROM leads LIKE 'assigned_to'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE leads ADD COLUMN assigned_to INT DEFAULT NULL")
        cursor.execute("ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id)")
    
    cursor.execute("SHOW COLUMNS FROM leads LIKE 'assigned_by'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE leads ADD COLUMN assigned_by INT DEFAULT NULL")
        cursor.execute("ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)")

    conn.commit()
    print("Migration successful!")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
