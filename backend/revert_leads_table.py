
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
    print("Dropping leads and lead_property_values tables...")
    cursor.execute("DROP TABLE IF EXISTS lead_property_values")
    cursor.execute("DROP TABLE IF EXISTS leads")
    
    print("Migrating lead-group properties to lead_manage...")
    # Find all properties with entity_type='lead'
    cursor.execute("SELECT field_key FROM properties WHERE group_type='lead'")
    props = cursor.fetchall()
    
    for (field_key,) in props:
        print(f"Adding column {field_key} to lead_manage...")
        cursor.execute(f"SHOW COLUMNS FROM lead_manage LIKE '{field_key}'")
        if not cursor.fetchone():
            cursor.execute(f"ALTER TABLE lead_manage ADD COLUMN {field_key} TEXT")

    conn.commit()
    print("Migration successful!")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
