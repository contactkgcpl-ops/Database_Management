from datetime import datetime

from pydantic import BaseModel, Field


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    priority: str = Field(default="Medium")  # Low, Medium, High, Urgent
    due_date: str | None = None  # ISO date string
    assigned_to_id: int | None = None


class RequirementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    priority: str | None = None
    status: str | None = None  # Open, In Progress, Done, Closed
    due_date: str | None = None
    assigned_to_id: int | None = None


class UserBrief(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class RequirementHistoryOut(BaseModel):
    id: int
    type: str
    remark: str | None
    user: UserBrief | None
    created_at: datetime

    class Config:
        from_attributes = True


class RequirementCommentCreate(BaseModel):
    remark: str


class RequirementOut(BaseModel):
    id: int
    title: str
    description: str | None
    priority: str
    status: str
    due_date: datetime | None
    added_by: UserBrief | None
    assigned_to: UserBrief | None
    created_at: datetime
    updated_at: datetime
    history: list[RequirementHistoryOut] = []

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: int
    type: str  # assigned | completed
    is_read: bool
    created_at: datetime
    requirement: RequirementOut

    class Config:
        from_attributes = True
