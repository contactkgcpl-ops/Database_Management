from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models import Company, LeadManage, Property, User
from app.modules.companies.services import to_company_out, company_query

def list_leads(db: Session, q: str | None = None, assigned_to: int | None = None) -> list[Company]:
    query = db.query(Company).join(LeadManage).filter(LeadManage.assigned_to_id == assigned_to)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Company.company_name.ilike(term))
    
    companies = query.order_by(Company.id.desc()).limit(500).all()
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
