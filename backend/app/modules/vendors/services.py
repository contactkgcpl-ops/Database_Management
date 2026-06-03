from sqlalchemy.orm import Session
from app.models import Vendor, VendorContactNumber, VendorProduct
from app.schemas import VendorCreate, VendorUpdate

def list_vendors(db: Session, q: str | None = None) -> list[Vendor]:
    query = db.query(Vendor)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            (Vendor.company_name.ilike(term)) |
            (Vendor.vendor_name.ilike(term)) |
            (Vendor.email_id.ilike(term)) |
            (Vendor.city.ilike(term)) |
            (Vendor.status.ilike(term)) |
            (Vendor.products.any(VendorProduct.product.ilike(term))) |
            (Vendor.contact_numbers.any(VendorContactNumber.contact.ilike(term)))
        )
    return query.order_by(Vendor.company_name.asc()).all()

def get_vendor(db: Session, vendor_id: int) -> Vendor | None:
    return db.query(Vendor).filter(Vendor.id == vendor_id).first()

def create_vendor(db: Session, payload: VendorCreate, user_id: int) -> Vendor:
    vendor = Vendor(
        company_name=payload.company_name,
        vendor_name=payload.vendor_name,
        email_id=payload.email_id,
        city=payload.city,
        status=payload.status,
        website=payload.website,
        quotation_updated_date=payload.quotation_updated_date,
        created_by=user_id
    )
    db.add(vendor)
    db.flush()
    
    for prod in payload.products:
        if prod.strip():
            db.add(VendorProduct(vendor_id=vendor.id, product=prod.strip()))

    for num in payload.contact_numbers:
        if num.strip():
            db.add(VendorContactNumber(vendor_id=vendor.id, contact=num.strip()))
    
    db.commit()
    db.refresh(vendor)
    return vendor

def update_vendor(db: Session, vendor: Vendor, payload: VendorUpdate) -> Vendor:
    vendor.company_name = payload.company_name
    vendor.vendor_name = payload.vendor_name
    vendor.email_id = payload.email_id
    vendor.city = payload.city
    vendor.status = payload.status
    vendor.website = payload.website
    vendor.quotation_updated_date = payload.quotation_updated_date
    
    # Update products
    db.query(VendorProduct).filter(VendorProduct.vendor_id == vendor.id).delete()
    for prod in payload.products:
        if prod.strip():
            db.add(VendorProduct(vendor_id=vendor.id, product=prod.strip()))

    # Update contact numbers
    db.query(VendorContactNumber).filter(VendorContactNumber.vendor_id == vendor.id).delete()
    for num in payload.contact_numbers:
        if num.strip():
            db.add(VendorContactNumber(vendor_id=vendor.id, contact=num.strip()))
            
    db.commit()
    db.refresh(vendor)
    return vendor

def delete_vendor(db: Session, vendor: Vendor) -> None:
    db.delete(vendor)
    db.commit()

def to_vendor_out(db: Session, vendor: Vendor) -> dict:
    return {
        "id": vendor.id,
        "company_name": vendor.company_name,
        "vendor_name": vendor.vendor_name,
        "email_id": vendor.email_id,
        "city": vendor.city,
        "status": vendor.status,
        "website": vendor.website,
        "quotation_updated_date": vendor.quotation_updated_date,
        "created_by": vendor.created_by,
        "created_at": vendor.created_at,
        "updated_at": vendor.updated_at,
        "creator_name": vendor.creator.name if vendor.creator else None,
        "products": [p.product for p in vendor.products],
        "contact_numbers": [cn.contact for cn in vendor.contact_numbers]
    }
