from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import require_permission
from app.models import User
from app.schemas import VendorCreate, VendorUpdate, VendorOut, InlineVendorUpdate, VendorHistoryOut
from app.modules.vendors.services import (
    list_vendors,
    get_vendor,
    create_vendor,
    update_vendor,
    delete_vendor,
    to_vendor_out,
    update_vendor_inline,
    get_vendor_history,
)

router = APIRouter(prefix="/vendors", tags=["vendors"])

@router.get("", response_model=list[VendorOut])
def list_vendor_records(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("vendors.view")),
):
    vendors = list_vendors(db, q)
    return [to_vendor_out(db, vendor) for vendor in vendors]

@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor_record(
    vendor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("vendors.view")),
):
    vendor = get_vendor(db, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return to_vendor_out(db, vendor)

@router.post("", response_model=VendorOut)
def create_vendor_record(
    payload: VendorCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("vendors.manage")),
):
    vendor = create_vendor(db, payload, user.id)
    return to_vendor_out(db, vendor)

@router.put("/{vendor_id}", response_model=VendorOut)
def update_vendor_record(
    vendor_id: int,
    payload: VendorUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("vendors.manage")),
):
    vendor = get_vendor(db, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    vendor = update_vendor(db, vendor, payload, user.id)
    return to_vendor_out(db, vendor)

@router.delete("/{vendor_id}")
def delete_vendor_record(
    vendor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("vendors.manage")),
):
    vendor = get_vendor(db, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    delete_vendor(db, vendor)
    return {"ok": True}

@router.put("/{vendor_id}/inline-update", response_model=VendorOut)
def update_vendor_inline_endpoint(
    vendor_id: int,
    payload: InlineVendorUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("vendors.manage")),
):
    try:
        vendor = update_vendor_inline(db, vendor_id, payload, user.id)
        return to_vendor_out(db, vendor)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{vendor_id}/history", response_model=list[VendorHistoryOut])
def get_vendor_history_record(
    vendor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("vendors.view")),
):
    history = get_vendor_history(db, vendor_id)
    return [{
        **h.__dict__,
        "user_name": h.user.name if h.user else None
    } for h in history]

