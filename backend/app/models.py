from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Role(Base, TimestampMixin):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    users: Mapped[list["User"]] = relationship(back_populates="role")
    permissions: Mapped[list["RolePermission"]] = relationship(cascade="all, delete-orphan", back_populates="role")


class Permission(Base, TimestampMixin):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))
    menu_key: Mapped[str] = mapped_column(String(80), index=True)
    menu_label: Mapped[str] = mapped_column(String(120))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    roles: Mapped[list["RolePermission"]] = relationship(cascade="all, delete-orphan", back_populates="permission")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship(back_populates="roles")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    profile_image_url: Mapped[str | None] = mapped_column(Text)
    role: Mapped[Role | None] = relationship(back_populates="users")
    parent: Mapped["User | None"] = relationship(remote_side=[id])


class Property(Base, TimestampMixin):
    __tablename__ = "properties"
    __table_args__ = (
        UniqueConstraint("group", "name", name="uq_property_group_name"),
        UniqueConstraint("field_key", name="uq_property_field_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    field_key: Mapped[str] = mapped_column(String(100), index=True)
    object_type: Mapped[str] = mapped_column(String(40), index=True)
    group: Mapped[str] = mapped_column(String(80), index=True, default="General")
    entity_type: Mapped[str] = mapped_column("group_type", String(50), index=True, default="company")
    description: Mapped[str | None] = mapped_column(Text)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_unique: Mapped[bool] = mapped_column(Boolean, default=False)
    is_multi_value: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    show_on_grid: Mapped[bool] = mapped_column(Boolean, default=False)
    grid_order: Mapped[int] = mapped_column(Integer, default=0)
    grid_width: Mapped[int] = mapped_column(Integer, default=160)
    filter_type: Mapped[str] = mapped_column(String(50), default="text")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    creator: Mapped[User | None] = relationship()
    options: Mapped[list["PropertyOption"]] = relationship(cascade="all, delete-orphan", back_populates="property", order_by="PropertyOption.sort_order")
    grids: Mapped[list["PropertyGrid"]] = relationship(cascade="all, delete-orphan", back_populates="property")


class DisplayGrid(Base, TimestampMixin):
    __tablename__ = "display_grids"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column("grid_key", String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    properties: Mapped[list["PropertyGrid"]] = relationship(cascade="all, delete-orphan", back_populates="grid")


class PropertyGrid(Base, TimestampMixin):
    __tablename__ = "property_grids"
    __table_args__ = (UniqueConstraint("property_id", "grid_id", name="uq_property_grid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    grid_id: Mapped[int] = mapped_column(ForeignKey("display_grids.id", ondelete="CASCADE"), index=True)
    grid_order: Mapped[int] = mapped_column(Integer, default=0)
    grid_width: Mapped[int] = mapped_column(Integer, default=160)
    property: Mapped[Property] = relationship(back_populates="grids")
    grid: Mapped[DisplayGrid] = relationship(back_populates="properties")


class PropertyOption(Base, TimestampMixin):
    __tablename__ = "property_options"
    __table_args__ = (UniqueConstraint("property_id", "value", name="uq_property_option_value"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(160))
    value: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    property: Mapped[Property] = relationship(back_populates="options")


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(180), index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    
    creator: Mapped[User | None] = relationship(foreign_keys=[created_by])
    property_values: Mapped[list["CompanyPropertyValue"]] = relationship(cascade="all, delete-orphan", back_populates="company")
    lead_assignments: Mapped[list["LeadManage"]] = relationship(cascade="all, delete-orphan", back_populates="company")


class CompanyPropertyValue(Base, TimestampMixin):
    __tablename__ = "company_property_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    value: Mapped[str] = mapped_column(Text)
    company: Mapped[Company] = relationship(back_populates="property_values")
    property: Mapped[Property] = relationship()


class LeadManage(Base, TimestampMixin):
    __tablename__ = "lead_manage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assigned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status: Mapped[str | None] = mapped_column(Text)
    is_inquiry: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    follow_up_reminder_date: Mapped[datetime | None] = mapped_column(DateTime)
    follow_up_date: Mapped[datetime | None] = mapped_column(DateTime)

    company: Mapped[Company] = relationship(back_populates="lead_assignments")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])
    assigned_by: Mapped[User | None] = relationship(foreign_keys=[assigned_by_id])


class LeadHistory(Base, TimestampMixin):
    __tablename__ = "lead_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    property_key: Mapped[str] = mapped_column(String(100), index=True)
    property_name: Mapped[str] = mapped_column(String(160))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    
    company: Mapped[Company] = relationship()
    user: Mapped[User | None] = relationship(foreign_keys=[user_id])


class LeadFollowUp(Base, TimestampMixin):
    __tablename__ = "lead_followups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    scheduled_date: Mapped[datetime] = mapped_column(DateTime)
    actual_date: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="Pending") # Pending, Completed, Cancelled
    remark: Mapped[str | None] = mapped_column(Text)

    company: Mapped[Company] = relationship()
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])


class Requirement(Base, TimestampMixin):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="Medium")  # Low, Medium, High, Urgent
    status: Mapped[str] = mapped_column(String(30), default="Open")  # Open, In Progress, Done, Closed
    due_date: Mapped[datetime | None] = mapped_column(DateTime)
    added_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    added_by: Mapped[User | None] = relationship(foreign_keys=[added_by_id])
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])
    notifications: Mapped[list["RequirementNotification"]] = relationship(
        cascade="all, delete-orphan", back_populates="requirement"
    )
    history: Mapped[list["RequirementHistory"]] = relationship(
        cascade="all, delete-orphan", back_populates="requirement", order_by="RequirementHistory.created_at"
    )


class RequirementNotification(Base, TimestampMixin):
    __tablename__ = "requirement_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(30), default="assigned")  # assigned, completed, comment
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)

    requirement: Mapped[Requirement] = relationship(back_populates="notifications")
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class RequirementHistory(Base, TimestampMixin):
    __tablename__ = "requirement_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    type: Mapped[str] = mapped_column(String(30))  # created, status_change, comment, read
    remark: Mapped[str | None] = mapped_column(Text)

    requirement: Mapped[Requirement] = relationship(back_populates="history")
    user: Mapped[User | None] = relationship(foreign_keys=[user_id])


class UserTimeLog(Base, TimestampMixin):
    __tablename__ = "user_time_logs"
    __table_args__ = (UniqueConstraint("user_id", "work_date", name="uq_user_time_log_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    login_at: Mapped[datetime] = mapped_column(DateTime)
    logout_at: Mapped[datetime | None] = mapped_column(DateTime)
    total_break_seconds: Mapped[int] = mapped_column(Integer, default=0)
    total_work_seconds: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    breaks: Mapped[list["UserBreakLog"]] = relationship(
        cascade="all, delete-orphan", back_populates="time_log", order_by="UserBreakLog.break_start"
    )


class UserBreakLog(Base, TimestampMixin):
    __tablename__ = "user_break_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    time_log_id: Mapped[int] = mapped_column(ForeignKey("user_time_logs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    break_start: Mapped[datetime] = mapped_column(DateTime)
    break_end: Mapped[datetime | None] = mapped_column(DateTime)
    break_seconds: Mapped[int] = mapped_column(Integer, default=0)

    time_log: Mapped[UserTimeLog] = relationship(back_populates="breaks")
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class HourlyReport(Base, TimestampMixin):
    __tablename__ = "hourly_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str] = mapped_column(String(10)) # e.g. "10:00"
    end_time: Mapped[str] = mapped_column(String(10))   # e.g. "11:00"
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="Draft") # Draft, Submitted
    work_type: Mapped[str] = mapped_column(String(50), default="General", server_default="General")

    user: Mapped[User] = relationship()
    calls: Mapped[list["HourlyReportCall"]] = relationship(cascade="all, delete-orphan", back_populates="report")


class HourlyReportCall(Base, TimestampMixin):
    __tablename__ = "hourly_report_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("hourly_reports.id", ondelete="CASCADE"), index=True)
    contact_number: Mapped[str] = mapped_column(String(50))
    contact_person: Mapped[str] = mapped_column(String(120))
    contact_for: Mapped[str] = mapped_column(Text)

    report: Mapped[HourlyReport] = relationship(back_populates="calls")


class GlobalChatMessage(Base, TimestampMixin):
    __tablename__ = "global_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    message: Mapped[str] = mapped_column(Text)
    
    user: Mapped[User | None] = relationship()


class UserChatState(Base, TimestampMixin):
    __tablename__ = "user_chat_states"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_read_message_id: Mapped[int | None] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship()


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="TODO")  # TODO, Ongoing, Hold, Completed
    due_date: Mapped[datetime | None] = mapped_column(DateTime) # Store in UTC
    eta_hours: Mapped[float] = mapped_column(Float, default=0.0) # Estimated hours
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])
    timer_logs: Mapped[list["TaskTimerLog"]] = relationship(cascade="all, delete-orphan", back_populates="task")
    comments: Mapped[list["TaskComment"]] = relationship(cascade="all, delete-orphan", back_populates="task")
    history_entries: Mapped[list["TaskHistory"]] = relationship(cascade="all, delete-orphan", back_populates="task", order_by="TaskHistory.created_at")


class TaskTimerLog(Base, TimestampMixin):
    __tablename__ = "task_timer_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    work_type: Mapped[str] = mapped_column(String(80), default="Development") # e.g. Development, Code Review, Team Discussion
    work_description: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[datetime] = mapped_column(DateTime) # UTC
    end_time: Mapped[datetime | None] = mapped_column(DateTime) # UTC (Null if active)

    task: Mapped[Task] = relationship(back_populates="timer_logs")
    user: Mapped[User] = relationship()


class TaskHistory(Base, TimestampMixin):
    __tablename__ = "task_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(100)) # e.g. "created", "status_changed", "assignee_changed", "description_updated", "timer_started", "timer_stopped"
    details: Mapped[str | None] = mapped_column(Text) # e.g. "Changed status from TODO to Ongoing" or "Timer stopped (1h 15m)"

    task: Mapped[Task] = relationship(back_populates="history_entries")
    user: Mapped[User | None] = relationship()


class TaskComment(Base, TimestampMixin):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    comment: Mapped[str] = mapped_column(Text)

    task: Mapped[Task] = relationship(back_populates="comments")
    user: Mapped[User] = relationship()


class TaskNotification(Base, TimestampMixin):
    __tablename__ = "task_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # Recipient
    type: Mapped[str] = mapped_column(String(30))  # "assigned", "comment", "completed"
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)

    task: Mapped[Task] = relationship()


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(180), index=True)
    vendor_name: Mapped[str] = mapped_column(String(180), index=True)
    email_id: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(255))
    quotation_updated_date: Mapped[date | None] = mapped_column(Date)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    contact_numbers: Mapped[list["VendorContactNumber"]] = relationship(cascade="all, delete-orphan", back_populates="vendor")
    products: Mapped[list["VendorProduct"]] = relationship(cascade="all, delete-orphan", back_populates="vendor")
    history_entries: Mapped[list["VendorHistory"]] = relationship(cascade="all, delete-orphan", back_populates="vendor")
    notes: Mapped[list["VendorNote"]] = relationship(cascade="all, delete-orphan", back_populates="vendor")


class VendorContactNumber(Base, TimestampMixin):
    __tablename__ = "vendor_contact_numbers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    contact: Mapped[str] = mapped_column(String(50), index=True)

    vendor: Mapped[Vendor] = relationship(back_populates="contact_numbers")


class VendorProduct(Base, TimestampMixin):
    __tablename__ = "vendor_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    product: Mapped[str] = mapped_column(String(180), index=True)

    vendor: Mapped[Vendor] = relationship(back_populates="products")


class VendorHistory(Base, TimestampMixin):
    __tablename__ = "vendor_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    field_key: Mapped[str] = mapped_column(String(100), index=True)
    field_name: Mapped[str] = mapped_column(String(160))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    remark: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    vendor: Mapped[Vendor] = relationship(back_populates="history_entries")
    user: Mapped[User | None] = relationship(foreign_keys=[user_id])


class VendorNote(Base, TimestampMixin):
    __tablename__ = "vendor_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    note: Mapped[str] = mapped_column(Text)

    vendor: Mapped[Vendor] = relationship(back_populates="notes")


class LeaveRequest(Base, TimestampMixin):
    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    leave_type: Mapped[str] = mapped_column(String(50))  # Full Day / Half Day
    half_day_type: Mapped[str | None] = mapped_column(String(50))  # First Half / Second Half
    from_date: Mapped[date] = mapped_column(Date)
    to_date: Mapped[date] = mapped_column(Date)
    total_days: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text)
    attachment: Mapped[str | None] = mapped_column(Text)  # filename
    total_approvers: Mapped[int] = mapped_column(Integer, default=0)
    required_approvals: Mapped[int] = mapped_column(Integer, default=0)
    approved_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    pending_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="Pending")  # Pending, Approved, Rejected, Cancelled
    start_half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    end_half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    half_day_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    approvals: Mapped[list["LeaveApproval"]] = relationship(cascade="all, delete-orphan", back_populates="leave")


class LeaveApproval(Base, TimestampMixin):
    __tablename__ = "leave_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leave_id: Mapped[int] = mapped_column(ForeignKey("leave_requests.id", ondelete="CASCADE"), index=True)
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(50), default="Pending")  # Pending, Approved, Rejected
    remark: Mapped[str | None] = mapped_column(Text)
    action_date: Mapped[datetime | None] = mapped_column(DateTime)

    leave: Mapped[LeaveRequest] = relationship(back_populates="approvals")
    approver: Mapped["User"] = relationship(foreign_keys=[approver_id])


class OurCompany(Base, TimestampMixin):
    __tablename__ = "our_companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="Active")










