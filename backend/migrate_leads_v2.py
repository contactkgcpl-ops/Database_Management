
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
    print("Adding group column to properties...")
    cursor.execute("SHOW COLUMNS FROM properties LIKE 'group_type'")
    if not cursor.fetchone():
        # Using group_type instead of group as it might be a reserved word in some contexts, but model uses group
        cursor.execute("ALTER TABLE properties ADD COLUMN group_type VARCHAR(50) DEFAULT 'company'")
    
    print("Creating leads table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_name VARCHAR(180) NOT NULL,
            created_by INT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_leads_creator FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """)

    print("Creating lead_property_values table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lead_property_values (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            property_id INT NOT NULL,
            value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_lpv_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
            CONSTRAINT fk_lpv_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """)

    print("Adding 'My Leads' grid to display_grids...")
    cursor.execute("INSERT IGNORE INTO display_grids (`grid_key`, `name`, `is_active`, `sort_order`) VALUES ('my_leads', 'My Leads', 1, 30)")

    conn.commit()
    print("Migration successful!")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
