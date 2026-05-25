from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session

from fastapi import HTTPException
from app.deps import user_has_all_permissions
from app.models import Requirement, RequirementNotification, RequirementHistory, User
from app.modules.requirements.schemas import RequirementCreate, RequirementUpdate, RequirementCommentCreate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_due_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _push_notification(db: Session, requirement: Requirement, user_id: int, notif_type: str) -> None:
    """Insert a RequirementNotification row for the given user."""
    notif = RequirementNotification(
        requirement_id=requirement.id,
        user_id=user_id,
        type=notif_type,
        is_read=False,
    )
    db.add(notif)


def _has_full_requirement_access(user: User) -> bool:
    return user_has_all_permissions(user, "users.manage", "roles.manage")


def _visible_user_ids(db: Session, user: User) -> list[int]:
    child_ids = [row.id for row in db.query(User.id).filter(User.parent_id == user.id).all()]
    return [user.id, *child_ids]


def _requirement_visible_filter(db: Session, user: User):
    user_ids = _visible_user_ids(db, user)
    return or_(
        Requirement.added_by_id == user.id,
        Requirement.assigned_to_id.in_(user_ids),
    )


def _can_access_requirement(db: Session, requirement: Requirement, user: User) -> bool:
    if _has_full_requirement_access(user):
        return True
    user_ids = set(_visible_user_ids(db, user))
    return requirement.added_by_id == user.id or requirement.assigned_to_id in user_ids


# ---------------------------------------------------------------------------
# Requirements CRUD
# ---------------------------------------------------------------------------

def create_requirement(db: Session, payload: RequirementCreate, current_user: User) -> Requirement:
    req = Requirement(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status="Open",
        due_date=_parse_due_date(payload.due_date),
        added_by_id=current_user.id,
        assigned_to_id=payload.assigned_to_id,
    )
    db.add(req)
    db.flush()  # get req.id before notification insert

    # Add history
    hist = RequirementHistory(
        requirement_id=req.id,
        user_id=current_user.id,
        type="created",
        remark="Requirement created"
    )
    db.add(hist)

    # Notify assignee (if different from creator)
    if payload.assigned_to_id and payload.assigned_to_id != current_user.id:
        _push_notification(db, req, payload.assigned_to_id, "assigned")

    db.commit()
    db.refresh(req)
    return req


def list_requirements(db: Session, current_user: User) -> list[Requirement]:
    """
    Full system roles see all requirements.
    Other users see records they created, records assigned to them, and records assigned to direct child users.
    """
    if _has_full_requirement_access(current_user):
        return db.query(Requirement).order_by(Requirement.created_at.desc()).all()

    return (
        db.query(Requirement)
        .filter(_requirement_visible_filter(db, current_user))
        .order_by(Requirement.created_at.desc())
        .all()
    )


def get_requirement(db: Session, req_id: int) -> Requirement | None:
    return db.query(Requirement).filter(Requirement.id == req_id).first()


def update_requirement(db: Session, req_id: int, payload: RequirementUpdate, current_user: User) -> Requirement:
    req = get_requirement(db, req_id)
    if not req:
        raise ValueError("Requirement not found")

    if not _can_access_requirement(db, req, current_user):
        raise HTTPException(status_code=403, detail="Requirement is not assigned to you, assigned by you, or assigned to your child user.")

    if payload.title is not None:
        req.title = payload.title
    if payload.description is not None:
        req.description = payload.description
    if payload.priority is not None:
        req.priority = payload.priority
    if payload.status is not None:
        req.status = payload.status
    if payload.due_date is not None:
        req.due_date = _parse_due_date(payload.due_date)
    if payload.assigned_to_id is not None:
        req.assigned_to_id = payload.assigned_to_id

    db.commit()
    db.refresh(req)
    return req


def complete_requirement(db: Session, req_id: int, current_user: User) -> Requirement:
    """
    Assignee marks requirement as Done.
    Notifies the original creator (added_by).
    """
    req = get_requirement(db, req_id)
    if not req:
        raise ValueError("Requirement not found")

    if not _can_access_requirement(db, req, current_user):
        raise HTTPException(status_code=403, detail="Requirement is not assigned to you, assigned by you, or assigned to your child user.")

    req.status = "Done"
    db.flush()

    # Add history
    hist = RequirementHistory(
        requirement_id=req.id,
        user_id=current_user.id,
        type="status_change",
        remark="Marked requirement as Done"
    )
    db.add(hist)

    # Notify the creator that their requirement is done
    if req.added_by_id and req.added_by_id != current_user.id:
        _push_notification(db, req, req.added_by_id, "completed")

    db.commit()
    db.refresh(req)
    return req


def delete_requirement(db: Session, req_id: int, current_user: User) -> None:
    req = get_requirement(db, req_id)
    if not req:
        raise ValueError("Requirement not found")
    
    if not _can_access_requirement(db, req, current_user):
        raise HTTPException(status_code=403, detail="Requirement is not assigned to you, assigned by you, or assigned to your child user.")

    db.delete(req)
    db.commit()


def add_requirement_comment(db: Session, req_id: int, payload: RequirementCommentCreate, current_user: User) -> RequirementHistory:
    req = get_requirement(db, req_id)
    if not req:
        raise ValueError("Requirement not found")

    if not _can_access_requirement(db, req, current_user):
        raise HTTPException(status_code=403, detail="Requirement is not assigned to you, assigned by you, or assigned to your child user.")

    hist = RequirementHistory(
        requirement_id=req.id,
        user_id=current_user.id,
        type="comment",
        remark=payload.remark
    )
    db.add(hist)
    db.flush()

    # Notify assignee if the comment is from someone else
    if req.assigned_to_id and req.assigned_to_id != current_user.id:
        _push_notification(db, req, req.assigned_to_id, "comment")
    
    # Notify creator if the comment is from someone else, and the creator is not the assignee
    if req.added_by_id and req.added_by_id != current_user.id and req.added_by_id != req.assigned_to_id:
        _push_notification(db, req, req.added_by_id, "comment")

    db.commit()
    db.refresh(hist)
    return hist


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def get_my_notifications(db: Session, current_user: User) -> list[RequirementNotification]:
    return (
        db.query(RequirementNotification)
        .filter(
            RequirementNotification.user_id == current_user.id,
            RequirementNotification.is_read.is_(False),
        )
        .order_by(RequirementNotification.created_at.desc())
        .all()
    )


def mark_notification_read(db: Session, notif_id: int, current_user: User) -> RequirementNotification:
    notif = (
        db.query(RequirementNotification)
        .filter(RequirementNotification.id == notif_id, RequirementNotification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise ValueError("Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_notifications_read(db: Session, current_user: User) -> None:
    db.query(RequirementNotification).filter(
        RequirementNotification.user_id == current_user.id,
        RequirementNotification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
