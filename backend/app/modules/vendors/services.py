from sqlalchemy.orm import Session
from app.models import Vendor, VendorContactNumber, VendorProduct, VendorNote
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
            (Vendor.contact_numbers.any(VendorContactNumber.contact.ilike(term))) |
            (Vendor.notes.any(VendorNote.note.ilike(term)))
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

    for note in payload.notes:
        if note.strip():
            db.add(VendorNote(vendor_id=vendor.id, note=note.strip()))
    
    db.commit()
    db.refresh(vendor)
    return vendor

def update_vendor(db: Session, vendor: Vendor, payload: VendorUpdate, user_id: int) -> Vendor:
    from app.models import VendorHistory
    
    fields_to_check = {
        "company_name": "Company Name",
        "vendor_name": "Vendor Name",
        "email_id": "Email ID",
        "city": "City",
        "website": "Website",
        "quotation_updated_date": "Quotation Updated Date"
    }
    
    for field, label in fields_to_check.items():
        old_val = getattr(vendor, field, None)
        new_val = getattr(payload, field, None)
        
        old_str = str(old_val) if old_val is not None else ""
        new_str = str(new_val) if new_val is not None else ""
        
        if old_str != new_str:
            history = VendorHistory(
                vendor_id=vendor.id,
                field_key=field,
                field_name=label,
                old_value=old_str,
                new_value=new_str,
                remark="Updated via form",
                user_id=user_id
            )
            db.add(history)

    # Check notes
    old_notes = sorted([n.note for n in vendor.notes])
    new_notes = sorted([n.strip() for n in payload.notes if n.strip()])
    if old_notes != new_notes:
        history = VendorHistory(
            vendor_id=vendor.id,
            field_key="notes",
            field_name="Notes",
            old_value=",".join(old_notes),
            new_value=",".join(new_notes),
            remark="Updated via form",
            user_id=user_id
        )
        db.add(history)

    vendor.company_name = payload.company_name
    vendor.vendor_name = payload.vendor_name
    vendor.email_id = payload.email_id
    vendor.city = payload.city
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

    # Update notes
    db.query(VendorNote).filter(VendorNote.vendor_id == vendor.id).delete()
    for note in payload.notes:
        if note.strip():
            db.add(VendorNote(vendor_id=vendor.id, note=note.strip()))
            
    db.commit()
    db.refresh(vendor)
    return vendor

def delete_vendor(db: Session, vendor: Vendor) -> None:
    db.delete(vendor)
    db.commit()

def to_vendor_out(db: Session, vendor: Vendor) -> dict:
    from app.models import VendorHistory
    history_keys = [r[0] for r in db.query(VendorHistory.field_key).filter(VendorHistory.vendor_id == vendor.id).distinct().all()]
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
        "contact_numbers": [cn.contact for cn in vendor.contact_numbers],
        "notes": [n.note for n in vendor.notes],
        "history_keys": history_keys
    }

from app.schemas import InlineVendorUpdate

def update_vendor_inline(db: Session, vendor_id: int, payload: InlineVendorUpdate, user_id: int) -> Vendor:
    from app.models import VendorHistory, VendorNote
    vendor = get_vendor(db, vendor_id)
    if not vendor:
        raise ValueError("Vendor not found")
        
    field_key = payload.field_key
    new_val = payload.value.strip()
    
    if field_key == "notes":
        old_notes = sorted([n.note for n in vendor.notes])
        new_notes = sorted([n.strip() for n in new_val.split(",") if n.strip()])
        old_value = ",".join(old_notes)
        new_value = ",".join(new_notes)
        
        if old_value != new_value:
            db.query(VendorNote).filter(VendorNote.vendor_id == vendor.id).delete()
            for note in new_notes:
                db.add(VendorNote(vendor_id=vendor.id, note=note))
                
            history = VendorHistory(
                vendor_id=vendor.id,
                field_key="notes",
                field_name="Notes",
                old_value=old_value,
                new_value=new_value,
                remark=payload.remark,
                user_id=user_id
            )
            db.add(history)
    elif field_key == "products":
        from app.models import VendorProduct
        old_prods = sorted([p.product for p in vendor.products])
        new_prods = sorted([p.strip() for p in new_val.split(",") if p.strip()])
        old_value = ",".join(old_prods)
        new_value = ",".join(new_prods)
        
        if old_value != new_value:
            db.query(VendorProduct).filter(VendorProduct.vendor_id == vendor.id).delete()
            for prod in new_prods:
                db.add(VendorProduct(vendor_id=vendor.id, product=prod))
                
            history = VendorHistory(
                vendor_id=vendor.id,
                field_key="products",
                field_name="Products",
                old_value=old_value,
                new_value=new_value,
                remark=payload.remark,
                user_id=user_id
            )
            db.add(history)
    else:
        old_value = getattr(vendor, field_key, None)
        if old_value is not None:
            old_value = str(old_value)
        else:
            old_value = ""
            
        setattr(vendor, field_key, new_val)
        
        if old_value != new_val or payload.remark:
            field_name = field_key.replace("_", " ").title()
            history = VendorHistory(
                vendor_id=vendor.id,
                field_key=field_key,
                field_name=field_name,
                old_value=old_value,
                new_value=new_val,
                remark=payload.remark,
                user_id=user_id
            )
            db.add(history)
        
    db.commit()
    db.refresh(vendor)
    return vendor

def get_vendor_history(db: Session, vendor_id: int) -> list:
    from app.models import VendorHistory
    from sqlalchemy.orm import joinedload
    return db.query(VendorHistory).options(joinedload(VendorHistory.user)).filter(VendorHistory.vendor_id == vendor_id).order_by(VendorHistory.created_at.desc()).all()
