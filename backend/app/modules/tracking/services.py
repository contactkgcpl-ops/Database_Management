from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import Company, LeadManage, Property, PropertyOption

def get_tracking_filters(db: Session):
    # 1. Get unique states from companies table
    states_res = db.execute(text("SELECT DISTINCT state FROM companies WHERE state IS NOT NULL AND state != ''")).fetchall()
    states = [r[0] for r in states_res]
    
    # 2. Get all companies (id and name) from our_companies table
    companies_res = db.execute(text("SELECT id, name FROM our_companies ORDER BY name ASC")).fetchall()
    companies = [{"id": r[0], "name": r[1]} for r in companies_res]
    
    # 3. Get active options for the 'industries' property
    industries = []
    prop_id = db.execute(text("SELECT id FROM properties WHERE field_key = 'industries'")).scalar()
    if prop_id:
        opts = db.execute(text("SELECT label, value FROM property_options WHERE property_id = :pid AND is_active = 1"), {"pid": prop_id}).fetchall()
        industries = [{"label": r[0], "value": r[1]} for r in opts]
        
    return {
        "states": sorted(states),
        "companies": companies,
        "industries": industries
    }

def get_connection_tracking(db: Session, states: list[str] = None, company_ids: list[int] = None, industries: list[str] = None):
    # Query joined Company and LeadManage using raw SQL mapping to support dynamic columns
    sql = "SELECT c.id, c.company_name, c.city, c.state, c.industries, c.verification_status, lm.connected_source FROM companies c LEFT OUTER JOIN lead_manage lm ON c.id = lm.company_id"
    params = {}
    where_clauses = []
    
    if states:
        where_clauses.append("c.state IN :states")
        params["states"] = tuple(states)
        
    if company_ids:
        # Resolve selected our_company ids to names and filter companies table by name
        our_company_names_res = db.execute(
            text("SELECT name FROM our_companies WHERE id IN :ids"),
            {"ids": tuple(company_ids)}
        ).fetchall()
        our_company_names = [r[0] for r in our_company_names_res]
        if our_company_names:
            where_clauses.append("LOWER(c.company_name) IN :names")
            params["names"] = tuple(n.lower() for n in our_company_names)
        else:
            where_clauses.append("1 = 0")
        
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
        
    rows = db.execute(text(sql), params).mappings().all()
    
    # Python-side filtering and city-level metrics aggregation
    from collections import defaultdict
    city_data = defaultdict(lambda: {
        "total_data": 0,
        "whatsapp_done": 0,
        "email_done": 0,
        "call_done": 0,
        "social_media_done": 0,
        "verify_pending": 0,
        "verify_verified": 0,
        "verify_invalid": 0,
    })
    
    for row in rows:
        # Check industries filter if specified
        if industries:
            comp_inds = [i.strip().lower() for i in str(row["industries"] or "").split(",") if i.strip()]
            if not any(ind.lower() in comp_inds for ind in industries):
                continue
                
        city = row["city"] or "Unknown"
        city_key = city.strip().title()
        
        stats = city_data[city_key]
        stats["total_data"] += 1
        
        connected_source = row["connected_source"]
        if connected_source:
            sources = [s.strip().lower() for s in str(connected_source).split(",") if s.strip()]
            if "whatsapp" in sources:
                stats["whatsapp_done"] += 1
            if "email" in sources:
                stats["email_done"] += 1
            if "call" in sources:
                stats["call_done"] += 1
            if "social_media" in sources:
                stats["social_media_done"] += 1
                
        # Count verification status
        ver_status = str(row["verification_status"] or "").strip().lower()
        if not ver_status or ver_status == "pending":
            stats["verify_pending"] += 1
        elif ver_status == "verified":
            stats["verify_verified"] += 1
        elif ver_status in ("unverified", "invalid"):
            stats["verify_invalid"] += 1
        else:
            stats["verify_pending"] += 1
                
    # Transform statistics into standard row response format
    results = []
    for city, stats in city_data.items():
        total = stats["total_data"]
        wa_done = stats["whatsapp_done"]
        em_done = stats["email_done"]
        cl_done = stats["call_done"]
        sm_done = stats["social_media_done"]
        
        results.append({
            "city": city,
            "total_data": total,
            "whatsapp_done": wa_done,
            "whatsapp_pending": max(0, total - wa_done),
            "email_done": em_done,
            "email_pending": max(0, total - em_done),
            "call_done": cl_done,
            "call_pending": max(0, total - cl_done),
            "social_media_done": sm_done,
            "social_media_pending": max(0, total - sm_done),
            "verify_pending": stats["verify_pending"],
            "verify_verified": stats["verify_verified"],
            "verify_invalid": stats["verify_invalid"],
        })
        
    return sorted(results, key=lambda x: x["city"])
