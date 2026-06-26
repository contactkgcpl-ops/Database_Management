import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_permission
from app.models import User
from app.schemas import OurCompanyCreate, OurCompanyUpdate, OurCompanyOut
from app.modules.our_companies.services import (
    list_our_companies,
    get_our_company,
    create_our_company,
    update_our_company,
    delete_our_company,
    OurCompanyValidationError,
)

router = APIRouter(prefix="/our-companies", tags=["our-companies"])

@router.get("", response_model=list[OurCompanyOut])
def list_companies_endpoint(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("our_companies.view")),
):
    return list_our_companies(db)

@router.get("/{company_id}", response_model=OurCompanyOut)
def get_company_endpoint(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("our_companies.view")),
):
    company = get_our_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company

@router.post("", response_model=OurCompanyOut)
def create_company_endpoint(
    payload: OurCompanyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("our_companies.manage")),
):
    try:
        return create_our_company(db, payload)
    except OurCompanyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

@router.put("/{company_id}", response_model=OurCompanyOut)
def update_company_endpoint(
    company_id: int,
    payload: OurCompanyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("our_companies.manage")),
):
    try:
        company = update_our_company(db, company_id, payload)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        return company
    except OurCompanyValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

@router.delete("/{company_id}")
def delete_company_endpoint(
    company_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("our_companies.manage")),
):
    success = delete_our_company(db, company_id)
    if not success:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"ok": True}

@router.post("/upload")
def upload_logo_endpoint(
    file: UploadFile = File(...),
    _: User = Depends(require_permission("our_companies.manage")),
):
    """
    Upload company logo image.
    """
    upload_dir = "storage/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"filename": f"/uploads/{filename}", "original_name": file.filename}
