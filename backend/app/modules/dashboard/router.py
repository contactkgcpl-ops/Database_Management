from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_any_permission, user_has_all_permissions
from app.models import Company, LeadManage, Requirement, User, UserTimeLog

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def has_full_dashboard_access(user: User) -> bool:
    return user_has_all_permissions(user, "users.manage", "roles.manage")


def visible_user_ids(db: Session, user: User) -> list[int]:
    child_ids = [row.id for row in db.query(User.id).filter(User.parent_id == user.id).all()]
    return [user.id, *child_ids]


@router.get("/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("dashboard.view")),
):
    full_access = has_full_dashboard_access(user)
    user_ids = visible_user_ids(db, user)

    pending_requirements = db.query(Requirement).filter(
        or_(
            Requirement.status.is_(None),
            func.lower(Requirement.status).notin_(["done", "closed"]),
        )
    )
    inquiries = (
        db.query(LeadManage)
        .join(Company, Company.id == LeadManage.company_id)
        .filter(LeadManage.is_inquiry.is_(True))
    )
    staff_logged_today = (
        db.query(func.count(func.distinct(UserTimeLog.user_id)))
        .join(User, User.id == UserTimeLog.user_id)
        .filter(
            UserTimeLog.work_date == datetime.now().date(),
            User.is_active.is_(True),
        )
    )

    if not full_access:
        pending_requirements = pending_requirements.filter(
            or_(
                Requirement.added_by_id == user.id,
                Requirement.assigned_to_id.in_(user_ids),
            )
        )
        inquiries = inquiries.filter(
            or_(
                LeadManage.assigned_to_id.in_(user_ids),
                LeadManage.assigned_by_id == user.id,
                Company.created_by == user.id,
            )
        )
        staff_logged_today = staff_logged_today.filter(UserTimeLog.user_id.in_(user_ids))

    # Calculate pending requirements breakdown by user
    user_query = db.query(User).filter(User.is_active.is_(True))
    if not full_access:
        user_query = user_query.filter(User.id.in_(user_ids))
    users_list = user_query.all()

    pending_counts_query = db.query(
        Requirement.assigned_to_id,
        func.count(Requirement.id)
    ).filter(
        or_(
            Requirement.status.is_(None),
            func.lower(Requirement.status).notin_(["done", "closed"]),
        )
    )

    if not full_access:
        pending_counts_query = pending_counts_query.filter(
            or_(
                Requirement.added_by_id == user.id,
                Requirement.assigned_to_id.in_(user_ids),
            )
        )

    pending_counts = pending_counts_query.group_by(Requirement.assigned_to_id).all()
    counts_map = {uid: count for uid, count in pending_counts}

    pending_by_user = []
    for u in users_list:
        pending_by_user.append({
            "user_id": u.id,
            "user_name": u.name,
            "pending_count": counts_map.get(u.id, 0)
        })

    unassigned_count = counts_map.get(None, 0)
    if unassigned_count > 0:
        pending_by_user.append({
            "user_id": None,
            "user_name": "Unassigned",
            "pending_count": unassigned_count
        })

    pending_by_user = sorted(pending_by_user, key=lambda x: x["pending_count"], reverse=True)

    return {
        "pending_requirements": pending_requirements.count(),
        "total_inquiries": inquiries.count(),
        "staff_logged_today": staff_logged_today.scalar() or 0,
        "pending_by_user": pending_by_user,
    }
