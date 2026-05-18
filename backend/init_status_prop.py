
import pymysql, os; from dotenv import load_dotenv; load_dotenv(); 
db_url = os.getenv('DATABASE_URL').replace('mysql+pymysql://', '').replace('@', '/').replace(':', '/').split('/')
conn = pymysql.connect(host=db_url[2], user=db_url[0], password=db_url[1], port=int(db_url[3]), database=db_url[4])
cur = conn.cursor()

try:
    # Create property
    cur.execute("INSERT INTO properties (name, field_key, object_type, `group`, is_active, show_on_grid, grid_width, group_type, is_required, is_unique, is_multi_value, sort_order, created_at, updated_at) VALUES ('Status', 'status', 'dropdown', 'custom', 1, 1, 160, 'lead', 0, 0, 0, 0, NOW(), NOW())")
    
    # Add column to lead_manage if not exists
    cur.execute("SHOW COLUMNS FROM lead_manage LIKE 'status'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE lead_manage ADD COLUMN status TEXT")
        print("Column 'status' added to lead_manage")
    
    conn.commit()
    print("Status property created successfully.")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    conn.close()
