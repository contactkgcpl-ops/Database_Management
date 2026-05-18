
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
    print("Dropping assigned_to column from companies...")
    
    # Check if column exists
    cursor.execute("SHOW COLUMNS FROM companies LIKE 'assigned_to'")
    if cursor.fetchone():
        try:
            # Try to drop common FK names if they exist, ignore errors
            cursor.execute("ALTER TABLE companies DROP FOREIGN KEY companies_ibfk_2")
        except:
            pass
        
        try:
            cursor.execute("ALTER TABLE companies DROP COLUMN assigned_to")
            print("Column 'assigned_to' dropped successfully.")
        except Exception as e:
            print(f"Error dropping column: {e}")
    else:
        print("Column 'assigned_to' already gone.")

    conn.commit()
    print("Cleanup successful!")
except Exception as e:
    conn.rollback()
    print(f"Fatal Error: {e}")
finally:
    conn.close()
