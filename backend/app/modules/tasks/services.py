from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import Task, TaskTimerLog, TaskHistory, TaskComment, TaskNotification, User
from app.schemas import TaskCreate, TaskUpdate

def get_ancestor_ids(db: Session, user_id: int) -> set[int]:
    ancestors = set()
    curr_id = user_id
    for _ in range(50):  # Depth guard
        u = db.query(User).filter(User.id == curr_id).first()
        if not u or not u.parent_id:
            break
        ancestors.add(u.parent_id)
        curr_id = u.parent_id
    return ancestors

def get_descendant_ids(db: Session, user_id: int) -> set[int]:
    descendants = {user_id}
    queue = [user_id]
    while queue:
        curr = queue.pop(0)
        children = db.query(User.id).filter(User.parent_id == curr).all()
        for child_id, in children:
            if child_id not in descendants:
                descendants.add(child_id)
                queue.append(child_id)
    return descendants

def log_history(db: Session, task_id: int, user_id: int | None, action: str, details: str | None = None):
    history = TaskHistory(
        task_id=task_id,
        user_id=user_id,
        action=action,
        details=details
    )
    db.add(history)
    db.commit()

def trigger_notification(db: Session, task_id: int, sender_id: int, type: str, message: str, recipients: list[int]):
    parents = set()
    for uid in recipients:
        parents.update(get_ancestor_ids(db, uid))
    
    all_recipients = set(recipients) | parents
    all_recipients.discard(sender_id)  # Don't notify the sender
    
    for r_id in all_recipients:
        notif = TaskNotification(
            task_id=task_id,
            user_id=r_id,
            type=type,
            message=message,
            is_read=False
        )
        db.add(notif)
    db.commit()

def get_tasks(
    db: Session,
    current_user: User,
    status: str | None = None,
    search: str | None = None,
    assigned_by_id: int | None = None,
    assigned_to_id: int | None = None,
    due_date: str | None = None
) -> list[Task]:
    # Check permissions
    from app.deps import user_permission_codes
    has_manage = "tasks.manage" in user_permission_codes(current_user)
    
    if has_manage:
        query = db.query(Task)
    else:
        descendants = get_descendant_ids(db, current_user.id)
        query = db.query(Task).filter(
            or_(
                Task.created_by_id.in_(descendants),
                Task.assigned_to_id.in_(descendants)
            )
        )
        
    if status:
        query = query.filter(Task.status == status)
        
    if search:
        search_val = search.strip()
        if search_val:
            if search_val.isdigit():
                query = query.filter(or_(Task.title.ilike(f"%{search_val}%"), Task.id == int(search_val)))
            else:
                query = query.filter(Task.title.ilike(f"%{search_val}%"))
                
    if assigned_by_id:
        query = query.filter(Task.created_by_id == assigned_by_id)
        
    if assigned_to_id:
        query = query.filter(Task.assigned_to_id == assigned_to_id)
        
    if due_date:
        try:
            target_date = datetime.strptime(due_date, "%Y-%m-%d").date()
            from sqlalchemy import func
            query = query.filter(func.date(Task.due_date) == target_date)
        except Exception:
            pass
            
    return query.order_by(Task.created_at.desc()).all()


def get_task_stats(
    db: Session,
    current_user: User,
    search: str | None = None,
    assigned_by_id: int | None = None,
    assigned_to_id: int | None = None,
    due_date: str | None = None
) -> dict:
    # Check permissions
    from app.deps import user_permission_codes
    has_manage = "tasks.manage" in user_permission_codes(current_user)
    
    if has_manage:
        query = db.query(Task)
    else:
        descendants = get_descendant_ids(db, current_user.id)
        query = db.query(Task).filter(
            or_(
                Task.created_by_id.in_(descendants),
                Task.assigned_to_id.in_(descendants)
            )
        )
        
    if search:
        search_val = search.strip()
        if search_val:
            if search_val.isdigit():
                query = query.filter(or_(Task.title.ilike(f"%{search_val}%"), Task.id == int(search_val)))
            else:
                query = query.filter(Task.title.ilike(f"%{search_val}%"))
                
    if assigned_by_id:
        query = query.filter(Task.created_by_id == assigned_by_id)
        
    if assigned_to_id:
        query = query.filter(Task.assigned_to_id == assigned_to_id)
        
    if due_date:
        try:
            target_date = datetime.strptime(due_date, "%Y-%m-%d").date()
            from sqlalchemy import func
            query = query.filter(func.date(Task.due_date) == target_date)
        except Exception:
            pass
            
    tasks = query.all()
    stats = {
        "total": len(tasks),
        "ongoing": sum(1 for t in tasks if t.status == "Ongoing"),
        "todo": sum(1 for t in tasks if t.status == "TODO"),
        "hold": sum(1 for t in tasks if t.status == "Hold"),
        "completed": sum(1 for t in tasks if t.status == "Completed"),
    }
    return stats


def create_task(db: Session, current_user: User, task_in: TaskCreate) -> Task:
    task = Task(
        title=task_in.title,
        description=task_in.description,
        due_date=task_in.due_date,
        eta_hours=task_in.eta_hours,
        assigned_to_id=task_in.assigned_to_id,
        created_by_id=current_user.id,
        status="TODO"
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    log_history(db, task.id, current_user.id, "created", f"Task created by {current_user.name}")
    
    # Notify assignee if it's not the creator
    if task.assigned_to_id and task.assigned_to_id != current_user.id:
        trigger_notification(
            db,
            task_id=task.id,
            sender_id=current_user.id,
            type="assigned",
            message=f"New task assigned to you: {task.title}",
            recipients=[task.assigned_to_id]
        )
        
    return task

def update_task(db: Session, task_id: int, current_user: User, task_in: TaskUpdate) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None
        
    # Log updates
    changes = []
    if task_in.title is not None and task_in.title != task.title:
        changes.append(f"Title changed from '{task.title}' to '{task_in.title}'")
        task.title = task_in.title
        
    if task_in.description is not None and task_in.description != task.description:
        changes.append("Description updated")
        task.description = task_in.description
        
    if task_in.due_date is not None and task_in.due_date != task.due_date:
        old_due = task.due_date.strftime("%Y-%m-%d %H:%M") if task.due_date else "None"
        new_due = task_in.due_date.strftime("%Y-%m-%d %H:%M") if task_in.due_date else "None"
        changes.append(f"Due date changed from {old_due} to {new_due}")
        task.due_date = task_in.due_date
        
    if task_in.eta_hours is not None and task_in.eta_hours != task.eta_hours:
        changes.append(f"ETA changed from {task.eta_hours}h to {task_in.eta_hours}h")
        task.eta_hours = task_in.eta_hours
        
    if task_in.assigned_to_id is not None and task_in.assigned_to_id != task.assigned_to_id:
        old_assignee = task.assigned_to.name if task.assigned_to else "Unassigned"
        task.assigned_to_id = task_in.assigned_to_id
        db.flush()
        db.refresh(task)
        new_assignee = task.assigned_to.name if task.assigned_to else "Unassigned"
        changes.append(f"Assignee changed from {old_assignee} to {new_assignee}")
        
        # Notify new assignee
        if task.assigned_to_id and task.assigned_to_id != current_user.id:
            trigger_notification(
                db,
                task_id=task.id,
                sender_id=current_user.id,
                type="assigned",
                message=f"Task assigned to you: {task.title}",
                recipients=[task.assigned_to_id]
            )
            
    if task_in.status is not None and task_in.status != task.status:
        old_status = task.status
        task.status = task_in.status
        changes.append(f"Status changed from {old_status} to {task.status}")
        
        # Notify about task completion
        if task.status == "Completed":
            recipients = [task.created_by_id]
            if task.assigned_to_id:
                recipients.append(task.assigned_to_id)
            trigger_notification(
                db,
                task_id=task.id,
                sender_id=current_user.id,
                type="completed",
                message=f"Task completed: {task.title}",
                recipients=recipients
            )
            
    db.commit()
    db.refresh(task)
    
    if changes:
        log_history(db, task.id, current_user.id, "updated", "; ".join(changes))
        
    return task

def start_task_timer(db: Session, task_id: int, current_user: User, work_type: str) -> TaskTimerLog:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None
        
    # Stop any running timer for this user
    active_log = db.query(TaskTimerLog).filter(
        TaskTimerLog.user_id == current_user.id,
        TaskTimerLog.end_time == None
    ).first()
    if active_log:
        stop_task_timer(db, active_log.task_id, current_user, "Auto-stopped", "Switched task")
        
    now = datetime.utcnow()
    log = TaskTimerLog(
        task_id=task.id,
        user_id=current_user.id,
        work_type=work_type,
        start_time=now
    )
    db.add(log)
    
    # Change task status to Ongoing if TODO or Hold
    if task.status in ["TODO", "Hold"]:
        old_status = task.status
        task.status = "Ongoing"
        log_history(db, task.id, current_user.id, "status_changed", f"Status changed from {old_status} to Ongoing")
        
    log_history(db, task.id, current_user.id, "timer_started", f"Timer started for work type: {work_type}")
    db.commit()
    db.refresh(log)
    return log

def stop_task_timer(db: Session, task_id: int, current_user: User, work_description: str, work_type: str | None = None) -> TaskTimerLog:
    log = db.query(TaskTimerLog).filter(
        TaskTimerLog.task_id == task_id,
        TaskTimerLog.user_id == current_user.id,
        TaskTimerLog.end_time == None
    ).first()
    if not log:
        return None
        
    now = datetime.utcnow()
    log.end_time = now
    log.work_description = work_description
    if work_type:
        log.work_type = work_type
        
    # Log to history
    duration = now - log.start_time
    duration_str = f"{duration.seconds // 3600}h {(duration.seconds % 3600) // 60}m"
    log_history(db, task_id, current_user.id, "timer_stopped", f"Timer stopped (Duration: {duration_str})")
    
    # Check if task status should go to Hold (user can manually change it, but stopping timer doesn't force hold unless needed)
    db.commit()
    db.refresh(log)
    return log

def add_task_comment(db: Session, task_id: int, current_user: User, comment_text: str) -> TaskComment:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return None
        
    comment = TaskComment(
        task_id=task_id,
        user_id=current_user.id,
        comment=comment_text
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    log_history(db, task_id, current_user.id, "comment_added", f"Comment added by {current_user.name}")
    
    # Send comment notification
    recipients = [task.created_by_id]
    if task.assigned_to_id:
        recipients.append(task.assigned_to_id)
        
    trigger_notification(
        db,
        task_id=task_id,
        sender_id=current_user.id,
        type="comment",
        message=f"New comment on task: {task.title}",
        recipients=recipients
    )
    
    return comment


def get_staff_report(db: Session, work_date, user_ids: list[int] | None = None) -> list[dict]:
    from datetime import date, time, datetime
    
    # Start and End of the day D in UTC timezone
    start_dt = datetime.combine(work_date, time.min)
    end_dt = datetime.combine(work_date, time.max)
    
    # Query active users
    query_users = db.query(User).filter(User.is_active == True)
    if user_ids:
        query_users = query_users.filter(User.id.in_(user_ids))
    users = query_users.order_by(User.name).all()
    
    report_data = []
    
    for u in users:
        # 1. Query timer logs for this user overlapping with the target date
        logs = db.query(TaskTimerLog).filter(
            TaskTimerLog.user_id == u.id,
            TaskTimerLog.start_time < end_dt,
            (TaskTimerLog.end_time == None) | (TaskTimerLog.end_time > start_dt)
        ).all()
        
        # 2. Query status counts for the selected day
        # Pending: assigned to user, created before end_dt, not completed on/before end_dt
        pending_tasks = db.query(Task).filter(
            Task.assigned_to_id == u.id,
            Task.created_at <= end_dt,
            (Task.status != "Completed") | (Task.updated_at > end_dt)
        ).all()
        pending_count = len(pending_tasks)
        
        # Completed on this day: assigned to user, status is Completed, updated_at falls on this day
        completed_tasks = db.query(Task).filter(
            Task.assigned_to_id == u.id,
            Task.status == "Completed",
            Task.updated_at >= start_dt,
            Task.updated_at <= end_dt
        ).all()
        completed_count = len(completed_tasks)
        
        # Query active assigned tasks (either pending or completed today)
        active_assigned_tasks = db.query(Task).filter(
            Task.assigned_to_id == u.id,
            Task.created_at <= end_dt
        ).filter(
            (Task.status != "Completed") | (Task.updated_at >= start_dt)
        ).all()
        
        # Group timer logs and active tasks
        task_work = {}
        total_time_worked_today = 0
        
        # Helper to determine task status on Day D
        def get_task_status_at(task, end_dt):
            if task.status == "Completed" and task.updated_at > end_dt:
                has_logs_before = any(l.start_time < end_dt for l in task.timer_logs)
                return "In Progress" if has_logs_before else "TODO"
            return task.status
            
        # Helper to calculate total worked seconds logged on task up to end_dt
        def get_total_worked_seconds_up_to(task, end_dt):
            total = 0
            for l in task.timer_logs:
                if l.start_time < end_dt:
                    end = min(l.end_time or datetime.utcnow(), end_dt)
                    total += max(0, int((end - l.start_time).total_seconds()))
            return total
            
        # First process tasks worked on today
        for log in logs:
            task_id = log.task_id
            if not task_id:
                continue
                
            task_title = log.task.title if log.task else f"Task #{task_id}"
            task_eta = log.task.eta_hours if log.task else 0.0
            
            # Calculate overlapping duration in seconds today
            log_start = max(log.start_time, start_dt)
            log_end = min(log.end_time or datetime.utcnow(), end_dt)
            overlap_seconds = max(0, int((log_end - log_start).total_seconds()))
            
            if overlap_seconds <= 0:
                continue
                
            if task_id not in task_work:
                total_worked_seconds = 0
                if log.task:
                    total_worked_seconds = get_total_worked_seconds_up_to(log.task, end_dt)
                else:
                    total_worked_seconds = overlap_seconds
                    
                task_work[task_id] = {
                    "task_id": task_id,
                    "task_title": task_title,
                    "eta_hours": task_eta,
                    "time_worked_today_seconds": 0,
                    "total_worked_seconds": total_worked_seconds,
                    "status": get_task_status_at(log.task, end_dt) if log.task else "In Progress",
                    "worked_today": True,
                    "is_running": False
                }
                
            task_work[task_id]["time_worked_today_seconds"] += overlap_seconds
            total_time_worked_today += overlap_seconds
            if log.end_time is None:
                task_work[task_id]["is_running"] = True
            
        # Then process active assigned tasks that had 0 hours worked today
        for task in active_assigned_tasks:
            if task.id not in task_work:
                total_worked_seconds = get_total_worked_seconds_up_to(task, end_dt)
                task_work[task.id] = {
                    "task_id": task.id,
                    "task_title": task.title,
                    "eta_hours": task.eta_hours or 0.0,
                    "time_worked_today_seconds": 0,
                    "total_worked_seconds": total_worked_seconds,
                    "status": get_task_status_at(task, end_dt),
                    "worked_today": False,
                    "is_running": False
                }
                
        # Convert task_work dict to list and calculate efficiencies
        tasks_list = []
        task_efficiencies_worked_today = []
        
        for t_id, t_info in task_work.items():
            worked_today_hours = t_info["time_worked_today_seconds"] / 3600.0
            total_worked_hours = t_info["total_worked_seconds"] / 3600.0
            eta_hours = t_info["eta_hours"]
            
            # Case A-D
            if total_worked_hours > 0 and eta_hours > 0:
                efficiency_pct = (eta_hours / total_worked_hours) * 100
            elif total_worked_hours == 0 and eta_hours > 0:
                efficiency_pct = 0.0
            elif total_worked_hours > 0 and eta_hours == 0:
                efficiency_pct = 100.0
            else:  # total_worked_hours == 0 and eta_hours == 0
                efficiency_pct = 100.0
                
            efficiency_pct = round(efficiency_pct, 1)
            
            tasks_list.append({
                "task_id": t_info["task_id"],
                "task_title": t_info["task_title"],
                "time_worked_today_hours": round(worked_today_hours, 2),
                "eta_hours": eta_hours,
                "efficiency_percent": efficiency_pct,
                "status": t_info["status"],
                "is_running": t_info.get("is_running", False)
            })
            
            if t_info["time_worked_today_seconds"] > 0:
                task_efficiencies_worked_today.append(efficiency_pct)
                
        # In Progress count is the number of tasks worked on today
        inprogress_count = len(task_efficiencies_worked_today)
        
        # Calculate daily user-level efficiency with 8-hour workday target progress
        total_worked_today_hours = round(total_time_worked_today / 3600.0, 2)
        if total_worked_today_hours == 0.0:
            daily_efficiency = 0.0
        else:
            if task_efficiencies_worked_today:
                avg_task_efficiency = sum(task_efficiencies_worked_today) / len(task_efficiencies_worked_today)
            else:
                avg_task_efficiency = 100.0
                
            scale_factor = min(1.0, total_worked_today_hours / 8.0)
            daily_efficiency = round(avg_task_efficiency * scale_factor, 1)
            
        # Custom analysis logic: workload health
        workload_health = "Healthy"
        if total_worked_today_hours > 10.0:
            workload_health = "Critical Overtime"
        elif total_worked_today_hours > 8.0:
            workload_health = "Overworked"
        elif total_worked_today_hours == 0.0 and pending_count > 0:
            workload_health = "Idle"
            
        report_data.append({
            "user_id": u.id,
            "user_name": u.name,
            "total_worked_hours": total_worked_today_hours,
            "daily_efficiency": daily_efficiency,
            "inprogress_count": inprogress_count,
            "completed_count": completed_count,
            "pending_count": pending_count,
            "tasks": tasks_list,
            "workload_health": workload_health
        })
        
    return report_data
