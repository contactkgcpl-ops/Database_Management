
from sqlalchemy import create_engine, inspect, text
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")

engine = create_engine(db_url)

with engine.connect() as conn:
    print("--- LEAD_MANAGE COLUMNS ---")
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("lead_manage")]
    print(columns)
    
    print("\n--- PROPERTIES LIST ---")
    result = conn.execute(text("SELECT id, name, field_key, is_active FROM properties WHERE is_active = 1;"))
    for row in result:
        print(row)
