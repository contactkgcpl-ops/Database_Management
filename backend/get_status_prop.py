
import pymysql, os; from dotenv import load_dotenv; load_dotenv(); 
db_url = os.getenv('DATABASE_URL').replace('mysql+pymysql://', '').replace('@', '/').replace(':', '/').split('/')
conn = pymysql.connect(host=db_url[2], user=db_url[0], password=db_url[1], port=int(db_url[3]), database=db_url[4])
cur = conn.cursor()
cur.execute("SELECT id, name, field_key FROM properties WHERE field_key='status'")
print(cur.fetchone())
