Below is full clean deploy plan, step by step, with possible errors and fixes.

Your final values:

Domain: salvinindustires.com
VPS IP: 72.60.108.5
Project path: /var/www/salvin-data-management
DB name: salvin_data_management_db
DB user: salvin_db
DB pass: salvin@db
Backend port: 8001
Backend service: salvin-data-management-backend
DB UI: phpMyAdmin at /dbadmin
Note spelling: you gave salvinindustires.com. Use this exact spelling only if that is real domain.

Step 1: DNS
In Hostinger DNS for salvinindustires.com, set:

A      @      72.60.108.5
CNAME  www    salvinindustires.com
Delete:

AAAA @
AAAA www
old A @
Check from VPS:

nslookup salvinindustires.com 8.8.8.8
Success:

Address: 72.60.108.5
Possible issue:

SERVFAIL: DNSSEC/nameserver issue. Disable DNSSEC, use Hostinger nameservers, wait.
No answer: A record not saved/published.
Old IP: cache or old A record still exists.
You can continue with IP first even if DNS pending.

Step 2: Install Software
SSH into VPS:

ssh root@72.60.108.5
ED25519 key fingerprint is HA256:n/xPUjHwYjDaQP5C3dyXclDhKV2Vvxw70WfH8d9GFdw.
Install:

apt update && apt upgrade -y
apt install -y git nginx mysql-server python3-venv python3-pip curl certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs


Check:

node -v
npm -v
python3 --version
mysql --version
nginx -v
Possible issue:

curl command not found: apt install -y curl
Node old version: rerun NodeSource commands.
Step 3: Clone Project

cd /var/www
git clone https://github.com/contactkgcpl-ops/Database_Management.git salvin-data-management
cd /var/www/salvin-data-management
If private repo, use GitHub SSH key or token.

Check files:

ls
Need:

backend frontend README.md
Step 4: Create MySQL DB

mysql
Run:

CREATE DATABASE salvin_data_management_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'salvin_db'@'localhost' IDENTIFIED BY 'salvin@db';
GRANT ALL PRIVILEGES ON salvin_data_management_db.* TO 'salvin_db'@'localhost';
FLUSH PRIVILEGES;
EXIT;
If user exists:

ALTER USER 'salvin_db'@'localhost' IDENTIFIED BY 'salvin@db';
GRANT ALL PRIVILEGES ON salvin_data_management_db.* TO 'salvin_db'@'localhost';
FLUSH PRIVILEGES;
EXIT;
Test:

mysql -u salvin_db -p salvin_data_management_db
Password:
salvin@db
Exit:

EXIT;
Possible issue:

Access denied: password/user wrong.
database exists: okay, continue or drop only if clean reinstall.
Step 5: Backend Env

cd /var/www/salvin-data-management/backend
cp .env.example .env
nano .env
Use:

DATABASE_URL=mysql+pymysql://salvin_db:salvin%40db@localhost:3306/salvin_data_management_db
JWT_SECRET=CHANGE_LONG_RANDOM_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=480
BACKEND_CORS_ORIGINS=https://72.60.108.5,http://72.60.108.5,https://salvinindustires.com,https://www.salvinindustires.com
Important:

DB password is salvin@db
In URL write salvin%40db
Generate secret:

openssl rand -hex 32 
9ff3ea5f80be6a0b294f966eff27874e9111bd0e937305a6c140be5b465a0981
Possible issue:

If you write salvin@db directly in URL, backend DB connection fails.
If CORS missing IP/domain, login request can fail in browser.
Step 6: Backend Install

cd /var/www/salvin-data-management/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
Run setup manually:

python -c "from app.db import Base, engine, SessionLocal; from app.core.schema_migrations import migrate_all; from app.seed import seed_defaults; Base.metadata.create_all(bind=engine); db=SessionLocal(); migrate_all(db); seed_defaults(db); db.close(); print('setup done')"
This creates:

tables
migrations
default permissions
Admin role
admin user
default properties
property options
grids
Possible issue:

ModuleNotFoundError: run from /backend, venv active.
DB connection error: check .env, MySQL user/password.
Step 7: Test Backend Manually

uvicorn app.main:app --host 127.0.0.1 --port 8001
Open second SSH terminal:

curl http://127.0.0.1:8001/api/health
Success:

{"status":"ok"}
Stop manual server: CTRL+C.

Possible issue:

address already in use: port 8001 used. Use 8002 and update all configs.
500 error: check traceback in terminal.
Step 8: Create Backend Service

nano /etc/systemd/system/salvin-data-management-backend.service
Paste:

[Unit]
Description=Salvin Data Management Backend
After=network.target mysql.service

[Service]
User=root
WorkingDirectory=/var/www/salvin-data-management/backend
Environment="PATH=/var/www/salvin-data-management/backend/.venv/bin"
ExecStart=/var/www/salvin-data-management/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
Start:

systemctl daemon-reload
systemctl enable salvin-data-management-backend
systemctl start salvin-data-management-backend
systemctl status salvin-data-management-backend
Test:

curl http://127.0.0.1:8001/api/health
Logs:

journalctl -u salvin-data-management-backend -n 100 --no-pager
Possible issue:

Unit file does not exist: file name mismatch.
failed: read journal logs.
Step 9: Frontend Env + Build

cd /var/www/salvin-data-management/frontend
cp .env.example .env
nano .env
If DNS not ready, use IP:

VITE_API_URL=http://72.60.108.5/api
If DNS + SSL ready later, use:

VITE_API_URL=https://salvinindustires.com/api
Install/build:

npm install
npm run build
Possible issue:

vite permission denied: run:
rm -rf node_modules package-lock.json
npm install
npm run build
Step 10: Nginx CRM Site

nano /etc/nginx/sites-available/salvin-data-management
Paste:

server {
    listen 80;
    server_name 72.60.108.5 salvinindustires.com www.salvinindustires.com;

    root /var/www/salvin-data-management/frontend/dist;
    index index.html;

    client_max_body_size 50M;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8001/uploads/;
        proxy_set_header Host $host;
    }
}
Enable:

ln -s /etc/nginx/sites-available/salvin-data-management /etc/nginx/sites-enabled/salvin-data-management
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
Test:

curl http://72.60.108.5/api/health
Possible issue:

nginx -t fails broken old link: remove bad link in sites-enabled.
Old website showing: wrong root or DNS points elsewhere.
Step 11: Open CRM
Use IP first:

http://72.60.108.5
Login:

Email: salvin@gmail.com
Password: salvin@123
If invalid credentials, reset admin:

cd /var/www/salvin-data-management/backend
source .venv/bin/activate
python -c "from app.db import SessionLocal; from app.models import User, Role; from app.security import hash_password; db=SessionLocal(); role=db.query(Role).filter(Role.name=='Admin').first(); u=db.query(User).filter(User.email=='salvin@gmail.com').first() or User(email='salvin@gmail.com'); u.name='Salvin Admin'; u.hashed_password=hash_password('salvin@123'); u.role_id=role.id; u.is_active=True; db.add(u); db.commit(); db.close(); print('admin fixed')"
systemctl restart salvin-data-management-backend
Step 12: SSL
Only after DNS works:

nslookup salvinindustires.com 8.8.8.8
Must show:

72.60.108.5
Run:

certbot --nginx -d salvinindustires.com -d www.salvinindustires.com --email salvin@gmail.com --agree-tos --no-eff-email
After SSL, change frontend env:

cd /var/www/salvin-data-management/frontend
nano .env
VITE_API_URL=https://salvinindustires.com/api
Rebuild:

npm run build
systemctl restart nginx
Backend CORS:

nano /var/www/salvin-data-management/backend/.env
BACKEND_CORS_ORIGINS=https://salvinindustires.com,https://www.salvinindustires.com,http://72.60.108.5
Restart:

systemctl restart salvin-data-management-backend
Possible issue:

Certbot fails DNS: domain not resolving. Fix DNS first.
Browser still calls old API: rebuild frontend and hard refresh.
Step 13: phpMyAdmin DB UI
Install DB panel:

apt install -y phpmyadmin php-fpm php-mysql apache2-utils
Check PHP socket:

ls /run/php/
Example:

php8.3-fpm.sock
Edit Nginx:

nano /etc/nginx/sites-available/salvin-data-management
Add inside same server { ... } block before final }:

location /dbadmin {
    alias /usr/share/phpmyadmin;
    index index.php;
    auth_basic "DB Admin";
    auth_basic_user_file /etc/nginx/.pma_pass;
}

location ~ ^/dbadmin/(.+\.php)$ {
    alias /usr/share/phpmyadmin/$1;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_index index.php;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME /usr/share/phpmyadmin/$1;
    auth_basic "DB Admin";
    auth_basic_user_file /etc/nginx/.pma_pass;
}
If socket is php8.2-fpm.sock, replace line.

Create basic auth:

htpasswd -c /etc/nginx/.pma_pass salvin
Set password.

Restart:

nginx -t
systemctl restart nginx
Open:

http://72.60.108.5/dbadmin
After SSL:

https://salvinindustires.com/dbadmin
First browser popup login:

user: salvin
password: password you set in htpasswd
phpMyAdmin login:

username: salvin_db
password: salvin@db
database: salvin_data_management_db
Security note: phpMyAdmin public is risky. Keep basic auth. Remove if not needed:

apt purge -y phpmyadmin
Step 14: DB Tables To Expect
After setup, DB has:

roles
permissions
role_permissions
users
properties
display_grids
property_grids
property_options
companies
company_property_values
lead_manage
lead_history
lead_followups
Check:

mysql -u salvin_db -p salvin_data_management_db
SHOW TABLES;
SELECT email, is_active FROM users;
SELECT code FROM permissions;
SELECT name FROM roles;
SELECT name, field_key FROM properties;
SELECT label, value FROM property_options;
Step 15: Update App Later

cd /var/www/salvin-data-management
git pull

cd backend
source .venv/bin/activate
pip install -r requirements.txt
python -c "from app.db import Base, engine, SessionLocal; from app.core.schema_migrations import migrate_all; from app.seed import seed_defaults; Base.metadata.create_all(bind=engine); db=SessionLocal(); migrate_all(db); seed_defaults(db); db.close(); print('updated')"
systemctl restart salvin-data-management-backend

cd ../frontend
npm install
npm run build
systemctl restart nginx
This is clean path. Start with IP first, then domain/SSL when DNS is healthy.





2:46 PM