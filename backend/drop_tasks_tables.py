import sqlite3
from sqlalchemy import create_engine, text
from app.core.config import get_settings

def drop_tables():
    settings = get_settings()
    engine = create_engine(settings.database_url)
    
    tables_to_drop = [
        "task_notifications",
        "task_comments",
        "task_history",
        "task_timer_logs",
        "tasks"
    ]
    
    with engine.begin() as conn:
        for table in tables_to_drop:
            print(f"Dropping table {table}...")
            conn.execute(text(f"DROP TABLE IF EXISTS {table};"))
            
    print("Tables dropped successfully.")

if __name__ == "__main__":
    drop_tables()
