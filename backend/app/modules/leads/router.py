
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import require_permission, require_any_permission
from app.models import CompanyPropertyValue, LeadManage, Property, User
from app.modules.leads.services import list_leads, create_lead
from app.modules.companies.services import to_company_out
from app.schemas import CompanyOut, LeadFollowUpOut
from app.models import LeadFollowUp
from datetime import datetime

router = APIRouter(prefix="/leads", tags=["leads"])


def followup_to_out(db: Session, followup: LeadFollowUp) -> dict:
    contact_property = db.query(Property).filter(Property.field_key == "contact_number").first()
    contact_number = None
    if contact_property:
        values = (
            db.query(CompanyPropertyValue.value)
            .filter(
                CompanyPropertyValue.company_id == followup.company_id,
                CompanyPropertyValue.property_id == contact_property.id,
            )
            .all()
        )
        contact_number = ", ".join(value for (value,) in values) or None

    lead_row = (
        db.query(LeadManage)
        .filter(LeadManage.company_id == followup.company_id)
        .first()
    )

    return {
        "id": followup.id,
        "company_id": followup.company_id,
        "company_name": followup.company.company_name if followup.company else None,
        "contact_number": contact_number,
        "lead_status": lead_row.status if lead_row else None,
        "assigned_to_id": followup.assigned_to_id,
        "scheduled_date": followup.scheduled_date,
        "actual_date": followup.actual_date,
        "status": followup.status,
        "remark": followup.remark,
        "created_at": followup.created_at,
    }

@router.get("/my", response_model=list[CompanyOut])
def get_my_leads(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my")),
):
    companies = list_leads(db, q, assigned_to=user.id)
    return [to_company_out(db, company, for_user_id=user.id) for company in companies]

@router.post("", response_model=CompanyOut)
def create_new_lead(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.add")),
):
    if "company_name" not in payload:
        raise HTTPException(status_code=422, detail="company_name is required")
        
    company = create_lead(
        db, 
        company_name=payload["company_name"], 
        property_values=payload.get("property_values", []),
        user=user
    )
    return to_company_out(db, company, for_user_id=user.id)

@router.get("/followups/my-pending", response_model=list[LeadFollowUpOut])
def get_my_pending_followups(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my")),
):
    followups = db.query(LeadFollowUp).filter(
        LeadFollowUp.assigned_to_id == user.id,
        LeadFollowUp.status == "Pending"
    ).order_by(LeadFollowUp.scheduled_date.asc()).all()
    return [followup_to_out(db, followup) for followup in followups]

@router.put("/followups/{followup_id}/complete", response_model=LeadFollowUpOut)
def complete_followup(
    followup_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.my")),
):
    followup = db.query(LeadFollowUp).filter(LeadFollowUp.id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
        
    followup.status = "Completed"
    followup.actual_date = datetime.now()
    if "remark" in payload:
        followup.remark = payload["remark"]
        
    db.commit()
    db.refresh(followup)
    return followup_to_out(db, followup)
