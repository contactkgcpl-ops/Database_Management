from datetime import datetime
import re

from fastapi import HTTPException
from sqlalchemy import literal_column, or_, text
from sqlalchemy.orm import Session

from app.deps import user_has_all_permissions
from app.models import Company, CompanyPropertyValue, LeadFollowUp, LeadHistory, LeadManage, Property, User
from app.modules.companies.services import get_company, to_company_out


INQUIRY_STAGES = {
    "new",
    "follow_up",
    "quotation_sent",
    "negotiation",
    "converted_to_order",
    "invoice_sent",
    "payment_received",
    "dispatched",
    "completed",
    "lost",
    "not_interested",
}


def parse_optional_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        try:
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Invalid date format. Use YYYY-MM-DD") from exc


def next_inquiry_no(db: Session) -> str:
    year = datetime.now().year
    prefix = f"INQ-{year}-"
    rows = db.execute(
        text("SELECT inquiry_no FROM lead_manage WHERE inquiry_no LIKE :prefix ORDER BY inquiry_no DESC LIMIT 1"),
        {"prefix": f"{prefix}%"},
    ).fetchall()
    next_num = 1
    if rows and rows[0][0]:
        match = re.search(r"(\d+)$", rows[0][0])
        if match:
            next_num = int(match.group(1)) + 1
    return f"{prefix}{next_num:06d}"


def _property_maps(db: Session) -> tuple[dict[int, Property], dict[str, Property]]:
    properties = db.query(Property).filter(Property.is_active.is_(True)).all()
    return {prop.id: prop for prop in properties}, {prop.field_key: prop for prop in properties}


def _set_dynamic_value(db: Session, table: str, key: str, row_key: str, row_id: int, value: str | None) -> None:
    db.execute(text(f"UPDATE {table} SET {key} = :value WHERE {row_key} = :row_id"), {"value": value or "", "row_id": row_id})


def _record_history(
    db: Session,
    company_id: int,
    property_key: str,
    property_name: str,
    old_value: str | None,
    new_value: str | None,
    user_id: int | None,
    remark: str | None = None,
) -> None:
    db.add(
        LeadHistory(
            company_id=company_id,
            property_key=property_key,
            property_name=property_name,
            old_value=old_value or "",
            new_value=new_value or "",
            remark=remark,
            user_id=user_id,
        )
    )


def _create_followup(db: Session, assignment: LeadManage, follow_up_date: str | None, remark: str | None, user: User) -> None:
    scheduled_date = parse_optional_date(follow_up_date)
    if not scheduled_date:
        return
    assignment.follow_up_reminder_date = scheduled_date
    db.add(
        LeadFollowUp(
            company_id=assignment.company_id,
            assigned_to_id=assignment.assigned_to_id or user.id,
            scheduled_date=scheduled_date,
            status="Pending",
            remark=remark,
        )
    )


def _has_full_inquiry_access(user: User) -> bool:
    return user_has_all_permissions(user, "users.manage", "roles.manage")


def _visible_user_ids(db: Session, user: User) -> list[int]:
    child_ids = [row.id for row in db.query(User.id).filter(User.parent_id == user.id).all()]
    return [user.id, *child_ids]


def _inquiry_visible_filter(db: Session, user: User):
    user_ids = _visible_user_ids(db, user)
    return or_(
        LeadManage.assigned_to_id.in_(user_ids),
        LeadManage.assigned_by_id == user.id,
        Company.created_by == user.id,
    )


def _can_access_inquiry(db: Session, company: Company, assignment: LeadManage, user: User) -> bool:
    if _has_full_inquiry_access(user):
        return True
    user_ids = set(_visible_user_ids(db, user))
    return (
        assignment.assigned_to_id in user_ids
        or assignment.assigned_by_id == user.id
        or company.created_by == user.id
    )


def list_inquiries(db: Session, q: str | None, user: User):
    query = db.query(Company).join(LeadManage, Company.id == LeadManage.company_id).filter(LeadManage.is_inquiry.is_(True))
    if not _has_full_inquiry_access(user):
        query = query.filter(_inquiry_visible_filter(db, user))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Company.company_name.ilike(term),
                literal_column("lead_manage.inquiry_no").ilike(term),
                literal_column("lead_manage.contact_person").ilike(term),
                literal_column("lead_manage.requirement").ilike(term),
                literal_column("lead_manage.inquiry_source").ilike(term),
            )
        )
    return [to_company_out(db, company, for_user_id=user.id) for company in query.order_by(Company.id.desc()).all()]


def create_inquiry(db: Session, payload, user: User) -> Company:
    company_name = payload.company_name.strip() if hasattr(payload, "company_name") else str(payload["company_name"]).strip()
    if not company_name:
        raise ValueError("company_name is required")

    assigned_to = getattr(payload, "assigned_to", None) if hasattr(payload, "assigned_to") else payload.get("assigned_to")
    property_values = getattr(payload, "property_values", []) if hasattr(payload, "property_values") else payload.get("property_values", [])
    follow_up_date = getattr(payload, "follow_up_date", None) if hasattr(payload, "follow_up_date") else payload.get("follow_up_date")
    remark = getattr(payload, "remark", None) if hasattr(payload, "remark") else payload.get("remark")

    company = Company(company_name=company_name, created_by=user.id)
    db.add(company)
    db.flush()

    assignment = LeadManage(
        company_id=company.id,
        assigned_to_id=int(assigned_to) if assigned_to else user.id,
        assigned_by_id=user.id,
        is_inquiry=True,
        status="new",
    )
    db.add(assignment)
    db.flush()

    inquiry_no = next_inquiry_no(db)
    _set_dynamic_value(db, "lead_manage", "inquiry_no", "id", assignment.id, inquiry_no)
    _set_dynamic_value(db, "lead_manage", "status", "id", assignment.id, "new")

    props_by_id, props_by_key = _property_maps(db)
    for item in property_values:
        prop_id = item.property_id if hasattr(item, "property_id") else item.get("property_id")
        value = item.value if hasattr(item, "value") else item.get("value")
        prop = props_by_id.get(prop_id)
        if not prop or value in (None, ""):
            continue
        value = str(value).strip()
        if prop.entity_type == "lead":
            _set_dynamic_value(db, "lead_manage", prop.field_key, "id", assignment.id, value)
        elif prop.is_multi_value:
            for sub_value in value.split(","):
                sub_value = sub_value.strip()
                if sub_value:
                    db.add(CompanyPropertyValue(company_id=company.id, property_id=prop.id, value=sub_value))
        else:
            _set_dynamic_value(db, "companies", prop.field_key, "id", company.id, value)

    _record_history(db, company.id, "status", props_by_key.get("status").name if props_by_key.get("status") else "Status", "", "new", user.id, remark)
    _record_history(db, company.id, "inquiry_no", "Inquiry No", "", inquiry_no, user.id)
    _create_followup(db, assignment, follow_up_date, remark, user)

    db.commit()
    db.refresh(company)
    return company


def assign_inquiry(db: Session, company_id: int, user_id: int | None, user: User) -> Company:
    company = get_company(db, company_id)
    if not company:
        raise ValueError("Inquiry not found")
    assignment = db.query(LeadManage).filter(LeadManage.company_id == company_id).first()
    if not assignment or not assignment.is_inquiry:
        raise ValueError("Inquiry not found")
    if not _can_access_inquiry(db, company, assignment, user):
        raise HTTPException(status_code=403, detail="Inquiry is not assigned to you, assigned by you, or assigned to your child user.")
    old_value = str(assignment.assigned_to_id or "")
    assignment.assigned_to_id = user_id
    assignment.assigned_by_id = user.id
    _record_history(db, company_id, "assigned_to", "Assigned To", old_value, str(user_id or ""), user.id, "Inquiry owner changed")
    
    # Update pending follow-ups to the new assignee
    db.query(LeadFollowUp).filter(
        LeadFollowUp.company_id == company_id,
        LeadFollowUp.status.in_(["Pending", "Re Follow Up"])
    ).update({"assigned_to_id": user_id}, synchronize_session=False)
    
    db.commit()
    return get_company(db, company_id)


def update_stage(db: Session, company_id: int, payload, user: User) -> Company:
    status = payload.status.strip()
    if status not in INQUIRY_STAGES:
        raise ValueError("Invalid inquiry stage")

    company = get_company(db, company_id)
    if not company:
        raise ValueError("Inquiry not found")
    assignment = db.query(LeadManage).filter(LeadManage.company_id == company_id).first()
    if not assignment or not assignment.is_inquiry:
        raise ValueError("Inquiry not found")
    if not _can_access_inquiry(db, company, assignment, user):
        raise HTTPException(status_code=403, detail="Inquiry is not assigned to you, assigned by you, or assigned to your child user.")

    props_by_id, props_by_key = _property_maps(db)
    old_status = assignment.status or ""
    assignment.status = status
    _set_dynamic_value(db, "lead_manage", "status", "id", assignment.id, status)
    _record_history(db, company_id, "status", props_by_key.get("status").name if props_by_key.get("status") else "Status", old_status, status, user.id, payload.remark)

    if payload.order_amount not in (None, "") and "order_amount" in props_by_key:
        raw = db.execute(text("SELECT order_amount FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
        old_amount = str(raw.get("order_amount") or "") if raw else ""
        _set_dynamic_value(db, "lead_manage", "order_amount", "id", assignment.id, payload.order_amount)
        _record_history(db, company_id, "order_amount", "Order Amount", old_amount, payload.order_amount, user.id, payload.remark)

    if payload.connected_source is not None and "connected_source" in props_by_key:
        raw = db.execute(text("SELECT connected_source FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
        old_source = str(raw.get("connected_source") or "") if raw else ""
        _set_dynamic_value(db, "lead_manage", "connected_source", "id", assignment.id, payload.connected_source)
        _record_history(db, company_id, "connected_source", "Connected Source", old_source, payload.connected_source, user.id, payload.remark)

    _create_followup(db, assignment, payload.follow_up_date, payload.remark, user)
    db.commit()
    return get_company(db, company_id)
