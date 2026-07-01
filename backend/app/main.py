from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.schema_migrations import migrate_all
from app.db import Base, SessionLocal, engine
from app.modules.auth import router as auth
from app.modules.companies import router as companies
from app.modules.properties import router as properties
from app.modules.roles import router as roles
from app.modules.users import router as users
from app.modules.leads import router as leads
from app.modules.inquiries import router as inquiries
from app.modules.requirements import router as requirements
from app.modules.time_tracking import router as time_tracking
from app.modules.dashboard import router as dashboard
from app.modules.reporting import router as reporting
from app.modules.chat import router as chat
from app.modules.vendors import router as vendors
from app.modules.leave_management import router as leave_management
from app.modules.our_companies import router as our_companies
from app.modules.tracking import router as tracking
from app.modules.email_reports import router as email_reports
from app.modules.email_reports.scheduler import start_scheduler
from app.modules import strict_reporting
from app.seed import seed_defaults

settings = get_settings()
Path("storage/uploads").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Marketing & Sales ERP API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="storage/uploads"), name="uploads")


@app.on_event("startup")
def startup() -> None:
    import asyncio
    from app.modules.chat.router import set_main_loop
    from sqlalchemy import text
    
    set_main_loop(asyncio.get_event_loop())

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        migrate_all(db)
        seed_defaults(db)
        # Migrate email_report_logs recipients column
        try:
            db.execute(text("ALTER TABLE email_report_logs ADD COLUMN recipients TEXT"))
            db.commit()
        except Exception:
            db.rollback()
        # Migrate lead_manage multi-assign column
        try:
            db.execute(text("ALTER TABLE lead_manage ADD COLUMN assigned_to_ids TEXT"))
            db.commit()
        except Exception:
            db.rollback()
        try:
            # Back-fill existing single assignments into the new column
            db.execute(text(
                "UPDATE lead_manage SET assigned_to_ids = CAST(assigned_to_id AS CHAR) "
                "WHERE assigned_to_id IS NOT NULL AND (assigned_to_ids IS NULL OR assigned_to_ids = '')"
            ))
            db.commit()
        except Exception:
            db.rollback()
        # Start the scheduler
        start_scheduler()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(roles.router, prefix="/api")
app.include_router(properties.router, prefix="/api")
app.include_router(companies.router, prefix="/api")
app.include_router(leads.router, prefix="/api")
app.include_router(inquiries.router, prefix="/api")
app.include_router(requirements.router, prefix="/api")
app.include_router(time_tracking.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(reporting.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(vendors.router, prefix="/api")
app.include_router(leave_management.router, prefix="/api")
app.include_router(our_companies.router, prefix="/api")
app.include_router(tracking.router, prefix="/api")
app.include_router(email_reports.router, prefix="/api")
app.include_router(strict_reporting.router, prefix="/api")
# trigger reload for schema migration
