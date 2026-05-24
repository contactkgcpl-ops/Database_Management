
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import require_permission, require_any_permission
from app.models import CompanyPropertyValue, LeadManage, Property, User
from app.modules.leads.services import list_leads, create_lead, create_inquiry
from app.modules.inquiries.services import next_inquiry_no
from app.modules.companies.services import to_company_out
from app.schemas import CompanyOut, LeadFollowUpOut, LeadConvertIn
from app.models import LeadFollowUp, LeadHistory, Company
from datetime import datetime

router = APIRouter(prefix="/leads", tags=["leads"])


def parse_followup_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD")


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
    assigned_user = db.query(User).filter(User.id == followup.assigned_to_id).first() if followup.assigned_to_id else None

    return {
        "id": followup.id,
        "company_id": followup.company_id,
        "company_name": followup.company.company_name if followup.company else None,
        "contact_number": contact_number,
        "lead_status": lead_row.status if lead_row else None,
        "assigned_to_id": followup.assigned_to_id,
        "assigned_to_name": assigned_user.name if assigned_user else None,
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
    user: User = Depends(require_any_permission("companies.view", "leads.my", "leads.followup")),
):
    followups = db.query(LeadFollowUp).join(
        LeadManage, LeadFollowUp.company_id == LeadManage.company_id
    ).filter(
        LeadFollowUp.assigned_to_id == user.id,
        LeadFollowUp.status.in_(["Pending", "Re Follow Up"]),
        LeadManage.is_inquiry.isnot(True)
    ).order_by(LeadFollowUp.scheduled_date.asc()).all()
    return [followup_to_out(db, followup) for followup in followups]

@router.put("/followups/{followup_id}/complete", response_model=LeadFollowUpOut)
def complete_followup(
    followup_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.my", "leads.followup")),
):
    followup = db.query(LeadFollowUp).filter(LeadFollowUp.id == followup_id).first()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
        
    next_date = parse_followup_date(payload.get("next_follow_up_date"))
    lead_status = (payload.get("lead_status") or "").strip()
    normalized_status = lead_status.lower().replace("-", "_").replace(" ", "_")
    is_re_follow_up = bool(next_date) or "follow_up" in normalized_status or "refollow" in normalized_status

    followup.status = "Re Follow Up" if is_re_follow_up else "Completed"
    followup.actual_date = datetime.now()
    if "remark" in payload:
        followup.remark = payload["remark"]

    assignment = db.query(LeadManage).filter(LeadManage.company_id == followup.company_id).first()
    if not assignment:
        assignment = LeadManage(
            company_id=followup.company_id,
            assigned_to_id=followup.assigned_to_id or user.id,
            assigned_by_id=user.id,
        )
        db.add(assignment)
        db.flush()

    assignee_id = followup.assigned_to_id or assignment.assigned_to_id or user.id
    requested_assignee_id = payload.get("assigned_to_id")
    if requested_assignee_id:
        requested_assignee_id = int(requested_assignee_id)
        if assignment.assigned_to_id != requested_assignee_id:
            old_user = db.query(User).filter(User.id == assignment.assigned_to_id).first() if assignment.assigned_to_id else None
            new_user = db.query(User).filter(User.id == requested_assignee_id).first()
            assignment.assigned_to_id = requested_assignee_id
            assignment.assigned_by_id = user.id
            assignee_id = requested_assignee_id
            db.add(LeadHistory(
                company_id=followup.company_id,
                property_key="assigned_to",
                property_name="Assigned To",
                old_value=old_user.name if old_user else "",
                new_value=new_user.name if new_user else "",
                remark=payload.get("remark"),
                user_id=user.id,
            ))

    if lead_status and assignment.status != lead_status:
        old_status = assignment.status or ""
        assignment.status = lead_status
        db.add(LeadHistory(
            company_id=followup.company_id,
            property_key="status",
            property_name="Status",
            old_value=old_status,
            new_value=lead_status,
            remark=payload.get("remark"),
            user_id=user.id,
        ))

    if next_date:
        assignment.follow_up_reminder_date = next_date
        db.add(LeadFollowUp(
            company_id=followup.company_id,
            assigned_to_id=assignee_id,
            scheduled_date=next_date,
            status="Pending",
            remark=payload.get("remark"),
        ))

    db.commit()
    db.refresh(followup)
    return followup_to_out(db, followup)

@router.get("/inquiries", response_model=list[CompanyOut])
def get_inquiries(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my")),
):
    query = db.query(Company).join(LeadManage, Company.id == LeadManage.company_id).filter(LeadManage.is_inquiry == True)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Company.company_name.ilike(term))
    companies = query.all()
    return [to_company_out(db, company, for_user_id=user.id) for company in companies]


@router.post("/inquiries", response_model=CompanyOut)
def add_new_inquiry(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.add")),
):
    if "company_name" not in payload:
        raise HTTPException(status_code=422, detail="company_name is required")
    company = create_inquiry(db, payload, user)
    return to_company_out(db, company, for_user_id=user.id)

@router.post("/{company_id}/convert", response_model=CompanyOut)
def convert_lead_to_inquiry(
    company_id: int,
    payload: LeadConvertIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.manage", "leads.my")),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    assignment = db.query(LeadManage).filter(LeadManage.company_id == company_id).first()
    if not assignment:
        assignment = LeadManage(company_id=company_id, assigned_to_id=user.id, assigned_by_id=user.id)
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
    old_status = assignment.status or ""
    assignment.is_inquiry = True
    assignment.status = "follow_up"
    raw_inquiry = db.execute(text("SELECT inquiry_no FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
    if not raw_inquiry or not raw_inquiry.get("inquiry_no"):
        db.execute(text("UPDATE lead_manage SET inquiry_no = :inquiry_no WHERE id = :id"), {"inquiry_no": next_inquiry_no(db), "id": assignment.id})
    
    if payload.requirement is not None:
        db.execute(text("UPDATE lead_manage SET requirement = :req WHERE id = :id"), {"req": payload.requirement, "id": assignment.id})
    
    try:
        dt = datetime.strptime(payload.follow_up_date, "%Y-%m-%d")
    except ValueError:
        try:
            dt = datetime.fromisoformat(payload.follow_up_date)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD")
            
    followup = LeadFollowUp(
        company_id=company_id,
        assigned_to_id=assignment.assigned_to_id or user.id,
        scheduled_date=dt,
        status="Pending",
        remark=payload.remark
    )
    db.add(followup)
    
    db.add(LeadHistory(
        company_id=company_id,
        property_key="status",
        property_name="Cold Leads Status",
        old_value=old_status,
        new_value="converted",
        remark=payload.remark,
        user_id=user.id
    ))
    db.add(LeadHistory(
        company_id=company_id,
        property_key="status",
        property_name="Inquiry Status",
        old_value="",
        new_value="follow_up",
        remark=payload.remark,
        user_id=user.id
    ))
    
    db.commit()
    db.refresh(company)
    return to_company_out(db, company, for_user_id=user.id)


@router.get("/companies/{company_id}/followups", response_model=list[LeadFollowUpOut])
def get_company_followups(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("companies.view", "leads.my", "leads.followup")),
):
    followups = db.query(LeadFollowUp).filter(
        LeadFollowUp.company_id == company_id
    ).order_by(LeadFollowUp.scheduled_date.desc()).all()
    return [followup_to_out(db, followup) for followup in followups]
