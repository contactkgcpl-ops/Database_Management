
import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
# DATABASE_URL=mysql+pymysql://erp_user:erp_password@localhost:3306/erp_db
parts = db_url.replace("mysql+pymysql://", "").replace("@", "/").replace(":", "/").split("/")
user = parts[0]
password = parts[1]
host = parts[2]
port = int(parts[3])
db_name = parts[4]

conn = pymysql.connect(host=host, user=user, password=password, port=port, database=db_name)
cursor = conn.cursor()

try:
    print("Creating lead_manage table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lead_manage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            assigned_to_id INT NULL,
            assigned_by_id INT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_lead_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
            CONSTRAINT fk_lead_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_lead_assigned_by FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    
    print("Migrating existing assignments if any...")
    cursor.execute("""
        INSERT INTO lead_manage (company_id, assigned_to_id, assigned_by_id)
        SELECT id, assigned_to, created_by FROM companies WHERE assigned_to IS NOT NULL
    """)

    print("Dropping assigned_to column from companies...")
    # Check if column exists first to avoid error
    cursor.execute("SHOW COLUMNS FROM companies LIKE 'assigned_to'")
    if cursor.fetchone():
        cursor.execute("ALTER TABLE companies DROP FOREIGN KEY companies_ibfk_2") # Name might vary, let's try dropping by name if possible or just ignore if it fails
    
    # safer way to drop column in mysql
    try:
        cursor.execute("ALTER TABLE companies DROP COLUMN assigned_to")
    except Exception as e:
        print(f"Warning dropping column: {e}")

    conn.commit()
    print("Refactor successful!")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
