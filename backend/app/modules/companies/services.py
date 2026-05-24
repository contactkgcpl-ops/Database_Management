import re
from sqlalchemy import or_, text, inspect
from sqlalchemy.orm import Session, joinedload

from app.models import Company, CompanyPropertyValue, Property, User, LeadManage
from app.schemas import CompanyCreate, CompanyOut, CompanyUpdate
from app.db import engine

class CompanyValidationError(ValueError):
    pass

def company_query(db: Session):
    return db.query(Company).options(
        joinedload(Company.property_values).joinedload(CompanyPropertyValue.property),
        joinedload(Company.creator),
        joinedload(Company.lead_assignments).joinedload(LeadManage.assigned_to),
        joinedload(Company.lead_assignments).joinedload(LeadManage.assigned_by),
    )

def list_companies(db: Session, q: str | None = None) -> list[Company]:
    from app.models import LeadManage
    query = company_query(db).outerjoin(LeadManage, Company.id == LeadManage.company_id).filter(
        or_(LeadManage.is_inquiry.is_(False), LeadManage.is_inquiry.is_(None))
    ).order_by(Company.id.desc())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Company.company_name.ilike(term))
    return query.limit(500).all()

def get_company(db: Session, company_id: int) -> Company | None:
    return company_query(db).filter(Company.id == company_id).first()

def validate_unique_properties(db: Session, payload: CompanyCreate | CompanyUpdate, exclude_company_id: int | None = None) -> None:
    unique_props = db.query(Property).filter(Property.is_unique == True, Property.is_active == True).all()
    
    # Check company_name uniqueness
    query = db.query(Company.id).filter(Company.company_name == payload.company_name)
    if exclude_company_id: query = query.filter(Company.id != exclude_company_id)
    if db.query(query.exists()).scalar():
        raise CompanyValidationError("Company name already exists")

    # Check other unique properties
    for prop in unique_props:
        target_obj = next((pv for pv in payload.property_values if pv.property_id == prop.id), None)
        if not target_obj or not target_obj.value: continue
        
        target_val = target_obj.value.strip()
        if not target_val: continue
        
        if not prop.is_multi_value:
            # Single value column check
            query = db.query(Company.id).filter(text(f"{prop.field_key} = :val")).params(val=target_val)
            if exclude_company_id: query = query.filter(Company.id != exclude_company_id)
            if db.query(query.exists()).scalar():
                raise CompanyValidationError(f"{prop.name} '{target_val}' already exists")
        else:
            # Multi-value table check: must split and check each part
            vals = [v.strip() for v in target_val.split(",") if v.strip()]
            for v in vals:
                query = db.query(CompanyPropertyValue.id).filter(CompanyPropertyValue.property_id == prop.id, CompanyPropertyValue.value == v)
                if exclude_company_id: query = query.filter(CompanyPropertyValue.company_id != exclude_company_id)
                if db.query(query.exists()).scalar():
                    raise CompanyValidationError(f"{prop.name} '{v}' already exists in another company")

def apply_company_payload(db: Session, company: Company, payload: CompanyCreate | CompanyUpdate) -> dict:
    company.company_name = payload.company_name
    company.property_values = []
    
    dynamic_data = {}
    lead_dynamic_data = {}
    
    for pv in payload.property_values:
        prop = db.query(Property).get(pv.property_id)
        if not prop: continue
        
        if prop.entity_type == "lead":
            lead_dynamic_data[prop.field_key] = pv.value.strip()
            continue

        if prop.is_multi_value:
            for sub_val in pv.value.split(","):
                s = sub_val.strip()
                if s:
                    company.property_values.append(CompanyPropertyValue(property_id=prop.id, value=s))
        else:
            dynamic_data[prop.field_key] = pv.value.strip()
    return dynamic_data, lead_dynamic_data

def create_company(db: Session, payload: CompanyCreate, user: User) -> Company:
    validate_unique_properties(db, payload)
    company = Company(created_by=user.id)
    dynamic_data, lead_dynamic_data = apply_company_payload(db, company, payload)
    db.add(company)
    db.commit()
    
    if dynamic_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in dynamic_data.keys()])
        db.execute(text(f"UPDATE companies SET {set_clause} WHERE id = :id"), {"id": company.id, **dynamic_data})
        db.commit()

    if lead_dynamic_data:
        # Leads added as company might need an initial assignment if they have lead properties
        assign_company(db, company, user.id, user.id, lead_dynamic_data)
        
    db.refresh(company)
    return get_company(db, company.id) or company

def update_company(db: Session, company: Company, payload: CompanyUpdate) -> Company:
    validate_unique_properties(db, payload, exclude_company_id=company.id)
    dynamic_data, lead_dynamic_data = apply_company_payload(db, company, payload)
    
    if payload.assigned_to is not None or lead_dynamic_data:
        assign_company(db, company, payload.assigned_to, None, lead_dynamic_data)

    db.commit()
    
    if dynamic_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in dynamic_data.keys()])
        db.execute(text(f"UPDATE companies SET {set_clause} WHERE id = :id"), {"id": company.id, **dynamic_data})
        db.commit()
        
    db.refresh(company)
    return get_company(db, company.id) or company

def assign_company(db: Session, company: Company, user_id: int | None, assigned_by_id: int | None = None, lead_data: dict | None = None) -> Company:
    assignment = db.query(LeadManage).filter(LeadManage.company_id == company.id).first()
    old_assigned_to = assignment.assigned_to_id if assignment else None
    
    if not assignment:
        assignment = LeadManage(company_id=company.id)
        db.add(assignment)
    
    if assignment.assigned_to_id != user_id:
        assignment.assigned_to_id = user_id
        if assigned_by_id:
            assignment.assigned_by_id = assigned_by_id
        
        # Add history for assignment change
        old_user_name = ""
        if old_assigned_to:
            from app.models import User
            old_u = db.query(User).get(old_assigned_to)
            if old_u:
                old_user_name = old_u.name
                
        new_user_name = ""
        if user_id:
            from app.models import User
            new_u = db.query(User).get(user_id)
            if new_u:
                new_user_name = new_u.name
                
        from app.models import LeadHistory
        history = LeadHistory(
            company_id=company.id,
            property_key="assigned_to",
            property_name="Assigned To",
            old_value=old_user_name,
            new_value=new_user_name,
            user_id=assigned_by_id
        )
        db.add(history)
    
    db.commit()

    if lead_data:
        set_clause = ", ".join([f"{k} = :{k}" for k in lead_data.keys()])
        db.execute(text(f"UPDATE lead_manage SET {set_clause} WHERE id = :id"), {"id": assignment.id, **lead_data})
        db.commit()

    db.refresh(company)
    return company

def delete_company(db: Session, company: Company) -> None:
    db.delete(company)
    db.commit()

def to_company_out(db: Session, company: Company, for_user_id: int | None = None) -> CompanyOut:
    core_cols = {"id", "company_name", "created_at", "updated_at", "created_by", "assigned_to"}
    
    # Fetch actual row from DB to get dynamic columns not in SQLAlchemy model
    raw_row = db.execute(text("SELECT * FROM companies WHERE id = :id"), {"id": company.id}).mappings().first()
    
    # Group multi-value property rows
    pv_map = {}
    for val in company.property_values:
        pid = val.property_id
        if pid not in pv_map:
            pv_map[pid] = {
                "id": val.id,
                "property_id": val.property_id,
                "value": val.value,
                "property_name": val.property.name if val.property else None,
                "field_key": val.property.field_key if val.property else None,
            }
        else:
            pv_map[pid]["value"] += f",{val.value}"
    
    property_values = list(pv_map.values())
    
    if raw_row:
        # Pre-fetch property IDs for dynamic columns to help frontend mapping
        prop_id_map = {p.field_key: p.id for p in db.query(Property.id, Property.field_key).filter(Property.is_active == True, Property.entity_type == "company").all()}
        
        for key, val in raw_row.items():
            if key not in core_cols and val is not None:
                if not any(pv["field_key"] == key for pv in property_values):
                    property_values.append({
                        "id": 0,
                        "property_id": prop_id_map.get(key, 0),
                        "value": str(val),
                        "property_name": key.replace("_", " ").title(),
                        "field_key": key,
                    })

    # Get latest assignment info
    assignment = None
    if for_user_id:
        assignment = next((a for a in company.lead_assignments if a.assigned_to_id == for_user_id), None)
    
    if not assignment:
        assignment = company.lead_assignments[0] if company.lead_assignments else None
    assigned_to = assignment.assigned_to_id if assignment else None
    assigned_user_name = assignment.assigned_to.name if assignment and assignment.assigned_to else None
    assigned_by = assignment.assigned_by_id if assignment else None
    assigned_by_name = assignment.assigned_by.name if assignment and assignment.assigned_by else None

    is_inquiry = assignment.is_inquiry if assignment else False

    # Fetch dynamic columns from lead_manage if exists
    if assignment:
        raw_lead_row = db.execute(text("SELECT * FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
        if raw_lead_row:
            lead_prop_id_map = {p.field_key: p.id for p in db.query(Property.id, Property.field_key).filter(Property.is_active == True, Property.entity_type == "lead").all()}
            lead_core_cols = {"id", "company_id", "assigned_to_id", "assigned_by_id"}
            
            for key, val in raw_lead_row.items():
                if key not in lead_core_cols and val is not None:
                    if not any(pv["field_key"] == key for pv in property_values):
                        property_values.append({
                            "id": 0,
                            "property_id": lead_prop_id_map.get(key, 0),
                            "value": str(val),
                            "property_name": key.replace("_", " ").title(),
                            "field_key": key,
                        })

    # Aggregate connected_source from history dynamically
    conn_src_pv = next((pv for pv in property_values if pv["field_key"] == "connected_source"), None)
    
    from app.models import LeadHistory
    history_connected_sources = db.query(LeadHistory.old_value, LeadHistory.new_value).filter(
        LeadHistory.company_id == company.id,
        LeadHistory.property_key == "connected_source"
    ).all()
    
    unique_vals = set()
    if conn_src_pv and conn_src_pv["value"]:
        for v in conn_src_pv["value"].split(","):
            s = v.strip()
            if s: unique_vals.add(s)
            
    for old_val, new_val in history_connected_sources:
        if old_val:
            for v in old_val.split(","):
                s = v.strip()
                if s: unique_vals.add(s)
        if new_val:
            for v in new_val.split(","):
                s = v.strip()
                if s: unique_vals.add(s)
                
    aggregated_val = ",".join(sorted(list(unique_vals)))
    if aggregated_val:
        if conn_src_pv:
            conn_src_pv["value"] = aggregated_val
        else:
            lead_prop_id_map = {p.field_key: p.id for p in db.query(Property.id, Property.field_key).filter(Property.is_active == True, Property.entity_type == "lead").all()}
            property_values.append({
                "id": 0,
                "property_id": lead_prop_id_map.get("connected_source", 0),
                "value": aggregated_val,
                "property_name": "Connected Source",
                "field_key": "connected_source",
            })

    history_keys = [r[0] for r in db.query(LeadHistory.property_key).filter(LeadHistory.company_id == company.id).distinct().all()]

    return CompanyOut.model_validate(company).model_copy(
        update={
            "created_by_name": company.creator.name if company.creator else None,
            "assigned_to": assigned_to,
            "assigned_user_name": assigned_user_name,
            "assigned_by": assigned_by,
            "assigned_by_name": assigned_by_name,
            "property_values": property_values,
            "history_keys": history_keys,
            "is_inquiry": is_inquiry,
        }
    )

from app.schemas import InlinePropertyUpdate
from app.models import LeadHistory

def update_property_inline(db: Session, company_id: int, payload: InlinePropertyUpdate, user: User) -> Company:
    company = db.query(Company).options(joinedload(Company.property_values)).filter(Company.id == company_id).first()
    if not company:
        raise ValueError("Company not found")
        
    prop = db.query(Property).get(payload.property_id)
    if not prop:
        raise ValueError("Property not found")
        
    old_value = None
    
    if prop.entity_type == "lead":
        assignment = db.query(LeadManage).filter(LeadManage.company_id == company.id).first()
        if not assignment:
            assignment = LeadManage(company_id=company.id, assigned_to_id=user.id, assigned_by_id=user.id)
            db.add(assignment)
            db.commit()
            db.refresh(assignment)
            
        raw_row = db.execute(text("SELECT * FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
        old_value = str(raw_row.get(prop.field_key)) if raw_row and raw_row.get(prop.field_key) is not None else ""
    elif prop.is_multi_value:
        old_vals = [pv.value for pv in company.property_values if pv.property_id == prop.id]
        old_value = ",".join(old_vals)
    else:
        raw_row = db.execute(text("SELECT * FROM companies WHERE id = :id"), {"id": company.id}).mappings().first()
        old_value = str(raw_row.get(prop.field_key)) if raw_row and raw_row.get(prop.field_key) is not None else ""
        
    new_val = payload.value.strip()
    
    if prop.entity_type == "lead":
        db.execute(text(f"UPDATE lead_manage SET {prop.field_key} = :val WHERE company_id = :cid"), {"val": new_val, "cid": company.id})
    elif prop.is_multi_value:
        db.execute(text("DELETE FROM company_property_values WHERE company_id = :cid AND property_id = :pid"), {"cid": company.id, "pid": prop.id})
        for sub_val in new_val.split(","):
            s = sub_val.strip()
            if s:
                db.add(CompanyPropertyValue(company_id=company.id, property_id=prop.id, value=s))
    else:
        db.execute(text(f"UPDATE companies SET {prop.field_key} = :val WHERE id = :cid"), {"val": new_val, "cid": company.id})
        
    # Handle follow up date if provided
    if payload.follow_up_date is not None:
        db.execute(text("UPDATE lead_manage SET follow_up_reminder_date = :fdate WHERE company_id = :cid"), {"fdate": payload.follow_up_date, "cid": company.id})
        
        from datetime import datetime
        from app.models import LeadFollowUp
        try:
            dt = datetime.strptime(payload.follow_up_date, "%Y-%m-%d")
        except ValueError:
            try:
                dt = datetime.fromisoformat(payload.follow_up_date)
            except ValueError:
                dt = None
                
        if dt:
            followup = LeadFollowUp(
                company_id=company.id,
                assigned_to_id=user.id,
                scheduled_date=dt,
                status="Pending",
                remark=payload.remark
            )
            db.add(followup)
    if str(old_value) != str(new_val) or payload.remark:
        history = LeadHistory(
            company_id=company.id,
            property_key=prop.field_key,
            property_name=prop.name,
            old_value=str(old_value) if old_value else "",
            new_value=str(new_val),
            remark=payload.remark,
            user_id=user.id
        )
        db.add(history)
        
    db.commit()
    return get_company(db, company.id)

def get_lead_history(db: Session, company_id: int) -> list[LeadHistory]:
    return db.query(LeadHistory).options(joinedload(LeadHistory.user)).filter(LeadHistory.company_id == company_id).order_by(LeadHistory.created_at.desc()).all()
