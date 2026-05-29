from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, require_permission, require_any_permission
from app.models import User, Task, TaskTimerLog, TaskComment, TaskNotification
from app.schemas import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskTimerLogOut,
    TaskCommentCreate,
    TaskCommentOut,
    TaskNotificationOut,
)
from . import services

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def map_timer_log(log: TaskTimerLog) -> dict:
    duration = 0
    if log.start_time:
        end = log.end_time or datetime.utcnow()
        duration = int((end - log.start_time).total_seconds())
    return {
        "id": log.id,
        "user_id": log.user_id,
        "user_name": log.user.name if log.user else f"User #{log.user_id}",
        "work_type": log.work_type,
        "work_description": log.work_description,
        "start_time": log.start_time,
        "end_time": log.end_time,
        "duration_seconds": duration,
    }


def map_history(h) -> dict:
    return {
        "id": h.id,
        "user_id": h.user_id,
        "user_name": h.user.name if h.user else "System",
        "action": h.action,
        "details": h.details,
        "created_at": h.created_at,
    }


def map_comment(c) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "user_name": c.user.name if c.user else f"User #{c.user_id}",
        "comment": c.comment,
        "created_at": c.created_at,
    }


def map_task(task: Task, db: Session, current_user: User) -> dict:
    has_manage = "tasks.manage" in current_user.role.permissions if current_user.role else False
    
    creator_ancestors = services.get_ancestor_ids(db, task.created_by_id)
    assignee_ancestors = services.get_ancestor_ids(db, task.assigned_to_id) if task.assigned_to_id else set()
    
    can_edit_details = (
        has_manage or
        current_user.id == task.created_by_id or
        (current_user.id == task.assigned_to_id and task.created_by_id == task.assigned_to_id) or
        current_user.id in creator_ancestors or
        current_user.id in assignee_ancestors
    )

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "due_date": task.due_date,
        "eta_hours": task.eta_hours,
        "created_by_id": task.created_by_id,
        "created_by": task.created_by,
        "assigned_to_id": task.assigned_to_id,
        "assigned_to": task.assigned_to,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "can_edit_details": can_edit_details,
        "timer_logs": [map_timer_log(log) for log in task.timer_logs],
        "comments": [map_comment(c) for c in task.comments],
        "history_entries": [map_history(h) for h in task.history_entries],
    }


@router.get("", response_model=list[TaskOut])
def list_tasks(
    status: str | None = None,
    search: str | None = None,
    assigned_by_id: int | None = None,
    assigned_to_id: int | None = None,
    due_date: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    tasks = services.get_tasks(
        db,
        user,
        status=status,
        search=search,
        assigned_by_id=assigned_by_id,
        assigned_to_id=assigned_to_id,
        due_date=due_date
    )
    return [map_task(t, db, user) for t in tasks]


@router.get("/stats", response_model=dict)
def task_stats(
    search: str | None = None,
    assigned_by_id: int | None = None,
    assigned_to_id: int | None = None,
    due_date: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    return services.get_task_stats(
        db,
        user,
        search=search,
        assigned_by_id=assigned_by_id,
        assigned_to_id=assigned_to_id,
        due_date=due_date
    )



@router.post("", response_model=TaskOut)
def create_task(
    task_in: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.create")),
):
    task = services.create_task(db, user, task_in)
    return map_task(task, db, user)


@router.get("/notifications", response_model=list[TaskNotificationOut])
def get_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    notifications = (
        db.query(TaskNotification)
        .filter(TaskNotification.user_id == user.id, TaskNotification.is_read == False)
        .order_by(TaskNotification.created_at.desc())
        .all()
    )
    result = []
    for n in notifications:
        result.append(
            {
                "id": n.id,
                "task_id": n.task_id,
                "task_title": n.task.title if n.task else None,
                "user_id": n.user_id,
                "type": n.type,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
        )
    return result


@router.post("/notifications/mark-read", response_model=dict)
def mark_notifications_read(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.query(TaskNotification).filter(
        TaskNotification.user_id == user.id, TaskNotification.is_read == False
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}


@router.post("/notifications/{notif_id}/read", response_model=dict)
def mark_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    notif = (
        db.query(TaskNotification)
        .filter(TaskNotification.id == notif_id, TaskNotification.user_id == user.id)
        .first()
    )
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "ok"}


@router.get("/{task_id}", response_model=TaskOut)
def get_task_details(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return map_task(task, db, user)


@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    task_in: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    task = services.update_task(db, task_id, user, task_in)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return map_task(task, db, user)


@router.post("/{task_id}/timer/start", response_model=TaskTimerLogOut)
def start_timer(
    task_id: int,
    work_type: str = "Development",
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    log = services.start_task_timer(db, task_id, user, work_type)
    if not log:
        raise HTTPException(status_code=404, detail="Task not found")
    return map_timer_log(log)


@router.post("/{task_id}/timer/stop", response_model=TaskTimerLogOut)
def stop_timer(
    task_id: int,
    work_description: str = "",
    work_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    log = services.stop_task_timer(db, task_id, user, work_description, work_type)
    if not log:
        raise HTTPException(
            status_code=400, detail="No active timer found for this task and user"
        )
    return map_timer_log(log)


@router.post("/{task_id}/comments", response_model=TaskCommentOut)
def add_comment(
    task_id: int,
    comment_in: TaskCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.view")),
):
    comment = services.add_task_comment(db, task_id, user, comment_in.comment)
    if not comment:
        raise HTTPException(status_code=404, detail="Task not found")
    return map_comment(comment)


@router.get("/reports/staff", response_model=list[dict])
def get_staff_report(
    work_date: str | None = Query(None),
    user_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("tasks.report")),
):
    from datetime import date
    target_date = date.today()
    if work_date:
        try:
            target_date = date.fromisoformat(work_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
            
    parsed_user_ids = None
    if user_ids:
        parsed_user_ids = [int(x) for x in user_ids.split(",") if x.strip().isdigit()]
        
    return services.get_staff_report(db, target_date, parsed_user_ids)
