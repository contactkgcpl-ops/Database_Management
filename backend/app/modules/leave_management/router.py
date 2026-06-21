from datetime import date, datetime
import calendar
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from app.db import get_db
from app.deps import current_user, require_any_permission, require_permission
from app.models import User, LeaveRequest, LeaveApproval
from app.schemas import (
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveApprovalAction,
    LeaveApprovalOut,
    LeaveCalendarItem,
    LeaveApproverInfo,
)
from app.modules.leave_management.services import (
    apply_leave,
    process_approval_action,
    cancel_leave_request,
    update_leave_request,
    get_approvers_for_user,
    get_subordinates_for_user,
)

router = APIRouter(prefix="/leaves", tags=["leaves"])

@router.post("/upload")
def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(current_user)
):
    """
    Upload leave attachment file.
    """
    upload_dir = "storage/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": f"/uploads/{filename}", "original_name": file.filename}

# Static Indian Holidays for calendar rendering
HOLIDAYS = [
    (1, 1, "New Year's Day"),
    (1, 26, "Republic Day"),
    (8, 15, "Independence Day"),
    (10, 2, "Gandhi Jayanti"),
    (12, 25, "Christmas Day"),
]

def to_leave_request_out(request: LeaveRequest) -> LeaveRequestOut:
    approvals_out = []
    for approval in request.approvals:
        approver_name = approval.approver.name if approval.approver else None
        approver_role = approval.approver.role.name if (approval.approver and approval.approver.role) else None
        approvals_out.append(
            LeaveApprovalOut(
                id=approval.id,
                leave_id=approval.leave_id,
                approver_id=approval.approver_id,
                approver_name=approver_name,
                approver_role=approver_role,
                status=approval.status,
                remark=approval.remark,
                action_date=approval.action_date
            )
        )
        
    return LeaveRequestOut(
        id=request.id,
        user_id=request.user_id,
        employee_name=request.user.name if request.user else None,
        department=None,
        designation=request.user.role.name if (request.user and request.user.role) else None,
        title=request.title,
        leave_type=request.leave_type,
        half_day_type=request.half_day_type,
        from_date=request.from_date,
        to_date=request.to_date,
        total_days=request.total_days,
        description=request.description,
        attachment=request.attachment,
        total_approvers=request.total_approvers,
        required_approvals=request.required_approvals,
        approved_count=request.approved_count,
        rejected_count=request.rejected_count,
        pending_count=request.pending_count,
        status=request.status,
        created_at=request.created_at,
        updated_at=request.updated_at,
        start_half_day=request.start_half_day,
        end_half_day=request.end_half_day,
        half_day_details=request.half_day_details,
        cancel_reason=request.cancel_reason,
        approvals=approvals_out
    )

@router.post("/apply", response_model=LeaveRequestOut)
def request_leave(
    data: LeaveRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leave.apply"))
):
    target_user = user
    if data.user_id is not None and data.user_id != user.id:
        from app.deps import user_permission_codes
        user_perms = user_permission_codes(user)
        if "leave.manage" not in user_perms:
            raise HTTPException(status_code=403, detail="You do not have permission to apply for leaves on behalf of other users.")
        target_user = db.query(User).filter(User.id == data.user_id).first()
        if not target_user:
            raise HTTPException(status_code=400, detail="Target user not found.")
            
    try:
        req = apply_leave(db, target_user, data)
        # Fetch with joined relationships to avoid lazy loading issues
        req = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .filter(LeaveRequest.id == req.id)
            .first()
        )
        return to_leave_request_out(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/my-approvers", response_model=list[LeaveApproverInfo])
def get_my_approvers(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    Get the chain of parent approvers for the current user or a target user.
    """
    target_id = user.id
    if user_id is not None and user_id != user.id:
        from app.deps import user_permission_codes
        user_perms = user_permission_codes(user)
        if "leave.manage" not in user_perms:
            raise HTTPException(status_code=403, detail="You do not have permission to view other users' approver hierarchy.")
        target_id = user_id

    approvers = get_approvers_for_user(db, target_id)
    return [
        LeaveApproverInfo(
            id=appr.id,
            name=appr.name,
            email=appr.email,
            role_name=appr.role.name if appr.role else None
        )
        for appr in approvers
    ]

@router.get("/my", response_model=list[LeaveRequestOut])
def get_my_leaves(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("leave.view", "leave.apply"))
):
    """
    Get personal leave history or a target user's leave history.
    """
    target_id = user.id
    if user_id is not None and user_id != user.id:
        from app.deps import user_permission_codes
        user_perms = user_permission_codes(user)
        if "leave.manage" not in user_perms:
            raise HTTPException(status_code=403, detail="You do not have permission to view other users' leaves.")
        target_id = user_id

    requests = (
        db.query(LeaveRequest)
        .options(
            joinedload(LeaveRequest.user),
            joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
        )
        .filter(LeaveRequest.user_id == target_id)
        .order_by(LeaveRequest.id.desc())
        .all()
    )
    return [to_leave_request_out(r) for r in requests]

@router.get("/requests", response_model=list[LeaveRequestOut])
def get_leave_requests(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("leave.approve", "leave.manage"))
):
    """
    Get leaves of subordinates (for managers/parents) or all leaves (for admins/managers).
    """
    from app.deps import user_permission_codes
    user_perms = user_permission_codes(user)
    
    if "leave.manage" in user_perms:
        requests = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .order_by(LeaveRequest.id.desc())
            .all()
        )
    else:
        sub_ids = get_subordinates_for_user(db, user.id)
        if not sub_ids:
            return []
        requests = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .filter(LeaveRequest.user_id.in_(sub_ids))
            .order_by(LeaveRequest.id.desc())
            .all()
        )
    return [to_leave_request_out(r) for r in requests]

@router.get("/approvals", response_model=list[LeaveRequestOut])
def get_approvals(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leave.approve"))
):
    """
    Get leave requests assigned to the current user for approval.
    """
    requests = (
        db.query(LeaveRequest)
        .join(LeaveApproval)
        .options(
            joinedload(LeaveRequest.user),
            joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
        )
        .filter(LeaveApproval.approver_id == user.id)
        .order_by(LeaveRequest.status.desc(), LeaveRequest.id.desc())
        .all()
    )
    return [to_leave_request_out(r) for r in requests]

@router.post("/{leave_id}/approve", response_model=LeaveRequestOut)
def approve_leave(
    leave_id: int,
    action: LeaveApprovalAction,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("leave.approve"))
):
    """
    Action (Approve/Reject) on a pending leave request.
    """
    try:
        req = process_approval_action(db, leave_id, user, action)
        req = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .filter(LeaveRequest.id == req.id)
            .first()
        )
        return to_leave_request_out(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{leave_id}/cancel", response_model=LeaveRequestOut)
def cancel_leave(
    leave_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("leave.apply", "leave.approve", "leave.manage"))
):
    """
    Cancel a pending leave request.
    """
    try:
        req = cancel_leave_request(db, leave_id, user, reason)
        req = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .filter(LeaveRequest.id == req.id)
            .first()
        )
        return to_leave_request_out(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/calendar", response_model=list[LeaveCalendarItem])
def get_calendar(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission("leave.calendar", "leave.view"))
):
    """
    Get leave calendar with approved/pending leaves, static holidays, and Sundays for the month.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month.")
        
    start_date = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end_date = date(year, month, last_day)
    
    calendar_items = []
    
    # 1. Fetch Leaves
    leaves = (
        db.query(LeaveRequest)
        .options(joinedload(LeaveRequest.user))
        .filter(
            LeaveRequest.status.in_(["Approved", "Pending"]),
            LeaveRequest.from_date <= end_date,
            LeaveRequest.to_date >= start_date
        )
        .all()
    )
    
    for leave in leaves:
        calendar_items.append(
            LeaveCalendarItem(
                id=leave.id,
                type="leave",
                title=f"{leave.user.name} ({leave.title})",
                from_date=max(start_date, leave.from_date),
                to_date=min(end_date, leave.to_date),
                status=leave.status
            )
        )
        
    # 2. Add Sundays
    curr = start_date
    while curr <= end_date:
        if curr.weekday() == 6:  # Sunday
            calendar_items.append(
                LeaveCalendarItem(
                    type="week_off",
                    title="Sunday",
                    from_date=curr,
                    to_date=curr,
                    status="Approved"
                )
            )
        curr += date.resolution
        
    # 3. Add Static Holidays
    for h_month, h_day, h_title in HOLIDAYS:
        if h_month == month:
            holiday_date = date(year, month, h_day)
            calendar_items.append(
                LeaveCalendarItem(
                    type="holiday",
                    title=h_title,
                    from_date=holiday_date,
                    to_date=holiday_date,
                    status="Approved"
                )
            )
            
    return calendar_items

@router.get("/{leave_id}", response_model=LeaveRequestOut)
def get_leave_details(
    leave_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    Get detailed leave request by ID.
    Enforces that user is either applicant, approver, or has leave.manage/leave.approve permission.
    """
    req = (
        db.query(LeaveRequest)
        .options(
            joinedload(LeaveRequest.user),
            joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
        )
        .filter(LeaveRequest.id == leave_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found.")
        
    # Check permissions
    has_access = False
    
    # 1. Applicant
    if req.user_id == user.id:
        has_access = True
        
    # 2. Approver in the list
    elif any(a.approver_id == user.id for a in req.approvals):
        has_access = True
        
    # 3. Direct permissions
    else:
        from app.deps import user_permission_codes
        user_perms = user_permission_codes(user)
        if "leave.manage" in user_perms or "leave.approve" in user_perms:
            has_access = True
            
    if not has_access:
        raise HTTPException(status_code=403, detail="You do not have permission to view this leave request.")
        
    return to_leave_request_out(req)

@router.put("/{leave_id}", response_model=LeaveRequestOut)
def update_leave(
    leave_id: int,
    data: LeaveRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    Updates a pending leave request. Only allowed for the applicant.
    """
    try:
        req = update_leave_request(db, leave_id, user, data)
        # Fetch with joined relationships to avoid lazy loading issues
        req = (
            db.query(LeaveRequest)
            .options(
                joinedload(LeaveRequest.user),
                joinedload(LeaveRequest.approvals).joinedload(LeaveApproval.approver)
            )
            .filter(LeaveRequest.id == req.id)
            .first()
        )
        return to_leave_request_out(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
