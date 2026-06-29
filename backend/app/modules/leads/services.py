from sqlalchemy import text, or_
from sqlalchemy.orm import Session
from app.models import Company, LeadManage, Property, User, CompanyPropertyValue
from app.modules.companies.services import to_company_out, company_query

def list_leads(db: Session, q: str | None = None, assigned_to: int | list[int] | None = None) -> list[Company]:
    query = db.query(Company).join(LeadManage)
    if assigned_to is not None:
        if isinstance(assigned_to, list):
            or_conds = [LeadManage.assigned_to_id.in_(assigned_to)]
            for uid in assigned_to:
                uid_str = str(uid)
                or_conds.append(LeadManage.assigned_to_ids == uid_str)
                or_conds.append(LeadManage.assigned_to_ids.like(f"{uid_str},%"))
                or_conds.append(LeadManage.assigned_to_ids.like(f"%,{uid_str}"))
                or_conds.append(LeadManage.assigned_to_ids.like(f"%,{uid_str},%"))
            query = query.filter(or_(*or_conds))
        else:
            uid_str = str(assigned_to)
            query = query.filter(
                or_(
                    LeadManage.assigned_to_id == assigned_to,
                    LeadManage.assigned_to_ids == uid_str,
                    LeadManage.assigned_to_ids.like(f"{uid_str},%"),
                    LeadManage.assigned_to_ids.like(f"%,{uid_str}"),
                    LeadManage.assigned_to_ids.like(f"%,{uid_str},%")
                )
            )
            
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Company.company_name.ilike(term))
    
    companies = query.order_by(Company.id.desc()).all()
    # We need to make sure to_company_out uses the CORRECT assignment for this user
    return companies

def create_lead(db: Session, company_name: str, property_values: list, user: User, assigned_to: int | None = None) -> Company:
    # 1. Create Company
    company = Company(company_name=company_name, created_by=user.id)
    db.add(company)
    db.commit()
    db.refresh(company)
    
    # 2. Create LeadManage (Assignment)
    target_assignee = assigned_to or user.id
    assignment = LeadManage(
        company_id=company.id,
        assigned_to_id=target_assignee,
        assigned_by_id=user.id
    )
    
    lead_dynamic_data = {}
    lead_props = {p.id: p.field_key for p in db.query(Property).filter(Property.entity_type == "lead").all()}
    
    for pv in property_values:
        prop_id = pv["property_id"]
        if prop_id in lead_props:
            lead_dynamic_data[lead_props[prop_id]] = str(pv["value"]).strip()
            
    db.add(assignment)
    db.commit()
    
    if lead_dynamic_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in lead_dynamic_data.keys()])
        db.execute(text(f"UPDATE lead_manage SET {set_clause} WHERE id = :id"), {"id": assignment.id, **lead_dynamic_data})
        db.commit()
        
    db.refresh(company)
    return company

def create_inquiry(db: Session, payload: dict, user: User) -> Company:
    from app.modules.inquiries.schemas import InquiryCreate
    from app.modules.inquiries.services import create_inquiry as create_inquiry_record

    return create_inquiry_record(db, InquiryCreate(**payload), user)

    # 1. Generate unique Inquiry No
    import re
    highest = db.query(LeadManage.inquiry_no).filter(LeadManage.inquiry_no.like("INQ-2026-%")).order_by(LeadManage.inquiry_no.desc()).first()
    next_num = 1
    if highest and highest[0]:
        match = re.search(r"INQ-2026-(\d+)", highest[0])
        if match:
            next_num = int(match.group(1)) + 1
    inquiry_no = f"INQ-2026-{next_num:06d}"

    # 2. Create Company
    company = Company(company_name=payload["company_name"], created_by=user.id)
    db.add(company)
    db.commit()
    db.refresh(company)

    # 3. Create LeadManage
    assigned_to_id = payload.get("assigned_to")
    if assigned_to_id:
        assigned_to_id = int(assigned_to_id)
    else:
        assigned_to_id = user.id
        
    assignment = LeadManage(
        company_id=company.id,
        assigned_to_id=assigned_to_id,
        assigned_by_id=user.id,
        is_inquiry=True,
        inquiry_no=inquiry_no,
        status="new"
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    # 4. Save lead properties and company properties
    properties = db.query(Property).filter(Property.is_active == True).all()

    company_data = {}
    lead_data = {
        "is_inquiry": True,
        "inquiry_no": inquiry_no,
        "status": "new"
    }

    for pv in payload.get("property_values", []):
        prop_id = pv.get("property_id")
        val = str(pv.get("value") or "").strip()
        if not val:
            continue
        
        prop = next((p for p in properties if p.id == prop_id), None)
        if not prop:
            continue
            
        if prop.entity_type == "lead":
            lead_data[prop.field_key] = val
        else:
            if prop.is_multi_value:
                for sub_val in val.split(","):
                    s = sub_val.strip()
                    if s:
                        db.add(CompanyPropertyValue(company_id=company.id, property_id=prop.id, value=s))
            else:
                company_data[prop.field_key] = val

    db.commit()

    if company_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in company_data.keys()])
        db.execute(text(f"UPDATE companies SET {set_clause} WHERE id = :id"), {"id": company.id, **company_data})
        db.commit()

    if lead_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in lead_data.keys()])
        db.execute(text(f"UPDATE lead_manage SET {set_clause} WHERE id = :id"), {"id": assignment.id, **lead_data})
        db.commit()

    db.refresh(company)
    return company
