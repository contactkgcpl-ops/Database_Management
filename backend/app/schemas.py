from datetime import datetime, date

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
    need_user_location: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    role_id: int | None = None
    parent_id: int | None = None
    profile_image_url: str | None = None
    is_active: bool | None = None
    need_user_location: bool | None = None


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
    company_ids: str | None = None
    restrict_reporting: bool = False
    crm_notification_email: str | None = None
    need_user_location: bool = False


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


class CompanyPropertyValueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    property_id: int
    value: str | None = None
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


class CompanyImportUpsert(CompanyBase):
    property_values: list[CompanyPropertyValueCreate] = []
    edit_only: bool = False



class CompanyOut(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime | None = None
    created_by: int | None = None
    created_by_name: str | None = None
    assigned_to: int | None = None
    assigned_to_ids: str | None = None  # comma-separated multi-assign user IDs
    assigned_user_name: str | None = None
    assigned_by: int | None = None
    assigned_by_name: str | None = None
    property_values: list[CompanyPropertyValueOut] = []
    history_keys: list[str] = []
    is_inquiry: bool | None = False



class PaginatedCompaniesOut(BaseModel):
    companies: list[CompanyOut]
    total: int
    filter_options: dict[str, list[str]] = Field(default_factory=dict)


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
    our_company_ids: str | None = None
    our_company_names: str | None = None

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


class UserBreakLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    break_start: datetime
    break_end: datetime | None = None
    break_seconds: int = 0


class UserTimeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    user_name: str | None = None
    work_date: str
    login_at: datetime
    logout_at: datetime | None = None
    total_break_seconds: int = 0
    total_work_seconds: int = 0
    status: str
    active_break_start: datetime | None = None
    breaks: list[UserBreakLogOut] = []
    server_time: datetime | None = None
    
    # Location
    login_latitude: float | None = None
    login_longitude: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_timestamp: datetime | None = None


class UserLocationLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    user_name: str | None = None
    user_email: str | None = None
    work_date: str
    latitude: float
    longitude: float
    recorded_at: datetime


# --- Hourly Reporting ---

class HourlyReportCallCreate(BaseModel):
    contact_number: str
    contact_person: str
    contact_for: str


class HourlyReportCallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    contact_number: str
    contact_person: str
    contact_for: str


class HourlyReportCreate(BaseModel):
    work_date: date
    start_time: str
    end_time: str
    description: str
    status: str = "Draft"
    work_type: str = "General"
    calls: list[HourlyReportCallCreate] = []


class HourlyReportUpdate(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    description: str | None = None
    status: str | None = None
    work_type: str | None = None
    calls: list[HourlyReportCallCreate] | None = None


class HourlyReportOut(BaseModel):
    id: int
    user_id: int
    work_date: date
    start_time: str
    end_time: str
    description: str
    status: str
    work_type: str
    calls: list[HourlyReportCallOut] = []
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)





class VendorContactNumberOut(BaseModel):
    id: int
    vendor_id: int
    contact: str
    model_config = ConfigDict(from_attributes=True)


class VendorBase(BaseModel):
    company_name: str = Field(min_length=1, max_length=180)
    vendor_name: str = Field(min_length=1, max_length=180)
    email_id: str | None = None
    city: str | None = None
    status: str | None = None
    website: str | None = None
    quotation_updated_date: date | None = None


class VendorCreate(VendorBase):
    products: list[str] = []
    contact_numbers: list[str] = []
    notes: list[str] = []


class VendorUpdate(VendorBase):
    products: list[str] = []
    contact_numbers: list[str] = []
    notes: list[str] = []


class VendorOut(VendorBase):
    id: int
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    creator_name: str | None = None
    products: list[str] = []
    contact_numbers: list[str] = []
    notes: list[str] = []
    history_keys: list[str] = []
    model_config = ConfigDict(from_attributes=True)


class InlineVendorUpdate(BaseModel):
    field_key: str = Field(min_length=1)
    value: str
    remark: str | None = None


class VendorHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    vendor_id: int
    field_key: str
    field_name: str
    old_value: str | None = None
    new_value: str | None = None
    remark: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    created_at: datetime


# --- Leave Management ---


class LeaveApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    leave_id: int
    approver_id: int
    approver_name: str | None = None
    approver_role: str | None = None
    status: str
    remark: str | None = None
    action_date: datetime | None = None


class LeaveRequestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    leave_type: str = Field(pattern=r"^(Full Day|Half Day)$")
    half_day_type: str | None = None  # First Half / Second Half
    from_date: date
    to_date: date
    description: str
    attachment: str | None = None
    start_half_day: bool = False
    end_half_day: bool = False
    half_day_details: str | None = None
    user_id: int | None = None



class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    employee_name: str | None = None
    department: str | None = None
    designation: str | None = None
    title: str
    leave_type: str
    half_day_type: str | None = None
    from_date: date
    to_date: date
    total_days: float
    description: str
    attachment: str | None = None
    total_approvers: int
    required_approvals: int
    approved_count: int
    rejected_count: int
    pending_count: int
    status: str
    created_at: datetime
    updated_at: datetime
    start_half_day: bool
    end_half_day: bool
    half_day_details: str | None
    cancel_reason: str | None = None
    approvals: list[LeaveApprovalOut] = []


class LeaveApproverInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    role_name: str | None = None



class LeaveApprovalAction(BaseModel):
    status: str = Field(pattern=r"^(Approved|Rejected)$")
    remark: str | None = None


class LeaveCalendarItem(BaseModel):
    id: int | None = None
    type: str  # leave, holiday, week_off
    title: str
    from_date: date
    to_date: date
    status: str | None = None  # Pending, Approved


class AttendanceReportItem(BaseModel):
    user_id: int
    user_name: str
    work_date: str
    login_at: datetime | None = None
    logout_at: datetime | None = None
    total_work_seconds: int = 0
    is_on_leave: bool = False
    leave_status: str | None = None
    leave_title: str | None = None
    status: str


class AttendanceSummaryItem(BaseModel):
    user_id: int
    user_name: str
    total_days: int = 0
    present_days: int = 0
    leave_days: int = 0
    absent_days: int = 0
    sunday_days: int = 0
    total_work_hours: float = 0.0
    average_work_hours: float = 0.0


class AttendanceReportResponse(BaseModel):
    logs: list[AttendanceReportItem]
    summary: list[AttendanceSummaryItem]


# --- Our Companies ---

class OurCompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    logo_url: str | None = None
    website: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    status: str = "Active"

class OurCompanyCreate(OurCompanyBase):
    pass

class OurCompanyUpdate(OurCompanyBase):
    pass

class OurCompanyOut(OurCompanyBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmailReportConfigBase(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    to_emails: list[str]
    schedule_time: str = "20:00"
    is_active: bool = True


class EmailReportConfigUpdate(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    to_emails: list[str] | None = None
    schedule_time: str | None = None
    is_active: bool | None = None


class EmailReportConfigOut(BaseModel):
    id: int
    smtp_host: str
    smtp_port: int
    smtp_user: str
    to_emails: list[str]
    schedule_time: str
    is_active: bool
    has_password: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmailReportLogOut(BaseModel):
    id: int
    report_date: date
    sent_at: datetime
    status: str
    error_message: str | None = None
    recipients_count: int
    recipients: str | None = None

    model_config = ConfigDict(from_attributes=True)






