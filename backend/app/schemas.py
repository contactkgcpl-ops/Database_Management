from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    label: str
    menu_key: str
    menu_label: str
    sort_order: int


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = None
    permission_ids: list[int] = []


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    permissions: list[PermissionOut] = []


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role_id: int | None = None
    parent_id: int | None = None
    profile_image_url: str | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role_id: int | None = None
    parent_id: int | None = None
    profile_image_url: str | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    is_active: bool
    role_id: int | None = None
    parent_id: int | None = None
    profile_image_url: str | None = None
    role_name: str | None = None
    permissions: list[str] = []


class PropertyOptionBase(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    value: str = Field(min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class PropertyOptionCreate(PropertyOptionBase):
    pass


class PropertyOptionOut(PropertyOptionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DisplayGridOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    name: str
    is_active: bool
    sort_order: int = 0


class PropertyGridOut(BaseModel):
    grid_id: int
    grid_key: str
    grid_name: str
    grid_order: int = 0
    grid_width: int = 160


class PropertyBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    field_key: str = Field(min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    object_type: str = Field(pattern=r"^(name|text|textarea|number|date|email|mobile|dropdown|multiselect|boolean|checkbox)$")
    description: str | None = None
    is_required: bool = False
    is_unique: bool = False
    is_multi_value: bool = False
    is_active: bool = True
    show_on_grid: bool = False
    grid_order: int = 0
    grid_width: int = Field(default=160, ge=80, le=640)
    filter_type: str = "text"
    sort_order: int = 0
    entity_type: str = "company"
    grid_ids: list[int] = []
    options: list[PropertyOptionCreate] = []


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(PropertyBase):
    pass


class PropertyOut(PropertyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_by: int | None = None
    created_by_name: str | None = None
    grids: list[PropertyGridOut] = []
    options: list[PropertyOptionOut] = []


class PropertyGridColumnUpdate(BaseModel):
    id: int
    grid_id: int | None = None
    show_on_grid: bool
    grid_order: int = 0
    grid_width: int = Field(default=160, ge=80, le=640)


class PropertyGridColumnBulkUpdate(BaseModel):
    columns: list[PropertyGridColumnUpdate]


class CompanyPropertyValueBase(BaseModel):
    property_id: int
    value: str = Field(min_length=1)


class CompanyPropertyValueCreate(CompanyPropertyValueBase):
    pass


class CompanyPropertyValueOut(CompanyPropertyValueBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    property_name: str | None = None
    field_key: str | None = None


class CompanyBase(BaseModel):
    company_name: str = Field(min_length=1, max_length=180)


class CompanyCreate(CompanyBase):
    property_values: list[CompanyPropertyValueCreate] = []


class CompanyUpdate(CompanyBase):
    property_values: list[CompanyPropertyValueCreate] = []
    assigned_to: int | None = None


class CompanyOut(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime | None = None
    created_by: int | None = None
    created_by_name: str | None = None
    assigned_to: int | None = None
    assigned_user_name: str | None = None
    assigned_by: int | None = None
    assigned_by_name: str | None = None
    property_values: list[CompanyPropertyValueOut] = []
    history_keys: list[str] = []
    is_inquiry: bool | None = False


class LeadPropertyValueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    property_id: int
    value: str
    property_name: str | None = None
    field_key: str | None = None


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_name: str
    created_at: str | None = None
    created_by: int | None = None
    created_by_name: str | None = None
    assigned_to: int | None = None
    assigned_user_name: str | None = None
    assigned_by: int | None = None
    assigned_by_name: str | None = None
    property_values: list[LeadPropertyValueOut] = []


class InlinePropertyUpdate(BaseModel):
    property_id: int
    value: str
    remark: str | None = None
    follow_up_date: str | None = None


class LeadConvertIn(BaseModel):
    follow_up_date: str
    remark: str | None = None
    requirement: str | None = None


class LeadHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    property_key: str
    property_name: str
    old_value: str | None = None
    new_value: str | None = None
    remark: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    created_at: datetime

class LeadFollowUpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    company_name: str | None = None
    contact_number: str | None = None
    lead_status: str | None = None
    assigned_to_id: int | None = None
    assigned_to_name: str | None = None
    scheduled_date: datetime
    actual_date: datetime | None = None
    status: str
    remark: str | None = None
    created_at: datetime
