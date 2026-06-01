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
    from app.models import LeadManage
    import traceback
    try:
        child_ids = [row.id for row in db.query(User.id).filter(User.parent_id == user.id).all()]
        allowed_user_ids = [user.id] + child_ids

        query = db.query(Company).join(LeadManage, Company.id == LeadManage.company_id).filter(
            LeadManage.assigned_to_id.in_(allowed_user_ids),
            LeadManage.is_inquiry != True
        )
        if q:
            term = f"%{q.strip()}%"
            query = query.filter(Company.company_name.ilike(term))
        
        companies_list = query.all()
        print(f"DEBUG: Found {len(companies_list)} companies in DB: {[f'{c.id}:{c.company_name}' for c in companies_list]}")
        
        results = []
        for c in companies_list:
            try:
                results.append(to_company_out(db, c, for_user_id=allowed_user_ids))
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
    user: User = Depends(require_any_permission("companies.manage", "leads.assign", "leads.my", "leads.followup")),
):
    company = get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    from app.deps import user_permission_codes
    user_perms = user_permission_codes(user)
    has_manage_permission = any(p in user_perms for p in ["companies.manage", "leads.assign"])
    
    if not has_manage_permission:
        from app.models import LeadManage
        assignment = db.query(LeadManage).filter(LeadManage.company_id == company_id).first()
        current_assignee = assignment.assigned_to_id if assignment else None
        
        child_ids = [row.id for row in db.query(User.id).filter(User.parent_id == user.id).all()]
        allowed_user_ids = [user.id] + child_ids
        
        if current_assignee not in allowed_user_ids:
            raise HTTPException(status_code=403, detail="You are not authorized to assign this lead.")

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


@router.post("/bulk-delete")
def bulk_delete_companies(
    payload: list[int],
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("companies.manage")),
):
    deleted_count = 0
    for company_id in payload:
        company = get_company(db, company_id)
        if company:
            delete_company(db, company)
            deleted_count += 1
    return {"ok": True, "deleted_count": deleted_count}

