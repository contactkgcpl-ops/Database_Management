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
from app.modules.tasks import router as tasks
from app.modules.vendors import router as vendors
from app.modules.orders import router as orders
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
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        migrate_all(db)
        seed_defaults(db)
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
app.include_router(tasks.router, prefix="/api")
app.include_router(vendors.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
# trigger reload for schema migration
