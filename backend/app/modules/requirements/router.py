from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_any_permission
from app.models import User
from app.modules.requirements.permissions import (
    REQUIREMENT_CREATE,
    REQUIREMENT_DELETE,
    REQUIREMENT_UPDATE,
    REQUIREMENT_VIEW,
)
from app.modules.requirements.schemas import (
    NotificationOut,
    RequirementCreate,
    RequirementOut,
    RequirementUpdate,
    RequirementHistoryOut,
    RequirementCommentCreate,
)
from app.modules.requirements.services import (
    complete_requirement,
    create_requirement,
    delete_requirement,
    get_my_notifications,
    list_requirements,
    mark_all_notifications_read,
    mark_notification_read,
    update_requirement,
    add_requirement_comment,
)

router = APIRouter(prefix="/requirements", tags=["requirements"])


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------

@router.get("", response_model=list[RequirementOut])
def list_requirements_route(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_VIEW)),
):
    return list_requirements(db, user)


@router.post("", response_model=RequirementOut, status_code=201)
def create_requirement_route(
    payload: RequirementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_CREATE)),
):
    try:
        return create_requirement(db, payload, user)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/{req_id}", response_model=RequirementOut)
def update_requirement_route(
    req_id: int,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_UPDATE)),
):
    try:
        return update_requirement(db, req_id, payload, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{req_id}/complete", response_model=RequirementOut)
def complete_requirement_route(
    req_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_UPDATE)),
):
    try:
        return complete_requirement(db, req_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{req_id}/comments", response_model=RequirementHistoryOut)
def add_requirement_comment_route(
    req_id: int,
    payload: RequirementCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_VIEW)),
):
    try:
        return add_requirement_comment(db, req_id, payload, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{req_id}", status_code=204)
def delete_requirement_route(
    req_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_DELETE)),
):
    try:
        delete_requirement(db, req_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications_route(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_VIEW)),
):
    return get_my_notifications(db, user)


@router.put("/notifications/read-all", status_code=204)
def mark_all_read_route(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_VIEW)),
):
    mark_all_notifications_read(db, user)


@router.put("/notifications/{notif_id}/read", response_model=NotificationOut)
def mark_one_read_route(
    notif_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(REQUIREMENT_VIEW)),
):
    try:
        return mark_notification_read(db, notif_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
