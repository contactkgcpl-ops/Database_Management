from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models import Task, TaskTimerLog, TaskHistory, TaskComment, TaskNotification, User, UserTimeLog
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
    # Only Admin gets full task access; other roles are restricted to hierarchy
    is_admin = current_user.role.name == "Admin" if current_user.role else False
    
    if is_admin:
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
    # Only Admin gets full task stats access; other roles are restricted to hierarchy
    is_admin = current_user.role.name == "Admin" if current_user.role else False
    
    if is_admin:
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


def get_staff_report(db: Session, start_date, end_date, user_ids: list[int] | None = None, current_user: User | None = None) -> list[dict]:
    from datetime import date, time, datetime, timedelta, timezone
    
    def format_utc_iso(dt):
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    # Start and End of the entire date range in local representation / UTC bounds
    range_start_dt = datetime.combine(start_date, time.min)
    range_end_dt = datetime.combine(end_date, time.max)
    
    # Query active users
    query_users = db.query(User).filter(User.is_active == True)
    
    # Restrict report users list to descendants for non-Admins
    if current_user:
        is_admin = current_user.role.name == "Admin" if current_user.role else False
        if not is_admin:
            descendants = get_descendant_ids(db, current_user.id)
            query_users = query_users.filter(User.id.in_(descendants))
            
    if user_ids:
        query_users = query_users.filter(User.id.in_(user_ids))
    users = query_users.order_by(User.name).all()
    
    report_data = []
    
    num_days = (end_date - start_date).days + 1
    dates_in_range = [start_date + timedelta(days=x) for x in range(num_days)]
    
    for u in users:
        # 1. Query timer logs for this user overlapping with the range
        logs = db.query(TaskTimerLog).filter(
            TaskTimerLog.user_id == u.id,
            TaskTimerLog.start_time < range_end_dt,
            (TaskTimerLog.end_time == None) | (TaskTimerLog.end_time > range_start_dt)
        ).all()
        
        # 2. Query all tasks assigned to this user that were created before or during the range
        assigned_tasks = db.query(Task).filter(
            Task.assigned_to_id == u.id,
            Task.created_at <= range_end_dt
        ).all()
        
        # 3. Query all user login/logout logs in the range
        attendance_logs = db.query(UserTimeLog).filter(
            UserTimeLog.user_id == u.id,
            UserTimeLog.work_date >= start_date,
            UserTimeLog.work_date <= end_date
        ).all()
        attendance_map = {log.work_date: log for log in attendance_logs}
        
        days_data = []
        unique_tasks_worked_range = set()
        total_completed_range = 0
        total_worked_seconds_range = 0
        total_login_hours_range = 0.0
        total_break_hours_range = 0.0
        daily_efficiencies = []
        time_utils_list = []
        comp_rates_list = []
        task_effs_list = []
        
        for d in dates_in_range:
            start_dt = datetime.combine(d, time.min)
            end_dt = datetime.combine(d, time.max)
            
            day_logs = [
                l for l in logs 
                if l.start_time < end_dt and (l.end_time is None or l.end_time > start_dt)
            ]
            
            # Get attendance details
            attendance_log = attendance_map.get(d)
            login_time = None
            logout_time = None
            total_login_hours = 0.0
            total_break_hours = 0.0
            
            if attendance_log:
                login_time = format_utc_iso(attendance_log.login_at)
                logout_time = format_utc_iso(attendance_log.logout_at)
                total_break_hours = round(attendance_log.total_break_seconds / 3600.0, 2)
                if attendance_log.logout_at:
                    seconds = (attendance_log.logout_at - attendance_log.login_at).total_seconds()
                    net_seconds = max(0, seconds - attendance_log.total_break_seconds)
                    total_login_hours = round(net_seconds / 3600.0, 2)
                else:
                    if d == date.today():
                        now_utc = datetime.utcnow()
                        seconds = (now_utc - attendance_log.login_at).total_seconds()
                        net_seconds = max(0, seconds - attendance_log.total_break_seconds)
                        total_login_hours = round(net_seconds / 3600.0, 2)
                    else:
                        total_login_hours = round(attendance_log.total_work_seconds / 3600.0, 2)
            
            total_login_hours_range += total_login_hours
            total_break_hours_range += total_break_hours
            
            day_pending = [
                t for t in assigned_tasks
                if t.created_at <= end_dt and (t.status != "Completed" or (t.updated_at and t.updated_at > end_dt))
            ]
            pending_count = len(day_pending)
            
            day_completed = [
                t for t in assigned_tasks
                if t.status == "Completed" and t.updated_at and start_dt <= t.updated_at <= end_dt
            ]
            completed_count = len(day_completed)
            total_completed_range += completed_count
            
            day_active_assigned = [
                t for t in assigned_tasks
                if t.created_at <= end_dt and (t.status != "Completed" or (t.updated_at and t.updated_at >= start_dt))
            ]
            
            task_work = {}
            total_time_worked_today = 0
            
            def get_task_status_at(task, end_dt):
                if task.status == "Completed" and task.updated_at and task.updated_at > end_dt:
                    has_logs_before = any(l.start_time < end_dt for l in task.timer_logs)
                    return "In Progress" if has_logs_before else "TODO"
                return task.status
                
            def get_total_worked_seconds_up_to(task, end_dt):
                total = 0
                for l in task.timer_logs:
                    if l.start_time < end_dt:
                        end = min(l.end_time or datetime.utcnow(), end_dt)
                        total += max(0, int((end - l.start_time).total_seconds()))
                return total
                
            for log in day_logs:
                task_id = log.task_id
                if not task_id:
                    continue
                
                unique_tasks_worked_range.add(task_id)
                task_title = log.task.title if log.task else f"Task #{task_id}"
                task_eta = log.task.eta_hours if log.task else 0.0
                
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
                    
            for task in day_active_assigned:
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
                    
            tasks_list = []
            task_efficiencies_worked_today = []
            
            for t_id, t_info in task_work.items():
                worked_today_hours = t_info["time_worked_today_seconds"] / 3600.0
                total_worked_hours = t_info["total_worked_seconds"] / 3600.0
                eta_hours = t_info["eta_hours"]
                status = t_info["status"]
                
                if status == "Completed":
                    if total_worked_hours > 0:
                        efficiency_pct = (eta_hours / total_worked_hours) * 100
                    else:
                        efficiency_pct = 100.0
                else:
                    efficiency_pct = 0.0
                    
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
                    
            inprogress_count = len(task_efficiencies_worked_today)
            total_worked_today_hours = round(total_time_worked_today / 3600.0, 2)
            total_worked_seconds_range += total_time_worked_today
            
            # Initialize component metrics
            time_util = 0.0
            comp_rate = 100.0
            task_eff = 0.0
            
            if total_worked_today_hours == 0.0:
                daily_efficiency = 0.0
            else:
                # 1. Time Utilization
                if total_login_hours > 0:
                    time_util = min(100.0, (total_worked_today_hours / total_login_hours) * 100.0)
                else:
                    time_util = 100.0
                
                # 2. Completion Rate
                total_assigned_today = completed_count + pending_count
                if total_assigned_today > 0:
                    comp_rate = (completed_count / total_assigned_today) * 100.0
                else:
                    comp_rate = 100.0
                    
                # 3. Tracked Task Efficiency
                if task_efficiencies_worked_today:
                    task_eff = sum(task_efficiencies_worked_today) / len(task_efficiencies_worked_today)
                else:
                    task_eff = 0.0
                
                # Combined Overall Efficiency
                daily_efficiency = round(0.3 * time_util + 0.3 * comp_rate + 0.4 * task_eff, 1)
                daily_efficiencies.append(daily_efficiency)
                time_utils_list.append(time_util)
                comp_rates_list.append(comp_rate)
                task_effs_list.append(task_eff)
                
            workload_health = "Healthy"
            if total_worked_today_hours > 10.0:
                workload_health = "Critical Overtime"
            elif total_worked_today_hours > 8.0:
                workload_health = "Overworked"
            elif total_worked_today_hours == 0.0 and pending_count > 0:
                workload_health = "Idle"
                
            if num_days == 1 or total_worked_today_hours > 0 or login_time is not None:
                days_data.append({
                    "date": d.isoformat(),
                    "worked_hours": total_worked_today_hours,
                    "daily_efficiency": daily_efficiency,
                    "inprogress_count": inprogress_count,
                    "completed_count": completed_count,
                    "pending_count": pending_count,
                    "tasks": [t for t in tasks_list if t["time_worked_today_hours"] > 0 or t["is_running"]],
                    "workload_health": workload_health,
                    "login_time": login_time,
                    "logout_time": logout_time,
                    "total_login_hours": total_login_hours,
                    "total_break_hours": total_break_hours,
                    "eff_time_utilization": round(time_util, 1),
                    "eff_completion_rate": round(comp_rate, 1),
                    "eff_task_efficiency": round(task_eff, 1)
                })
                
        total_worked_hours_range = round(total_worked_seconds_range / 3600.0, 2)
        avg_efficiency_range = round(sum(daily_efficiencies) / len(daily_efficiencies), 1) if daily_efficiencies else 0.0
        
        # Latest pending count at end of range
        latest_pending_count = 0
        if assigned_tasks:
            latest_pending = [
                t for t in assigned_tasks
                if t.created_at <= range_end_dt and (t.status != "Completed" or (t.updated_at and t.updated_at > range_end_dt))
            ]
            latest_pending_count = len(latest_pending)
            
        # workload health for the range
        workload_health_range = "Healthy"
        avg_worked_hours = total_worked_hours_range / len(dates_in_range) if dates_in_range else 0.0
        if avg_worked_hours > 10.0:
            workload_health_range = "Critical Overtime"
        elif avg_worked_hours > 8.0:
            workload_health_range = "Overworked"
        elif total_worked_hours_range == 0.0 and latest_pending_count > 0:
            workload_health_range = "Idle"
            
        # Compute range-level component averages
        avg_time_util = round(sum(time_utils_list) / len(time_utils_list), 1) if time_utils_list else 0.0
        avg_comp_rate = round(sum(comp_rates_list) / len(comp_rates_list), 1) if comp_rates_list else 100.0
        avg_task_eff = round(sum(task_effs_list) / len(task_effs_list), 1) if task_effs_list else 0.0

        report_data.append({
            "user_id": u.id,
            "user_name": u.name,
            "total_worked_hours": total_worked_hours_range,
            "total_login_hours": round(total_login_hours_range, 2),
            "total_break_hours": round(total_break_hours_range, 2),
            "daily_efficiency": avg_efficiency_range,
            "inprogress_count": len(unique_tasks_worked_range),
            "completed_count": total_completed_range,
            "pending_count": latest_pending_count,
            "workload_health": workload_health_range,
            "eff_time_utilization": avg_time_util,
            "eff_completion_rate": avg_comp_rate,
            "eff_task_efficiency": avg_task_eff,
            "days": days_data
        })
        
    return report_data
