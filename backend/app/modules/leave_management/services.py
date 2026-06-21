from datetime import date, datetime, timedelta
import json
import math
from sqlalchemy.orm import Session
from app.models import User, Role, RolePermission, Permission, LeaveRequest, LeaveApproval
from app.schemas import LeaveRequestCreate, LeaveApprovalAction

def get_approvers_for_user(db: Session, user_id: int) -> list[User]:
    """
    Resolves the chain of approvers by traversing the reporting hierarchy (parent_id).
    Falls back to all active users with 'leave.approve' permission if hierarchy is empty.
    """
    approvers = []
    visited = {user_id}
    
    current_user = db.query(User).filter(User.id == user_id).first()
    if not current_user:
        return []
        
    curr_parent_id = current_user.parent_id
    while curr_parent_id and curr_parent_id not in visited:
        parent = db.query(User).filter(User.id == curr_parent_id).first()
        if not parent:
            break
        approvers.append(parent)
        visited.add(curr_parent_id)
        curr_parent_id = parent.parent_id
        
    if not approvers:
        # Fallback to active users with 'leave.approve' permission
        # Exclude the requesting user from approving their own leaves
        fallback_users = (
            db.query(User)
            .join(Role)
            .join(RolePermission)
            .join(Permission)
            .filter(Permission.code == "leave.approve")
            .filter(User.is_active == True)
            .filter(User.id != user_id)
            .all()
        )
        return fallback_users
        
    return approvers

def is_date_a_leave(dt: date, user_id: int | None, db: Session | None, from_date: date, to_date: date, details_map: dict) -> bool:
    # 1. Check if inside current request first
    if from_date <= dt <= to_date:
        dt_str = dt.strftime("%Y-%m-%d")
        if dt_str in details_map:
            return details_map[dt_str] not in ["No Leave", "Week Off", "Full Work Day"]
        if details_map:
            return False
        if dt.weekday() == 6:
            return False
        return True

    # 2. Check database for existing approved/pending leave requests
    if db and user_id:
        exists = db.query(LeaveRequest).filter(
            LeaveRequest.user_id == user_id,
            LeaveRequest.status.in_(["Pending", "Approved"]),
            LeaveRequest.from_date <= dt,
            LeaveRequest.to_date >= dt
        ).first()
        if exists:
            if exists.half_day_details:
                try:
                    db_map = json.loads(exists.half_day_details)
                    dt_str = dt.strftime("%Y-%m-%d")
                    if dt_str in db_map:
                        return db_map[dt_str] not in ["No Leave", "Week Off", "Full Work Day"]
                    return False
                except Exception:
                    pass
            if dt.weekday() == 6:
                return False
            return True
            
    return False

def calculate_leave_days(from_date: date, to_date: date, leave_type: str, start_half: bool = False, end_half: bool = False, half_day_details: str | None = None, db: Session | None = None, user_id: int | None = None) -> float:
    """
    Calculates the total days for a leave.
    If it's a Half Day, it's always 0.5.
    Otherwise, counts inclusive days. Sundays are standard week-offs unless explicitly configured or sandwiched.
    """
    if leave_type == "Half Day":
        return 0.5
        
    details_map = {}
    if half_day_details:
        try:
            details_map = json.loads(half_day_details)
        except Exception:
            pass

    total_days = 0.0
    curr = from_date
    while curr <= to_date:
        curr_str = curr.strftime("%Y-%m-%d")
        is_in_details = curr_str in details_map
        
        # Check sandwich rule if it is Sunday (weekday == 6)
        is_sandwiched_sunday = False
        if curr.weekday() == 6:
            if not is_in_details or details_map[curr_str] in ["No Leave", "Week Off"]:
                sat = curr - timedelta(days=1)
                mon = curr + timedelta(days=1)
                if is_date_a_leave(sat, user_id, db, from_date, to_date, details_map) and \
                   is_date_a_leave(mon, user_id, db, from_date, to_date, details_map):
                    is_sandwiched_sunday = True

        if curr.weekday() != 6 or is_in_details or is_sandwiched_sunday:
            day_val = 1.0
            if is_sandwiched_sunday:
                day_val = 1.0  # Sandwiched Sunday counts as 1.0 full day
            elif is_in_details:
                val = details_map[curr_str]
                if val in ["First Half", "Second Half", "Half Day"]:
                    day_val = 0.5
                elif val in ["Full Work Day", "No Leave", "Week Off"]:
                    day_val = 0.0
                elif val == "Full Day":
                    day_val = 1.0
            else:
                if details_map:
                    day_val = 0.0
                else:
                    if curr == from_date and start_half:
                        day_val = 0.5
                    elif curr == to_date and end_half:
                        day_val = 0.5
                    
                    if curr == from_date and curr == to_date and start_half and end_half:
                        day_val = 0.5
            total_days += day_val
        curr += timedelta(days=1)
        
    # Check adjacent Sundays (sandwiched across boundary of current request range)
    if from_date.weekday() == 0:  # Monday
        sunday = from_date - timedelta(days=1)
        saturday = from_date - timedelta(days=2)
        if is_date_a_leave(saturday, user_id, db, from_date, to_date, details_map):
            total_days += 1.0
            
    if to_date.weekday() == 5:  # Saturday
        sunday = to_date + timedelta(days=1)
        monday = to_date + timedelta(days=2)
        if is_date_a_leave(monday, user_id, db, from_date, to_date, details_map):
            total_days += 1.0

    return total_days

def apply_leave(db: Session, user: User, data: LeaveRequestCreate) -> LeaveRequest:
    """
    Computes approvers, calculates days, validates date selections, and creates the leave request.
    """
    if data.from_date > data.to_date:
        raise ValueError("From Date cannot be after To Date.")

    # Ensure no Sundays are selected for leave
    if data.half_day_details:
        try:
            import json
            from datetime import datetime
            details = json.loads(data.half_day_details)
            for dt_str, val in details.items():
                if val not in ["No Leave", "Week Off", "Full Work Day"]:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d").date()
                    if dt.weekday() == 6:
                        raise ValueError("Leaves cannot be applied on Sundays.")
        except json.JSONDecodeError:
            pass
        
    # Check for overlapping leaves
    overlapping = db.query(LeaveRequest).filter(
        LeaveRequest.user_id == user.id,
        LeaveRequest.status.in_(["Pending", "Approved"]),
        LeaveRequest.from_date <= data.to_date,
        LeaveRequest.to_date >= data.from_date
    ).all()
    
    if overlapping:
        new_leaves = {}
        if data.half_day_details:
            try:
                new_leaves = json.loads(data.half_day_details)
            except Exception:
                pass
        else:
            curr = data.from_date
            while curr <= data.to_date:
                curr_str = curr.strftime("%Y-%m-%d")
                if curr.weekday() != 6:
                    val = "Full Day"
                    if curr == data.from_date and data.start_half_day:
                        val = "First Half"
                    elif curr == data.to_date and data.end_half_day:
                        val = "First Half"
                    new_leaves[curr_str] = val
                curr += timedelta(days=1)

        for req in overlapping:
            existing_leaves = {}
            if req.half_day_details:
                try:
                    existing_leaves = json.loads(req.half_day_details)
                except Exception:
                    pass
            else:
                curr = req.from_date
                while curr <= req.to_date:
                    curr_str = curr.strftime("%Y-%m-%d")
                    if curr.weekday() != 6:
                        val = "Full Day"
                        if curr == req.from_date and req.start_half_day:
                            val = "First Half"
                        elif curr == req.to_date and req.end_half_day:
                            val = "First Half"
                        existing_leaves[curr_str] = val
                    curr += timedelta(days=1)

            for dt_str, new_type in new_leaves.items():
                if new_type in ["No Leave", "Week Off", "Full Work Day"]:
                    continue
                if dt_str in existing_leaves:
                    existing_type = existing_leaves[dt_str]
                    if existing_type in ["No Leave", "Week Off", "Full Work Day"]:
                        continue
                    if (new_type in ["First Half", "Second Half", "Half Day"]) and \
                       (existing_type in ["First Half", "Second Half", "Half Day"]):
                        if new_type == existing_type or new_type == "Half Day" or existing_type == "Half Day":
                            raise ValueError(f"You have already applied for leave ({existing_type}) on {dt_str}.")
                    else:
                        raise ValueError(f"You have already applied for leave ({existing_type}) on {dt_str}.")
        
    # Calculate days requested
    requested_days = calculate_leave_days(
        data.from_date, 
        data.to_date, 
        data.leave_type,
        data.start_half_day,
        data.end_half_day,
        data.half_day_details,
        db=db,
        user_id=user.id
    )
    if requested_days <= 0:
        raise ValueError("Total leave days calculated is 0.")
        
    # Resolve approvers
    approvers = get_approvers_for_user(db, user.id)
    total_approvers = len(approvers)
    
    if total_approvers == 0:
        raise ValueError("No approvers assigned to approve this leave request.")
        
    # Majority approval logic: floor(N / 2) + 1
    required_approvals = math.floor(total_approvers / 2) + 1
    
    # Create Leave Request
    new_request = LeaveRequest(
        user_id=user.id,
        title=data.title,
        leave_type=data.leave_type,
        half_day_type=data.half_day_type,
        from_date=data.from_date,
        to_date=data.to_date,
        total_days=requested_days,
        description=data.description,
        attachment=data.attachment,
        total_approvers=total_approvers,
        required_approvals=required_approvals,
        approved_count=0,
        rejected_count=0,
        pending_count=total_approvers,
        status="Pending",
        start_half_day=data.start_half_day,
        end_half_day=data.end_half_day,
        half_day_details=data.half_day_details
    )
    
    db.add(new_request)
    db.flush()  # gets new_request.id
    
    # Create Leave Approvals
    for approver in approvers:
        approval = LeaveApproval(
            leave_id=new_request.id,
            approver_id=approver.id,
            status="Pending"
        )
        db.add(approval)
        
    db.commit()
    db.refresh(new_request)
    return new_request

def process_approval_action(db: Session, leave_id: int, approver: User, action: LeaveApprovalAction) -> LeaveRequest:
    """
    Records an approver's vote and evaluates transitions.
    - If 1 rejection: instantly Rejected.
    - If approved_count >= required_approvals: Approved.
    """
    # Fetch leave request
    request = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not request:
        raise ValueError("Leave request not found.")
        
    if request.status != "Pending":
        raise ValueError(f"Leave request is already {request.status} and cannot be modified.")
        
    # Fetch approval record for this approver
    approval = db.query(LeaveApproval).filter(
        LeaveApproval.leave_id == leave_id,
        LeaveApproval.approver_id == approver.id
    ).first()
    
    if not approval:
        raise ValueError("You are not assigned as an approver for this leave request.")
        
    if approval.status != "Pending":
        raise ValueError(f"You have already voted '{approval.status}' for this request.")
        
    # Record action
    approval.status = action.status
    approval.remark = action.remark
    approval.action_date = datetime.utcnow()
    
    # Recalculate counts
    approvals = db.query(LeaveApproval).filter(LeaveApproval.leave_id == leave_id).all()
    approved_count = sum(1 for a in approvals if a.status == "Approved")
    rejected_count = sum(1 for a in approvals if a.status == "Rejected")
    pending_count = sum(1 for a in approvals if a.status == "Pending")
    
    request.approved_count = approved_count
    request.rejected_count = rejected_count
    request.pending_count = pending_count
    
    if rejected_count >= 1:
        request.status = "Rejected"
    elif approved_count >= request.required_approvals:
        request.status = "Approved"
    elif pending_count == 0:
        if approved_count >= request.required_approvals:
            request.status = "Approved"
        else:
            request.status = "Rejected"
            
    db.commit()
    db.refresh(request)
    return request

def cancel_leave_request(db: Session, leave_id: int, user: User, reason: str | None = None) -> LeaveRequest:
    """
    Cancels a leave request. Only possible if the request is still Pending, or Approved (by manager/approver).
    """
    request = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not request:
        raise ValueError("Leave request not found.")
        
    from app.deps import user_permission_codes
    user_perms = user_permission_codes(user)
    
    is_owner = request.user_id == user.id
    has_manage = "leave.manage" in user_perms
    has_approve = "leave.approve" in user_perms
    
    if not is_owner and not has_manage and not has_approve:
        raise ValueError("You do not have permission to cancel this leave request.")
        
    if is_owner and not (has_manage or has_approve):
        if request.status != "Pending":
            raise ValueError(f"Cannot cancel a leave request with status '{request.status}'.")
        if request.approved_count > 0:
            raise ValueError("Cannot cancel this leave request because it has already been approved by at least one approver.")
    else:
        if request.status not in ["Pending", "Approved"]:
            raise ValueError(f"Cannot cancel a leave request with status '{request.status}'.")
        
    request.status = "Cancelled"
    request.cancel_reason = reason
    
    # Cancel pending approvals
    db.query(LeaveApproval).filter(
        LeaveApproval.leave_id == leave_id,
        LeaveApproval.status == "Pending"
    ).update({"status": "Cancelled"}, synchronize_session=False)
    
    db.commit()
    db.refresh(request)
    return request

def update_leave_request(db: Session, leave_id: int, user: User, data: LeaveRequestCreate) -> LeaveRequest:
    """
    Updates a pending leave request details. Only possible if the request is still Pending and has no approvals.
    """
    req = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not req:
        raise ValueError("Leave request not found.")
        
    from app.deps import user_permission_codes
    user_perms = user_permission_codes(user)
    if req.user_id != user.id and "leave.manage" not in user_perms:
        raise ValueError("You can only edit your own leave requests unless you have 'leave.manage' permission.")
        
    if req.status != "Pending":
        raise ValueError("Only pending leave requests can be edited.")
        
    if req.approved_count > 0:
        raise ValueError("Cannot edit this leave request because it has already received approvals.")
        
    if data.from_date > data.to_date:
        raise ValueError("From Date cannot be after To Date.")

    # Ensure no Sundays are selected for leave
    if data.half_day_details:
        try:
            import json
            from datetime import datetime
            details = json.loads(data.half_day_details)
            for dt_str, val in details.items():
                if val not in ["No Leave", "Week Off", "Full Work Day"]:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d").date()
                    if dt.weekday() == 6:
                        raise ValueError("Leaves cannot be applied on Sundays.")
        except json.JSONDecodeError:
            pass
        
    # Check for overlapping leaves excluding this request itself
    overlapping = db.query(LeaveRequest).filter(
        LeaveRequest.user_id == req.user_id,
        LeaveRequest.status.in_(["Pending", "Approved"]),
        LeaveRequest.id != leave_id,
        LeaveRequest.from_date <= data.to_date,
        LeaveRequest.to_date >= data.from_date
    ).all()
    
    if overlapping:
        new_leaves = {}
        if data.half_day_details:
            try:
                new_leaves = json.loads(data.half_day_details)
            except Exception:
                pass
        else:
            curr = data.from_date
            while curr <= data.to_date:
                curr_str = curr.strftime("%Y-%m-%d")
                if curr.weekday() != 6:
                    val = "Full Day"
                    if curr == data.from_date and data.start_half_day:
                        val = "First Half"
                    elif curr == data.to_date and data.end_half_day:
                        val = "First Half"
                    new_leaves[curr_str] = val
                curr += timedelta(days=1)

        for other_req in overlapping:
            existing_leaves = {}
            if other_req.half_day_details:
                try:
                    existing_leaves = json.loads(other_req.half_day_details)
                except Exception:
                    pass
            else:
                curr = other_req.from_date
                while curr <= other_req.to_date:
                    curr_str = curr.strftime("%Y-%m-%d")
                    if curr.weekday() != 6:
                        val = "Full Day"
                        if curr == other_req.from_date and other_req.start_half_day:
                            val = "First Half"
                        elif curr == other_req.to_date and other_req.end_half_day:
                            val = "First Half"
                        existing_leaves[curr_str] = val
                    curr += timedelta(days=1)

            for dt_str, new_type in new_leaves.items():
                if new_type in ["No Leave", "Week Off", "Full Work Day"]:
                    continue
                if dt_str in existing_leaves:
                    existing_type = existing_leaves[dt_str]
                    if existing_type in ["No Leave", "Week Off", "Full Work Day"]:
                        continue
                    if (new_type in ["First Half", "Second Half", "Half Day"]) and \
                       (existing_type in ["First Half", "Second Half", "Half Day"]):
                        if new_type == existing_type or new_type == "Half Day" or existing_type == "Half Day":
                            raise ValueError(f"You have already applied for leave ({existing_type}) on {dt_str}.")
                    else:
                        raise ValueError(f"You have already applied for leave ({existing_type}) on {dt_str}.")

    # Calculate days requested
    requested_days = calculate_leave_days(
        data.from_date, 
        data.to_date, 
        data.leave_type,
        data.start_half_day,
        data.end_half_day,
        data.half_day_details,
        db=db,
        user_id=req.user_id
    )
    if requested_days <= 0:
        raise ValueError("Total leave days calculated is 0.")
        
    # Resolve approvers
    approvers = get_approvers_for_user(db, req.user_id)
    total_approvers = len(approvers)
    
    if total_approvers == 0:
        raise ValueError("No approvers assigned to approve this leave request.")
        
    required_approvals = math.floor(total_approvers / 2) + 1
    
    # Update fields
    req.title = data.title
    req.leave_type = data.leave_type
    req.half_day_type = data.half_day_type
    req.from_date = data.from_date
    req.to_date = data.to_date
    req.total_days = requested_days
    req.description = data.description
    req.attachment = data.attachment
    req.start_half_day = data.start_half_day
    req.end_half_day = data.end_half_day
    req.half_day_details = data.half_day_details
    req.total_approvers = total_approvers
    req.required_approvals = required_approvals
    req.approved_count = 0
    req.rejected_count = 0
    req.pending_count = total_approvers
    req.status = "Pending"
    
    # Delete old approvals and recreate them
    db.query(LeaveApproval).filter(LeaveApproval.leave_id == leave_id).delete()
    
    for approver in approvers:
        approval = LeaveApproval(
            leave_id=leave_id,
            approver_id=approver.id,
            status="Pending"
        )
        db.add(approval)
        
    db.commit()
    db.refresh(req)
    return req


def get_subordinates_for_user(db: Session, parent_id: int) -> list[int]:
    """
    Returns a list of user IDs that report to the parent_id recursively.
    """
    subordinates = []
    queue = [parent_id]
    visited = {parent_id}
    while queue:
        curr_id = queue.pop(0)
        children = db.query(User.id).filter(User.parent_id == curr_id).all()
        for (child_id,) in children:
            if child_id not in visited:
                visited.add(child_id)
                subordinates.append(child_id)
                queue.append(child_id)
    return subordinates

