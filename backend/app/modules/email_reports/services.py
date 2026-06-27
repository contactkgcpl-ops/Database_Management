from datetime import date, datetime, timedelta
import json
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from app.models import (
    Company,
    LeadManage,
    LeadHistory,
    User,
    UserTimeLog,
    LeaveRequest,
    OurCompany,
    EmailReportConfig,
    EmailReportLog,
    Property
)

def get_report_data(db: Session, target_date: date):
    # 1. Fetch Our Companies
    our_companies = db.query(OurCompany).all()
    our_companies_map = {oc.id: oc.name for oc in our_companies}
    
    # Pre-fetch dynamic columns from companies table
    companies_raw = db.execute(text("SELECT id, city, industries, company FROM companies")).mappings().all()
    company_dynamic_map = {row["id"]: row for row in companies_raw}

    # Fetch contact number property ID dynamically
    contact_prop_id = db.execute(
        text("SELECT id FROM properties WHERE field_key = 'contact_number' AND is_active = 1")
    ).scalar() or 36
    
    # 2. Fetch all active users
    users = db.query(User).filter(User.is_active == True).all()
    users_map = {u.id: u for u in users}
    
    # Helper to parse comma-sep IDs
    def get_linked_oc_ids(company_val):
        if not company_val:
            return []
        parts = [p.strip() for p in str(company_val).split(",") if p.strip()]
        ids = []
        for p in parts:
            try:
                ids.append(int(p))
            except ValueError:
                pass
        return ids

    # 3. Fetch all client companies and their current lead management assignments
    companies = db.query(Company).all()
    lead_manages = db.query(LeadManage).all()
    lead_manage_map = {lm.company_id: lm for lm in lead_manages}
    
    # Build a map of company_id -> list of assigned user IDs (for multi-assign support)
    def get_assigned_user_ids(lm: LeadManage) -> list[int]:
        ids = []
        if not lm:
            return ids
        # Check assigned_to_ids (multi-select) first
        if hasattr(lm, "assigned_to_ids") and lm.assigned_to_ids:
            for part in str(lm.assigned_to_ids).split(","):
                part = part.strip()
                if part:
                    try:
                        ids.append(int(part))
                    except ValueError:
                        pass
        # Fallback to single assigned_to_id
        if not ids and lm.assigned_to_id:
            ids.append(lm.assigned_to_id)
        return ids
    
    # 4. Fetch activity history for the target date
    target_dt_start = datetime.combine(target_date, datetime.min.time())
    target_dt_end = datetime.combine(target_date, datetime.max.time())
    
    histories = db.query(LeadHistory).filter(
        LeadHistory.property_key == "connected_source",
        LeadHistory.created_at >= target_dt_start,
        LeadHistory.created_at <= target_dt_end
    ).all()
    
    company_activities = []
    for h in histories:
        comp = db.query(Company).filter(Company.id == h.company_id).first()
        if not comp:
            continue
        user = users_map.get(h.user_id)
        user_name = user.name if user else "System/Unknown"
        
        comm_type = str(h.new_value or "").strip().lower()
        
        contact_number = ""
        contact_number_val = db.execute(
            text("SELECT value FROM company_property_values WHERE company_id = :cid AND property_id = :pid"),
            {"cid": comp.id, "pid": contact_prop_id}
        ).scalar()
        if contact_number_val:
            contact_number = contact_number_val
            
        raw_comp = company_dynamic_map.get(comp.id)
        city = raw_comp["city"] if raw_comp and raw_comp["city"] is not None else ""
        industry = raw_comp["industries"] if raw_comp and raw_comp["industries"] is not None else ""

        company_activities.append({
            "company_name": comp.company_name,
            "contact_number": contact_number,
            "city": city,
            "industry": industry,
            "connected_via": h.new_value or "Call",
            "response": h.remark or "No remark",
            "last_activity_time": h.created_at.strftime("%I:%M %p"),
            "user_id": h.user_id,
            "user_name": user_name,
            "company_id": comp.id,
            "comm_type": comm_type
        })
        
    # 5. Fetch time logs for target date
    time_logs = db.query(UserTimeLog).filter(UserTimeLog.work_date == target_date).all()
    time_logs_map = {tl.user_id: tl for tl in time_logs}
    
    # 6. Fetch leave requests active on target date
    leaves = db.query(LeaveRequest).filter(
        LeaveRequest.from_date <= target_date,
        LeaveRequest.to_date >= target_date
    ).all()
    leaves_map = {lr.user_id: lr for lr in leaves}
    
    # 7. Build User Time Log (Section B)
    user_time_logs = []
    for u in users:
        log = time_logs_map.get(u.id)
        leave = leaves_map.get(u.id)
        
        login_str = "—"
        logout_str = "—"
        break_str = "—"
        work_str = "—"
        status = "⚫ Absent"
        
        if log:
            login_str = log.login_at.strftime("%I:%M %p") if log.login_at else "—"
            logout_str = log.logout_at.strftime("%I:%M %p") if log.logout_at else "—"
            
            b_sec = log.total_break_seconds
            break_str = f"{b_sec // 60}m" if b_sec >= 60 else f"{b_sec}s"
            
            w_sec = log.total_work_seconds
            work_str = f"{w_sec // 3600}h {(w_sec % 3600) // 60}m" if w_sec >= 60 else f"{w_sec}s"
            status = "✅ Active"
        elif leave:
            if leave.status == "Approved":
                status = f"🟡 On Leave ({leave.leave_type})"
            else:
                status = f"🔴 Unavailable (Leave {leave.status})"
                
        user_time_logs.append({
            "name": u.name,
            "login": login_str,
            "logout": logout_str,
            "break": break_str,
            "work": work_str,
            "status": status
        })
        
    # 8. Build Company-wise & User-wise Counts (Section A)
    oc_summary = []
    for oc_id, oc_name in our_companies_map.items():
        oc_companies = []
        for c in companies:
            raw_comp = company_dynamic_map.get(c.id)
            comp_val = raw_comp["company"] if raw_comp else None
            if oc_id in get_linked_oc_ids(comp_val):
                oc_companies.append(c)
        if not oc_companies:
            continue
            
        oc_comp_ids = {c.id for c in oc_companies}
        
        assigned_total = 0
        worked_total = 0
        pending_total = 0
        call_total = 0
        wa_total = 0
        email_total = 0
        social_total = 0
        
        user_rows = []
        for u in users:
            assigned_leads = [
                c for c in oc_companies 
                if lead_manage_map.get(c.id) and lead_manage_map[c.id].assigned_to_id == u.id
            ]
            if not assigned_leads:
                continue
                
            lead_ids = {c.id for c in assigned_leads}
            u_activities = [a for a in company_activities if a["user_id"] == u.id and a["company_id"] in lead_ids]
            u_worked_ids = {a["company_id"] for a in u_activities}
            
            u_worked = len(u_worked_ids)
            u_assigned = len(assigned_leads)
            u_pending = max(0, u_assigned - u_worked)
            
            u_calls = sum(1 for a in u_activities if "call" in a["comm_type"])
            u_wa = sum(1 for a in u_activities if "whatsapp" in a["comm_type"])
            u_email = sum(1 for a in u_activities if "email" in a["comm_type"])
            u_social = sum(1 for a in u_activities if "social" in a["comm_type"] or "social_media" in a["comm_type"])
            
            user_rows.append({
                "name": f"→ User: {u.name}",
                "assigned": u_assigned,
                "worked": u_worked,
                "pending": u_pending,
                "calls": u_calls,
                "whatsapp": u_wa,
                "email": u_email,
                "social": u_social
            })
            
            assigned_total += u_assigned
            worked_total += u_worked
            pending_total += u_pending
            call_total += u_calls
            wa_total += u_wa
            email_total += u_email
            social_total += u_social
            
        oc_summary.append({
            "name": oc_name,
            "assigned": assigned_total,
            "worked": worked_total,
            "pending": pending_total,
            "calls": call_total,
            "whatsapp": wa_total,
            "email": email_total,
            "social": social_total,
            "users": user_rows
        })
        
    # ─────────────────────────────────────────────────────────────────
    # 9. Build Pending Work Summary (Section C) — Parent/Child hierarchy
    # Rule: Show parent row ONLY if parent itself has directly assigned data.
    # If parent has 0 assigned and has children → show children rows only.
    # If parent has assigned data AND children → group header + own row + child rows.
    # ─────────────────────────────────────────────────────────────────
    pending_summary = []
    
    parent_users = [u for u in users if u.parent_id is None]
    child_users_by_parent = {}
    for u in users:
        if u.parent_id is not None:
            child_users_by_parent.setdefault(u.parent_id, []).append(u)
    
    def get_user_stats_sec(usr):
        assigned_leads = [
            c for c in companies
            if lead_manage_map.get(c.id) and lead_manage_map[c.id].assigned_to_id == usr.id
        ]
        lead_ids = {c.id for c in assigned_leads}
        u_acts = [a for a in company_activities if a["user_id"] == usr.id and a["company_id"] in lead_ids]
        u_worked_ids = {a["company_id"] for a in u_acts}
        assigned = len(assigned_leads)
        worked = len(u_worked_ids)
        pending = max(0, assigned - worked)
        return assigned, worked, pending

    def get_oc_str(usr):
        u_oc_names = []
        for oc_id in get_linked_oc_ids(usr.company_ids):
            if oc_id in our_companies_map:
                u_oc_names.append(our_companies_map[oc_id])
        return ", ".join(u_oc_names) if u_oc_names else "—"

    def make_row(name, oc_str, assigned, worked, pending, is_bold=False):
        pct = f"{(pending / assigned) * 100:.1f}%" if assigned > 0 else "0%"
        return {
            "user_name": name,
            "our_company": oc_str,
            "assigned": assigned,
            "worked": worked,
            "pending": pending,
            "pending_pct": pct,
            "is_bold": is_bold
        }

    for u in parent_users:
        children = child_users_by_parent.get(u.id, [])
        p_assigned, p_worked, p_pending = get_user_stats_sec(u)
        p_oc_str = get_oc_str(u)

        if children:
            child_stats = []
            for ch in children:
                ch_a, ch_w, ch_p = get_user_stats_sec(ch)
                child_stats.append((ch, ch_a, ch_w, ch_p, get_oc_str(ch)))

            tot_assigned = p_assigned + sum(s[1] for s in child_stats)
            tot_worked = p_worked + sum(s[2] for s in child_stats)
            tot_pending = p_pending + sum(s[3] for s in child_stats)

            if tot_assigned > 0:
                # Grand parent group row (sum of parent + all children)
                pending_summary.append(make_row(u.name, p_oc_str, tot_assigned, tot_worked, tot_pending, is_bold=True))

                # Show parent own row ONLY if parent has directly assigned data
                if p_assigned > 0:
                    pending_summary.append(make_row(f"  → {u.name} (Own)", p_oc_str, p_assigned, p_worked, p_pending))

                # Child rows — show regardless (they may have data even if parent doesn't)
                for ch, ch_a, ch_w, ch_p, ch_oc in child_stats:
                    if ch_a > 0:
                        pending_summary.append(make_row(f"  → {ch.name}", ch_oc, ch_a, ch_w, ch_p))
        else:
            # Standalone parent (no children)
            if p_assigned > 0:
                pending_summary.append(make_row(u.name, p_oc_str, p_assigned, p_worked, p_pending))

    # ─────────────────────────────────────────────────────────────────
    # 10. Build City + Industry Breakdown (Section D)
    # ─────────────────────────────────────────────────────────────────
    city_industry_data = {}
    for a in company_activities:
        city = a["city"] or "Unknown"
        ind = a["industry"] or "Unknown"
        key = f"{city} / {ind}"
        
        if key not in city_industry_data:
            city_industry_data[key] = {"calls": 0, "whatsapp": 0, "email": 0, "social": 0, "total": 0}
            
        stats = city_industry_data[key]
        stats["total"] += 1
        
        comm = a["comm_type"]
        if "call" in comm:
            stats["calls"] += 1
        elif "whatsapp" in comm:
            stats["whatsapp"] += 1
        elif "email" in comm:
            stats["email"] += 1
        elif "social" in comm or "social_media" in comm:
            stats["social"] += 1
            
    city_industry_list = []
    for k, v in city_industry_data.items():
        city_industry_list.append({"key": k, **v})
    city_industry_list.sort(key=lambda x: x["key"])

    # ─────────────────────────────────────────────────────────────────
    # 11. Build User Company + City + Industry Tracking (Section E)
    # For each user, use their linked Our Companies to find all assigned companies,
    # then break counts by Our Company / City / Industry.
    # ─────────────────────────────────────────────────────────────────
    user_company_tracking = []
    
    for u in users:
        u_oc_ids = get_linked_oc_ids(u.company_ids)
        if not u_oc_ids:
            continue

        # Gather all subordinate user IDs (self + children recursively)
        subordinate_ids = {u.id}
        queue = [u.id]
        while queue:
            uid = queue.pop()
            for cu in users:
                if cu.parent_id == uid and cu.id not in subordinate_ids:
                    subordinate_ids.add(cu.id)
                    queue.append(cu.id)

        # For each Our Company this user is linked to
        for oc_id in u_oc_ids:
            oc_name = our_companies_map.get(oc_id)
            if not oc_name:
                continue

            # Find all client companies under this OurCompany assigned to this user or their subordinates
            oc_companies = []
            for c in companies:
                raw_comp = company_dynamic_map.get(c.id)
                comp_val = raw_comp["company"] if raw_comp else None
                if oc_id in get_linked_oc_ids(comp_val) \
                   and lead_manage_map.get(c.id) \
                   and lead_manage_map[c.id].assigned_to_id in subordinate_ids:
                    oc_companies.append(c)

            for comp in oc_companies:
                lm = lead_manage_map.get(comp.id)
                assigned_uid = lm.assigned_to_id if lm else None
                assignee = users_map.get(assigned_uid) if assigned_uid else None

                # City / Industry for this company
                raw_comp = company_dynamic_map.get(comp.id)
                city = (raw_comp["city"] if raw_comp and raw_comp["city"] is not None else "") or "Unknown"
                industry = (raw_comp["industries"] if raw_comp and raw_comp["industries"] is not None else "") or "Unknown"

                # Get all activities for this company by the assignee
                comp_activities = [a for a in company_activities if a["company_id"] == comp.id and a["user_id"] == assigned_uid] if assigned_uid else []
                worked = 1 if comp_activities else 0
                calls = sum(1 for a in comp_activities if "call" in a["comm_type"])
                wa = sum(1 for a in comp_activities if "whatsapp" in a["comm_type"])
                email = sum(1 for a in comp_activities if "email" in a["comm_type"])
                social = sum(1 for a in comp_activities if "social" in a["comm_type"])

                user_company_tracking.append({
                    "user_name": u.name,
                    "our_company": oc_name,
                    "city": city,
                    "industry": industry,
                    "assignee": assignee.name if assignee else "—",
                    "assigned": 1,
                    "worked": worked,
                    "pending": 1 - worked,
                    "calls": calls,
                    "whatsapp": wa,
                    "email": email,
                    "social": social
                })

    # ─────────────────────────────────────────────────────────────────
    # 12. Per-User Detailed Reports (Sheets 2+)
    # ─────────────────────────────────────────────────────────────────
    per_user_reports = []
    for u in users:
        assigned_leads = [
            c for c in companies 
            if lead_manage_map.get(c.id) and lead_manage_map[c.id].assigned_to_id == u.id
        ]
        if not assigned_leads:
            continue
            
        lead_ids = {c.id for c in assigned_leads}
        u_activities = [a for a in company_activities if a["user_id"] == u.id and a["company_id"] in lead_ids]
        u_worked_ids = {a["company_id"] for a in u_activities}
        
        u_assigned = len(assigned_leads)
        u_worked = len(u_worked_ids)
        u_pending = max(0, u_assigned - u_worked)
        u_calls = sum(1 for a in u_activities if "call" in a["comm_type"])
        u_wa = sum(1 for a in u_activities if "whatsapp" in a["comm_type"])
        u_email = sum(1 for a in u_activities if "email" in a["comm_type"])
        u_social = sum(1 for a in u_activities if "social" in a["comm_type"] or "social_media" in a["comm_type"])
        
        u_city_ind_data = {}
        for a in u_activities:
            city = a["city"] or "Unknown"
            ind = a["industry"] or "Unknown"
            key = f"{city} / {ind}"
            if key not in u_city_ind_data:
                u_city_ind_data[key] = {"calls": 0, "whatsapp": 0, "email": 0, "social": 0, "total": 0}
            stats = u_city_ind_data[key]
            stats["total"] += 1
            comm = a["comm_type"]
            if "call" in comm:
                stats["calls"] += 1
            elif "whatsapp" in comm:
                stats["whatsapp"] += 1
            elif "email" in comm:
                stats["email"] += 1
            elif "social" in comm or "social_media" in comm:
                stats["social"] += 1
                
        u_city_ind_list = [{"key": k, **v} for k, v in u_city_ind_data.items()]
        u_city_ind_list.sort(key=lambda x: x["key"])
        
        worked_leads = []
        for a in u_activities:
            lm = lead_manage_map.get(a["company_id"])
            assigned_by_name = "—"
            if lm and lm.assigned_by_id:
                creator_user = users_map.get(lm.assigned_by_id)
                if creator_user:
                    assigned_by_name = creator_user.name
                    
            worked_leads.append({
                "company_name": a["company_name"],
                "contact_number": a["contact_number"],
                "city": a["city"],
                "industry": a["industry"],
                "connected_via": a["connected_via"],
                "response": a["response"],
                "last_activity_time": a["last_activity_time"],
                "assigned_by": assigned_by_name
            })
            
        pending_leads = []
        for c in assigned_leads:
            if c.id not in u_worked_ids:
                lm = lead_manage_map.get(c.id)
                days_pending = 1
                assigned_at = None
                
                assign_history = db.query(LeadHistory).filter(
                    LeadHistory.company_id == c.id,
                    LeadHistory.property_key == "assigned_to",
                    LeadHistory.new_value == u.name
                ).order_by(LeadHistory.created_at.desc()).first()
                
                if assign_history:
                    assigned_at = assign_history.created_at
                elif lm and lm.created_at:
                    assigned_at = lm.created_at
                else:
                    assigned_at = c.created_at
                    
                if assigned_at:
                    diff = datetime.now() - assigned_at
                    days_pending = max(1, diff.days)
                    assigned_at_str = assigned_at.strftime("%d-%b %I:%M %p")
                else:
                    assigned_at_str = "—"
                    
                contact_number = ""
                contact_number_val = db.execute(
                    text("SELECT value FROM company_property_values WHERE company_id = :cid AND property_id = :pid"),
                    {"cid": c.id, "pid": contact_prop_id}
                ).scalar()
                if contact_number_val:
                    contact_number = contact_number_val
                    
                raw_comp = company_dynamic_map.get(c.id)
                city = raw_comp["city"] if raw_comp and raw_comp["city"] is not None else ""
                industry = raw_comp["industries"] if raw_comp and raw_comp["industries"] is not None else ""

                pending_leads.append({
                    "company_name": c.company_name,
                    "contact_number": contact_number,
                    "city": city,
                    "industry": industry,
                    "assigned_at": assigned_at_str,
                    "days_pending": days_pending
                })
                
        per_user_reports.append({
            "user_name": u.name,
            "totals": {
                "assigned": u_assigned,
                "worked": u_worked,
                "pending": u_pending,
                "calls": u_calls,
                "whatsapp": u_wa,
                "email": u_email,
                "social": u_social
            },
            "city_industry": u_city_ind_list,
            "worked_details": worked_leads,
            "pending_details": pending_leads
        })
        
    return {
        "oc_summary": oc_summary,
        "user_time_logs": user_time_logs,
        "pending_summary": pending_summary,
        "city_industry": city_industry_list,
        "user_company_tracking": user_company_tracking,
        "per_user_reports": per_user_reports
    }
