import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("DATABASE_URL environment variable is not set!")
    exit(1)

parts = db_url.replace("mysql+pymysql://", "").replace("@", "/").replace(":", "/").split("/")
user = parts[0]
password = parts[1]
host = parts[2]
port = int(parts[3])
db_name = parts[4]

conn = pymysql.connect(host=host, user=user, password=password, port=port, database=db_name)
cursor = conn.cursor()

try:
    print("Checking current status of connected_source property...")
    cursor.execute("SELECT id, name, field_key, object_type, filter_type FROM properties WHERE field_key='connected_source'")
    row = cursor.fetchone()
    if row:
        print(f"Current connected_source values: ID={row[0]}, Name='{row[1]}', field_key='{row[2]}', object_type='{row[3]}', filter_type='{row[4]}'")
    else:
        print("connected_source property not found in the properties table.")
        exit(1)

    print("\nUpdating connected_source to multiselect...")
    cursor.execute(
        "UPDATE properties SET object_type = 'multiselect', filter_type = 'multiselect' WHERE field_key = 'connected_source'"
    )
    conn.commit()
    print("Database updated and committed successfully!")

    print("\nChecking updated status of connected_source property...")
    cursor.execute("SELECT id, name, field_key, object_type, filter_type FROM properties WHERE field_key='connected_source'")
    row = cursor.fetchone()
    if row:
        print(f"New connected_source values: ID={row[0]}, Name='{row[1]}', field_key='{row[2]}', object_type='{row[3]}', filter_type='{row[4]}'")

except Exception as e:
    conn.rollback()
    print(f"An error occurred: {e}")
finally:
    conn.close()
