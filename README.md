# Data Management ERP

Full-stack ERP starter for company data management.

## Stack

- Frontend: React + Vite
- Backend: Python FastAPI
- Database: PostgreSQL by default, MySQL supported through `DATABASE_URL`
- Auth: JWT login
- RBAC: roles, permissions, menu-wise sidebar visibility

## Modules

- Login system
- Admin dashboard
- User add/edit/delete
- Role add/edit/delete
- Permission grid
- Dynamic CSV format builder
- Sidebar based on logged-in user permissions
- Company data list
- Dynamic CSV upload

## Code Structure

Backend is module based:

```text
backend/app/
  core/              # settings/config
  modules/
    auth/            # login and current user API
    users/           # user CRUD API
    roles/           # roles and permission grid API
    companies/       # company list API
    csv_format/      # admin-defined CSV field API
    csv_upload/      # dynamic CSV import API
  db.py              # SQLAlchemy engine/session
  deps.py            # auth and permission dependencies
  models.py          # database tables
  schemas.py         # request/response schemas
  seed.py            # default admin/permissions
```

Frontend is module based:

```text
frontend/src/
  components/        # reusable UI
  config/            # navigation and menu permission config
  context/           # auth state
  hooks/             # reusable data hooks
  layout/            # app shell/sidebar
  pages/             # feature pages
  api.js             # API integration
  App.jsx            # app composition
```

## Database Tables

Created automatically on backend startup:

- `users`
- `roles`
- `permissions`
- `role_permissions`
- `companies`
- `csv_field_definitions`
- `company_field_values`
- `csv_upload_logs`

## Run

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Default admin:

- Email: `salvin@gmail.com`
- Password: `salvin@123`

## MySQL

Change `backend/.env`:

```env
DATABASE_URL=mysql+pymysql://erp_user:erp_password@localhost:3306/erp_db
```

## Hostinger VPS Deployment

Use Ubuntu VPS with Docker, Nginx, and systemd/PM2 or Docker Compose.

1. Point domain DNS `A` record to VPS public IP.
2. SSH into VPS:

```bash
ssh root@YOUR_SERVER_IP
```

3. Install packages:

```bash
apt update
apt install -y git nginx python3-venv python3-pip nodejs npm mysql-server certbot python3-certbot-nginx
```

4. Clone project:

```bash
git clone YOUR_REPO_URL /var/www/data-management
cd /var/www/data-management
```

5. Create MySQL DB:

```sql
CREATE DATABASE erp_db;
CREATE USER 'erp_user'@'localhost' IDENTIFIED BY 'CHANGE_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON erp_db.* TO 'erp_user'@'localhost';
FLUSH PRIVILEGES;
```

6. Configure backend env at `/var/www/data-management/backend/.env`:

```env
DATABASE_URL=mysql+pymysql://erp_user:CHANGE_STRONG_PASSWORD@localhost:3306/erp_db
JWT_SECRET=CHANGE_LONG_RANDOM_SECRET
BACKEND_CORS_ORIGINS=https://yourdomain.com
```

7. Start backend:

```bash
cd /var/www/data-management/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

First backend start creates tables, permissions, and default admin.

8. Build frontend:

```bash
cd /var/www/data-management/frontend
npm install
VITE_API_URL=https://yourdomain.com/api npm run build
```

9. Configure Nginx:

```nginx
server {
    server_name yourdomain.com;

    root /var/www/data-management/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
    }
}
```

10. Enable HTTPS:

```bash
certbot --nginx -d yourdomain.com
```

11. Test:

```bash
curl https://yourdomain.com/api/health
```

Login:

- Email: `salvin@gmail.com`
- Password: `salvin@123`

## Dynamic CSV Format

Admin first defines CSV fields in **Define CSV Format**.

Each field has:

- Field label
- Field key
- Data type: `text`, `email`, `mobile`, `telephone`, `number`, `date`
- Value type: `single` or `multiple`
- Required flag
- Unique flag

Upload rules:

- CSV headers must contain all admin-defined field labels
- Required fields must have values
- Field values are cleaned by data type
- Multiple values can use comma, semicolon, slash, or pipe
- Duplicate multiple values inside one row are removed
- Unique fields reject duplicates across database and current upload
- Single-value fields are stored as dynamic columns on `companies`
- Multiple-value fields are stored in `company_field_values`


-  docker on 
docker compose up -d mysql phpmyadmin
docker compose ps
- backend on 
cd C:\Salvin\Data-Management\backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload

cd C:\Salvin\Data-Management\frontend npm run dev
- frond on


url: http://localhost:5173/
db - http://127.0.0.1:8081/
http://127.0.0.1:8000/api/health
