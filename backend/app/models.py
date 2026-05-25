from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
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

    user: Mapped[User] = relationship()
