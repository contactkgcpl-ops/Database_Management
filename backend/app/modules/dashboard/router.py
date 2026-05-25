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

    return {
        "pending_requirements": pending_requirements.count(),
        "total_inquiries": inquiries.count(),
        "staff_logged_today": staff_logged_today.scalar() or 0,
    }
