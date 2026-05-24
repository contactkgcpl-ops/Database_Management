from pydantic import BaseModel, Field


class InquiryPropertyValueIn(BaseModel):
    property_id: int
    value: str


class InquiryCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=180)
    assigned_to: int | None = None
    follow_up_date: str | None = None
    remark: str | None = None
    property_values: list[InquiryPropertyValueIn] = []


class InquiryStageUpdate(BaseModel):
    status: str = Field(min_length=1)
    remark: str | None = None
    follow_up_date: str | None = None
    order_amount: str | None = None
    connected_source: str | None = None


class InquiryAssign(BaseModel):
    user_id: int | None = None

