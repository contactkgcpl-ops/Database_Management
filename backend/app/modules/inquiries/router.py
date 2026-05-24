from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_any_permission, require_permission
from app.models import User
from app.modules.companies.services import to_company_out
from app.modules.inquiries.permissions import (
    INQUIRY_ASSIGN,
    INQUIRY_CREATE,
    INQUIRY_PIPELINE,
    INQUIRY_UPDATE,
    INQUIRY_VIEW,
)
from app.modules.inquiries.schemas import InquiryAssign, InquiryCreate, InquiryStageUpdate
from app.modules.inquiries.services import assign_inquiry, create_inquiry, list_inquiries, update_stage
from app.schemas import CompanyOut

router = APIRouter(prefix="/inquiries", tags=["inquiries"])


@router.get("", response_model=list[CompanyOut])
def list_inquiry_records(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(INQUIRY_VIEW, "companies.view", "leads.my")),
):
    return list_inquiries(db, q, user)


@router.post("", response_model=CompanyOut)
def create_inquiry_record(
    payload: InquiryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(INQUIRY_CREATE, "companies.manage", "leads.add")),
):
    try:
        company = create_inquiry(db, payload, user)
        return to_company_out(db, company, for_user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/{company_id}/stage", response_model=CompanyOut)
def update_inquiry_stage(
    company_id: int,
    payload: InquiryStageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(INQUIRY_UPDATE, INQUIRY_PIPELINE, "companies.manage", "leads.my")),
):
    try:
        company = update_stage(db, company_id, payload, user)
        return to_company_out(db, company, for_user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{company_id}/assign", response_model=CompanyOut)
def assign_inquiry_record(
    company_id: int,
    payload: InquiryAssign,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(INQUIRY_ASSIGN, "companies.manage", "leads.assign")),
):
    try:
        company = assign_inquiry(db, company_id, payload.user_id, user)
        return to_company_out(db, company, for_user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

