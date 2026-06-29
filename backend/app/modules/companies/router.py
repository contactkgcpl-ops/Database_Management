import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, text
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
    import_upsert_company,
    list_company_filter_options,
)
from app.schemas import CompanyCreate, CompanyOut, CompanyUpdate, CompanyImportUpsert, PaginatedCompaniesOut

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=PaginatedCompaniesOut)
def list_company_records(
    page: int = 1,
    page_size: int = 25,
    q: str | None = None,
    sort_key: str | None = None,
    sort_dir: str | None = None,
    filters: str | None = None,
    for_assign_leads: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("companies.view")),
):
    parsed_filters = None
    if filters:
        try:
            parsed_filters = json.loads(filters)
        except Exception:
            pass

    companies, total_count = list_companies(
        db,
        page=page,
        page_size=page_size,
        q=q,
        sort_key=sort_key,
        sort_dir=sort_dir,
        filters=parsed_filters,
        current_user=user,
        for_assign_leads=for_assign_leads,
    )
    return {
        "companies": [to_company_out(db, company) for company in companies],
        "total": total_count,
        "filter_options": list_company_filter_options(db),
    }


@router.get("/states-and-cities")
def get_states_and_cities(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("companies.view")),
):
    from pathlib import Path
    json_path = Path(__file__).parent.parent.parent / "core" / "states-and-districts.json"
    if json_path.exists():
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"states": []}


@router.get("/my", response_model=list[CompanyOut])
def list_my_leads(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my")),
):
    from app.models import LeadManage
    import traceback
    try:
        # Get recursive subordinate IDs
        sub_ids = []
        queue = [user.id]
        visited = set()
        while queue:
            curr = queue.pop(0)
            if curr in visited:
                continue
            visited.add(curr)
            children = db.query(User.id).filter(User.parent_id == curr).all()
            for r in children:
                sub_ids.append(r.id)
                queue.append(r.id)
        
        allowed_user_ids = [user.id] + sub_ids

        query = db.query(Company).join(LeadManage, Company.id == LeadManage.company_id).filter(
            LeadManage.is_inquiry != True
        )
        
        or_conds = [LeadManage.assigned_to_id.in_(allowed_user_ids)]
        for uid in allowed_user_ids:
            uid_str = str(uid)
            or_conds.append(LeadManage.assigned_to_ids == uid_str)
            or_conds.append(LeadManage.assigned_to_ids.like(f"{uid_str},%"))
            or_conds.append(LeadManage.assigned_to_ids.like(f"%,{uid_str}"))
            or_conds.append(LeadManage.assigned_to_ids.like(f"%,{uid_str},%"))
        query = query.filter(or_(*or_conds))
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
    assigned_to_ids: str | None = None,   # comma-separated list of extra user IDs
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
    
    # If multi-select IDs were provided, update assigned_to_ids directly
    if assigned_to_ids is not None:
        from app.models import LeadManage
        lm = db.query(LeadManage).filter(LeadManage.company_id == company_id).first()
        if lm:
            lm.assigned_to_ids = assigned_to_ids
            db.commit()
    
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
    ret = []
    for h in history:
        old_val = h.old_value
        new_val = h.new_value
        if h.property_key == "company":
            from app.modules.companies.services import get_user_names_by_ids
            old_val = get_user_names_by_ids(db, h.old_value)
            new_val = get_user_names_by_ids(db, h.new_value)
        elif h.property_key == "assigned_to":
            from app.modules.companies.services import get_user_names_by_ids
            if h.old_value and h.old_value.strip().isdigit():
                old_val = get_user_names_by_ids(db, h.old_value)
            if h.new_value and h.new_value.strip().isdigit():
                new_val = get_user_names_by_ids(db, h.new_value)

        ret.append({
            "id": h.id,
            "company_id": h.company_id,
            "property_key": h.property_key,
            "property_name": h.property_name,
            "old_value": old_val,
            "new_value": new_val,
            "remark": h.remark,
            "user_id": h.user_id,
            "created_at": h.created_at,
            "updated_at": h.updated_at,
            "user_name": h.user.name if h.user else None
        })
    return ret


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


@router.post("/import-upsert", response_model=CompanyOut)
def import_upsert_company_endpoint(
    payload: CompanyImportUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("companies.manage")),
):
    try:
        company = import_upsert_company(db, payload, user)
        return to_company_out(db, company)
    except CompanyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


