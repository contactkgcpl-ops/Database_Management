
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")

engine = create_engine(db_url)

with engine.connect() as conn:
    result = conn.execute(text("SELECT id, name, field_key, is_active FROM properties WHERE name LIKE '%Company%' OR field_key LIKE '%Company%';"))
    for row in result:
        print(row)
