from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import require_permission
from app.models import User
from app.modules.tracking.services import get_tracking_filters, get_connection_tracking

router = APIRouter(prefix="/tracking", tags=["tracking"])

@router.get("/filters")
def get_filters_endpoint(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("tracking.view")),
):
    return get_tracking_filters(db)

@router.get("/connection")
def get_connection_tracking_endpoint(
    states: list[str] | None = Query(None),
    companies: list[int] | None = Query(None),
    industries: list[str] | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("tracking.view")),
):
    return get_connection_tracking(
        db, 
        states=states, 
        company_ids=companies, 
        industries=industries
    )
