
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
    print("Checking companies table structure...")
    cursor.execute("SHOW CREATE TABLE companies")
    row = cursor.fetchone()
    if row:
        print("CREATE TABLE statement:")
        print(row[1])
    
    print("\nChecking lead_manage table...")
    cursor.execute("SHOW TABLES LIKE 'lead_manage'")
    if cursor.fetchone():
        print("lead_manage table exists.")
    else:
        print("lead_manage table MISSING.")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
