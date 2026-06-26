import re
from sqlalchemy import or_, and_, text, inspect
from sqlalchemy.orm import Session, joinedload

from app.models import Company, CompanyPropertyValue, Property, User, LeadManage
from app.schemas import CompanyCreate, CompanyOut, CompanyUpdate, CompanyImportUpsert
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

def list_companies(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    q: str | None = None,
    sort_key: str | None = None,
    sort_dir: str | None = None,
    filters: dict | None = None,
) -> tuple[list[Company], int]:
    from app.models import LeadManage, CompanyPropertyValue, Property, User
    from sqlalchemy.orm import aliased
    
    AssignedUser = aliased(User)
    AssignedByUser = aliased(User)
    
    query = company_query(db).outerjoin(LeadManage, Company.id == LeadManage.company_id).filter(
        or_(LeadManage.is_inquiry.is_(False), LeadManage.is_inquiry.is_(None))
    )
    
    query = query.outerjoin(AssignedUser, LeadManage.assigned_to_id == AssignedUser.id)\
                 .outerjoin(AssignedByUser, LeadManage.assigned_by_id == AssignedByUser.id)
    
    # 1. Search Query (q) on company_name
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(Company.company_name.ilike(term))
        
    # 2. Dynamic/Static Column Filters (filters)
    if filters:
        all_props = db.query(Property).filter(Property.is_active == True).all()
        prop_map = {p.field_key: p for p in all_props}
        
        sql_params = {}
        param_counter = 0
        
        for key, val in filters.items():
            # Parse mode and value
            mode = "contains"
            filter_val = val
            if isinstance(val, dict):
                mode = val.get("mode", "contains")
                filter_val = val.get("value", "")

            if mode == "contains":
                if filter_val is None or filter_val == "" or (isinstance(filter_val, list) and len(filter_val) == 0):
                    continue
            elif mode not in ("empty", "not_empty"):
                continue
                
            if key == "company_name":
                if mode == "empty":
                    query = query.filter(or_(Company.company_name.is_(None), Company.company_name == ""))
                elif mode == "not_empty":
                    query = query.filter(and_(Company.company_name.isnot(None), Company.company_name != ""))
                else:
                    query = query.filter(Company.company_name.ilike(f"%{filter_val}%"))
            elif key == "created_by_name":
                if mode == "empty":
                    query = query.filter(Company.creator_id.is_(None))
                elif mode == "not_empty":
                    query = query.filter(Company.creator_id.isnot(None))
                else:
                    query = query.join(Company.creator).filter(User.name.ilike(f"%{filter_val}%"))
            elif key == "assigned_to":
                if isinstance(filter_val, list):
                    or_conds = []
                    for v in filter_val:
                        if v == "Not Assigned":
                            or_conds.append(LeadManage.assigned_to_id.is_(None))
                        else:
                            or_conds.append(AssignedUser.name == v)
                    query = query.filter(or_(*or_conds))
                else:
                    if filter_val == "Not Assigned":
                        query = query.filter(LeadManage.assigned_to_id.is_(None))
                    else:
                        query = query.filter(AssignedUser.name.ilike(f"%{filter_val}%"))
            elif key == "assigned_by_name":
                if isinstance(filter_val, list):
                    or_conds = []
                    for v in filter_val:
                        if v == "System":
                            or_conds.append(LeadManage.assigned_by_id.is_(None))
                        else:
                            or_conds.append(AssignedByUser.name == v)
                    query = query.filter(or_(*or_conds))
                else:
                    if filter_val == "System":
                        query = query.filter(LeadManage.assigned_by_id.is_(None))
                    else:
                        query = query.filter(AssignedByUser.name.ilike(f"%{filter_val}%"))
            elif key in prop_map:
                prop = prop_map[key]
                param_name = f"filter_val_{param_counter}"
                param_counter += 1
                
                if prop.is_multi_value:
                    # Multi-value property (stored in company_property_values)
                    if mode == "empty":
                        query = query.filter(~Company.property_values.any(CompanyPropertyValue.property_id == prop.id))
                    elif mode == "not_empty":
                        query = query.filter(Company.property_values.any(CompanyPropertyValue.property_id == prop.id))
                    elif isinstance(filter_val, list):
                        query = query.filter(
                            Company.property_values.any(
                                and_(
                                    CompanyPropertyValue.property_id == prop.id,
                                    CompanyPropertyValue.value.in_(filter_val)
                                )
                            )
                        )
                    else:
                        query = query.filter(
                            Company.property_values.any(
                                and_(
                                    CompanyPropertyValue.property_id == prop.id,
                                    CompanyPropertyValue.value.ilike(f"%{filter_val}%")
                                )
                            )
                        )
                else:
                    # Single-value property (stored as dynamic column on companies or lead_manage)
                    if prop.entity_type == "company":
                        if mode == "empty":
                            query = query.filter(or_(text(f"companies.{prop.field_key} IS NULL"), text(f"companies.{prop.field_key} = ''")))
                        elif mode == "not_empty":
                            query = query.filter(and_(text(f"companies.{prop.field_key} IS NOT NULL"), text(f"companies.{prop.field_key} != ''")))
                        elif isinstance(filter_val, list):
                            # Multiselect filter
                            placeholders = ", ".join(f":{param_name}_{i}" for i in range(len(filter_val)))
                            query = query.filter(text(f"companies.{prop.field_key} IN ({placeholders})"))
                            for i, v in enumerate(filter_val):
                                sql_params[f"{param_name}_{i}"] = v
                        else:
                            query = query.filter(text(f"LOWER(companies.{prop.field_key}) LIKE :{param_name}"))
                            sql_params[param_name] = f"%{str(filter_val).lower()}%"
                    elif prop.entity_type == "lead":
                        if mode == "empty":
                            query = query.filter(or_(text(f"lead_manage.{prop.field_key} IS NULL"), text(f"lead_manage.{prop.field_key} = ''")))
                        elif mode == "not_empty":
                            query = query.filter(and_(text(f"lead_manage.{prop.field_key} IS NOT NULL"), text(f"lead_manage.{prop.field_key} != ''")))
                        elif isinstance(filter_val, list):
                            placeholders = ", ".join(f":{param_name}_{i}" for i in range(len(filter_val)))
                            query = query.filter(text(f"lead_manage.{prop.field_key} IN ({placeholders})"))
                            for i, v in enumerate(filter_val):
                                sql_params[f"{param_name}_{i}"] = v
                        else:
                            query = query.filter(text(f"LOWER(lead_manage.{prop.field_key}) LIKE :{param_name}"))
                            sql_params[param_name] = f"%{str(filter_val).lower()}%"
                            
        if sql_params:
            query = query.params(**sql_params)

    # 3. Total Count before pagination
    total_count = db.query(query.subquery()).count()
    
    # 4. Sorting
    direction = "ASC"
    if sort_dir and str(sort_dir).lower() == "desc":
        direction = "DESC"
        
    if sort_key:
        if sort_key == "company_name":
            query = query.order_by(Company.company_name.desc() if direction == "DESC" else Company.company_name.asc())
        elif sort_key == "created_by_name":
            query = query.join(Company.creator).order_by(User.name.desc() if direction == "DESC" else User.name.asc())
        elif sort_key == "assigned_to":
            query = query.order_by(AssignedUser.name.desc() if direction == "DESC" else AssignedUser.name.asc())
        elif sort_key == "assigned_by_name":
            query = query.order_by(AssignedByUser.name.desc() if direction == "DESC" else AssignedByUser.name.asc())
        else:
            all_props = db.query(Property).filter(Property.is_active == True).all()
            prop_map = {p.field_key: p for p in all_props}
            if sort_key in prop_map:
                prop = prop_map[sort_key]
                if not prop.is_multi_value:
                    if prop.entity_type == "company":
                        query = query.order_by(text(f"companies.{prop.field_key} {direction}"))
                    elif prop.entity_type == "lead":
                        query = query.order_by(text(f"lead_manage.{prop.field_key} {direction}"))
            else:
                query = query.order_by(Company.id.desc() if direction == "DESC" else Company.id.asc())
    else:
        query = query.order_by(Company.id.desc())
        
    # 5. Pagination (Limit/Offset)
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    return query.all(), total_count


_INDIAN_STATES = None
_INDIAN_CITIES = None


def _load_indian_states_and_cities():
    global _INDIAN_STATES, _INDIAN_CITIES
    if _INDIAN_STATES is not None and _INDIAN_CITIES is not None:
        return _INDIAN_STATES, _INDIAN_CITIES

    _INDIAN_STATES = []
    _INDIAN_CITIES = []
    try:
        import json
        from pathlib import Path
        json_path = Path(__file__).parent.parent.parent / "core" / "states-and-districts.json"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "states" in data:
                    states_set = set()
                    cities_set = set()
                    for s in data["states"]:
                        states_set.add(s["state"].strip())
                        for d in s["districts"]:
                            cities_set.add(d.strip())
                    _INDIAN_STATES = sorted(list(states_set))
                    _INDIAN_CITIES = sorted(list(cities_set))
    except Exception as e:
        print(f"Error loading states and districts JSON: {e}")
    return _INDIAN_STATES, _INDIAN_CITIES


def list_company_filter_options(db: Session, q: str | None = None) -> dict[str, list[str]]:
    companies, _ = list_companies(db, page=1, page_size=100000, q=q)
    options: dict[str, set[str]] = {
        "company_name": set(),
        "created_by_name": set(),
    }

    for company in companies:
        if company.company_name:
            options["company_name"].add(company.company_name)
        if company.creator and company.creator.name:
            options["created_by_name"].add(company.creator.name)

        company_out = to_company_out(db, company)
        for value in company_out.property_values:
            if isinstance(value, dict):
                field_key = value.get("field_key")
                val_str = value.get("value")
            else:
                field_key = getattr(value, "field_key", None)
                val_str = getattr(value, "value", None)

            if not field_key or not val_str:
                continue
            field_options = options.setdefault(field_key, set())
            for item in str(val_str).split(","):
                item = item.strip()
                if item:
                    field_options.add(item)

    # Supplement Indian states and cities for filter dropdown options
    indian_states, indian_cities = _load_indian_states_and_cities()
    if indian_states:
        state_options = options.setdefault("state", set())
        state_options.update(indian_states)
    if indian_cities:
        city_options = options.setdefault("city", set())
        city_options.update(indian_cities)

    return {
        key: sorted(values, key=lambda item: item.lower())
        for key, values in options.items()
    }

def clean_mobile_value(val: str) -> str:
    if not val:
        return ""
    
    cleaned_parts = []
    for part in val.split(","):
        digits = "".join(c for c in part if c.isdigit())
        if not digits:
            continue
        
        # Remove country code prefixes (India/general 91 or 0 prefixes)
        if len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        elif len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 13 and digits.startswith("091"):
            digits = digits[3:]
            
        cleaned_parts.append(digits)
        
    unique_parts = []
    for p in cleaned_parts:
        if p not in unique_parts:
            unique_parts.append(p)
            
    return ",".join(unique_parts)

def clean_payload_mobile_numbers(db: Session, payload) -> None:
    mobile_props = db.query(Property).filter(Property.object_type == "mobile", Property.is_active == True).all()
    mobile_prop_ids = {p.id for p in mobile_props}
    
    if not mobile_prop_ids:
        return
        
    for pv in payload.property_values:
        if pv.property_id in mobile_prop_ids:
            if pv.value:
                pv.value = clean_mobile_value(pv.value)

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
    clean_payload_mobile_numbers(db, payload)
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
    clean_payload_mobile_numbers(db, payload)
    validate_unique_properties(db, payload, exclude_company_id=company.id)
    dynamic_data, lead_dynamic_data = apply_company_payload(db, company, payload)
    
    if "assigned_to" in payload.model_fields_set:
        assigned_to = payload.assigned_to
        should_assign = True
    else:
        assignment = db.query(LeadManage).filter(LeadManage.company_id == company.id).first()
        assigned_to = assignment.assigned_to_id if assignment else None
        should_assign = bool(lead_dynamic_data)

    if should_assign:
        assign_company(db, company, assigned_to, None, lead_dynamic_data)

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
        
    # Update any pending/re-follow-up records to ensure they match the assignee
    from app.models import LeadFollowUp
    db.query(LeadFollowUp).filter(
        LeadFollowUp.company_id == company.id,
        LeadFollowUp.status.in_(["Pending", "Re Follow Up"])
    ).update({"assigned_to_id": user_id}, synchronize_session=False)
    
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
    if for_user_id is not None:
        if isinstance(for_user_id, (list, tuple, set)):
            assignment = next((a for a in company.lead_assignments if a.assigned_to_id in for_user_id), None)
        else:
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
    if prop.object_type == "mobile":
        new_val = clean_mobile_value(new_val)
        if prop.is_unique and new_val:
            if prop.is_multi_value:
                parts = [v.strip() for v in new_val.split(",") if v.strip()]
                for v in parts:
                    query = db.query(CompanyPropertyValue.id).filter(
                        CompanyPropertyValue.property_id == prop.id,
                        CompanyPropertyValue.value == v,
                        CompanyPropertyValue.company_id != company_id
                    )
                    if db.query(query.exists()).scalar():
                        raise ValueError(f"{prop.name} '{v}' already exists")
            else:
                if prop.entity_type == "lead":
                    query = db.query(LeadManage.id).filter(
                        text(f"lead_manage.{prop.field_key} = :val AND lead_manage.company_id != :cid")
                    ).params(val=new_val, cid=company_id)
                else:
                    query = db.query(Company.id).filter(
                        text(f"companies.{prop.field_key} = :val AND companies.id != :cid")
                    ).params(val=new_val, cid=company_id)
                if db.query(query.exists()).scalar():
                    raise ValueError(f"{prop.name} '{new_val}' already exists")
    
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


def validate_unique_properties_partial(db: Session, company_id: int, payload: CompanyImportUpsert) -> None:
    unique_props = db.query(Property).filter(Property.is_unique == True, Property.is_active == True).all()
    for prop in unique_props:
        target_obj = next((pv for pv in payload.property_values if pv.property_id == prop.id), None)
        if not target_obj or not target_obj.value:
            continue
        
        target_val = target_obj.value.strip()
        if not target_val:
            continue
        
        if not prop.is_multi_value:
            query = db.query(Company.id).filter(text(f"{prop.field_key} = :val"), Company.id != company_id).params(val=target_val)
            if db.query(query.exists()).scalar():
                raise CompanyValidationError(f"{prop.name} '{target_val}' already exists")
        else:
            vals = [v.strip() for v in target_val.split(",") if v.strip()]
            for v in vals:
                query = db.query(CompanyPropertyValue.id).filter(
                    CompanyPropertyValue.property_id == prop.id,
                    CompanyPropertyValue.value == v,
                    CompanyPropertyValue.company_id != company_id
                )
                if db.query(query.exists()).scalar():
                    raise CompanyValidationError(f"{prop.name} '{v}' already exists in another company")


def normalize_company_name(name: str) -> str:
    if not name:
        return ""
    import re
    name_str = str(name).lower()
    name_str = re.sub(r'[^a-z0-9]', '_', name_str)
    name_str = re.sub(r'_+', '_', name_str)
    return name_str.strip('_')


def import_upsert_company(db: Session, payload: CompanyImportUpsert, user: User) -> Company:
    clean_payload_mobile_numbers(db, payload)
    all_companies = db.query(Company).all()
    normalized_input = normalize_company_name(payload.company_name)
    company = next((c for c in all_companies if normalize_company_name(c.company_name) == normalized_input), None)
    
    if not company:
        if payload.edit_only:
            raise CompanyValidationError("Company not found in database")
        else:
            create_payload = CompanyCreate(
                company_name=payload.company_name,
                property_values=payload.property_values
            )
            return create_company(db, create_payload, user)
            
    validate_unique_properties_partial(db, company.id, payload)
    
    for pv in payload.property_values:
        prop = db.query(Property).get(pv.property_id)
        if not prop:
            continue
            
        new_val = pv.value.strip()
        old_value = ""
        
        if prop.entity_type == "lead":
            assignment = db.query(LeadManage).filter(LeadManage.company_id == company.id).first()
            if not assignment:
                assignment = LeadManage(company_id=company.id, assigned_to_id=user.id, assigned_by_id=user.id)
                db.add(assignment)
                db.commit()
                db.refresh(assignment)
            
            raw_row = db.execute(text("SELECT * FROM lead_manage WHERE id = :id"), {"id": assignment.id}).mappings().first()
            old_value = str(raw_row.get(prop.field_key)) if raw_row and raw_row.get(prop.field_key) is not None else ""
            
            if old_value != new_val:
                db.execute(text(f"UPDATE lead_manage SET {prop.field_key} = :val WHERE company_id = :cid"), {"val": new_val, "cid": company.id})
                
        elif prop.is_multi_value:
            old_vals = [cpv.value for cpv in company.property_values if cpv.property_id == prop.id]
            old_value = ",".join(old_vals)
            
            if old_value != new_val:
                db.execute(text("DELETE FROM company_property_values WHERE company_id = :cid AND property_id = :pid"), {"cid": company.id, "pid": prop.id})
                for sub_val in new_val.split(","):
                    s = sub_val.strip()
                    if s:
                        db.add(CompanyPropertyValue(company_id=company.id, property_id=prop.id, value=s))
                        
        else:
            raw_row = db.execute(text("SELECT * FROM companies WHERE id = :id"), {"id": company.id}).mappings().first()
            old_value = str(raw_row.get(prop.field_key)) if raw_row and raw_row.get(prop.field_key) is not None else ""
            
            if old_value != new_val:
                db.execute(text(f"UPDATE companies SET {prop.field_key} = :val WHERE id = :cid"), {"val": new_val, "cid": company.id})
                
        if str(old_value) != str(new_val):
            history = LeadHistory(
                company_id=company.id,
                property_key=prop.field_key,
                property_name=prop.name,
                old_value=str(old_value) if old_value else "",
                new_value=str(new_val),
                user_id=user.id
            )
            db.add(history)
            
    db.commit()
    db.refresh(company)
    return get_company(db, company.id)

