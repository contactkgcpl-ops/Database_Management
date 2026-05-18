from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_permission, require_any_permission
from app.models import User, Company
from app.modules.companies.services import (
    create_company,
    CompanyValidationError,
    delete_company,
    get_company,
    list_companies,
    to_company_out,
    update_company,
    assign_company,
)
from app.schemas import CompanyCreate, CompanyOut, CompanyUpdate

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyOut])
def list_company_records(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("companies.view")),
):
    companies = list_companies(db, q)
    return [to_company_out(db, company) for company in companies]


@router.get("/my", response_model=list[CompanyOut])
def list_my_leads(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my")),
):
    # Filter list_companies result or add a new service method
    # For now, I'll filter manually or update list_companies
    from app.models import LeadManage
    import traceback
    try:
        print(f"DEBUG: Fetching leads for user {user.id} ({user.name})")
        query = db.query(Company).join(LeadManage, Company.id == LeadManage.company_id).filter(LeadManage.assigned_to_id == user.id)
        if q:
            term = f"%{q.strip()}%"
            query = query.filter(Company.company_name.ilike(term))
        
        companies_list = query.all()
        print(f"DEBUG: Found {len(companies_list)} companies in DB: {[f'{c.id}:{c.company_name}' for c in companies_list]}")
        
        results = []
        for c in companies_list:
            try:
                results.append(to_company_out(db, c, for_user_id=user.id))
            except Exception as e:
                print(f"ERROR transforming company {c.id}: {e}")
                traceback.print_exc()
        
        return results
    except Exception as e:
        print(f"FATAL ERROR in list_my_leads: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{company_id}", response_model=CompanyOut)
def get_company_record(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("companies.view")),
):
    company = get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return to_company_out(db, company)


@router.post("", response_model=CompanyOut)
def create_company_record(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("companies.manage")),
):
    try:
        company = create_company(db, payload, user)
        return to_company_out(db, company)
    except CompanyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        detail = f"Database error: {exc.args[0]}" if exc.args else "Database integrity error"
        if hasattr(exc, "orig") and hasattr(exc.orig, "args") and len(exc.orig.args) > 1:
            detail = f"Database error: {exc.orig.args[1]}"
        raise HTTPException(status_code=409, detail=detail) from exc


@router.put("/{company_id}", response_model=CompanyOut)
def update_company_record(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_any_permission("companies.manage", "leads.my", "leads.assign")),
):
    company = get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        company = update_company(db, company, payload)
        return to_company_out(db, company)
    except CompanyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        detail = f"Database error: {exc.args[0]}" if exc.args else "Database integrity error"
        if hasattr(exc, "orig") and hasattr(exc.orig, "args") and len(exc.orig.args) > 1:
            detail = f"Database error: {exc.orig.args[1]}"
        raise HTTPException(status_code=409, detail=detail) from exc


@router.delete("/{company_id}")
def delete_company_record(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("companies.manage")),
):
    company = get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    delete_company(db, company)
    return {"ok": True}
    
@router.post("/{company_id}/assign", response_model=CompanyOut)
def assign_company_record(
    company_id: int,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.assign")),
):
    company = get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company = assign_company(db, company, user_id, assigned_by_id=user.id)
    return to_company_out(db, company)

from app.schemas import InlinePropertyUpdate, LeadHistoryOut
from app.modules.companies.services import update_property_inline, get_lead_history

@router.put("/{company_id}/inline-update", response_model=CompanyOut)
def update_company_inline_endpoint(
    company_id: int,
    payload: InlinePropertyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.my", "leads.assign"))
):
    try:
        updated = update_property_inline(db, company_id, payload, user)
        return to_company_out(db, updated, for_user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{company_id}/history", response_model=list[LeadHistoryOut])
def get_company_history_endpoint(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my", "leads.assign"))
):
    history = get_lead_history(db, company_id)
    return [{
        **h.__dict__,
        "user_name": h.user.name if h.user else None
    } for h in history]
