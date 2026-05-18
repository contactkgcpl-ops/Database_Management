
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
    print("Checking leads table structure...")
    cursor.execute("SHOW CREATE TABLE leads")
    row = cursor.fetchone()
    if row:
        print("CREATE TABLE statement for leads:")
        print(row[1])
    
    print("\nChecking properties with entity_type='lead'...")
    cursor.execute("SELECT name, field_key, group_type FROM properties WHERE group_type='lead'")
    props = cursor.fetchall()
    for p in props:
        print(f"Property: {p[0]} (Key: {p[1]}) Group: {p[2]}")

except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
