from sqlalchemy.orm import Session
from app.models import OurCompany
from app.schemas import OurCompanyCreate, OurCompanyUpdate

class OurCompanyValidationError(ValueError):
    pass

def list_our_companies(db: Session) -> list[OurCompany]:
    return db.query(OurCompany).order_by(OurCompany.name.asc()).all()

def get_our_company(db: Session, company_id: int) -> OurCompany | None:
    return db.query(OurCompany).filter(OurCompany.id == company_id).first()

def create_our_company(db: Session, payload: OurCompanyCreate) -> OurCompany:
    # Check uniqueness of name
    existing = db.query(OurCompany).filter(OurCompany.name == payload.name).first()
    if existing:
        raise OurCompanyValidationError(f"A company with the name '{payload.name}' already exists.")
    
    company = OurCompany(
        name=payload.name,
        logo_url=payload.logo_url,
        website=payload.website,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        status=payload.status,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

def update_our_company(db: Session, company_id: int, payload: OurCompanyUpdate) -> OurCompany | None:
    company = get_our_company(db, company_id)
    if not company:
        return None
        
    # Check uniqueness of name if changed
    if company.name != payload.name:
        existing = db.query(OurCompany).filter(OurCompany.name == payload.name).first()
        if existing:
            raise OurCompanyValidationError(f"A company with the name '{payload.name}' already exists.")
            
    company.name = payload.name
    company.logo_url = payload.logo_url
    company.website = payload.website
    company.email = payload.email
    company.phone = payload.phone
    company.address = payload.address
    company.status = payload.status
    
    db.commit()
    db.refresh(company)
    return company

def delete_our_company(db: Session, company_id: int) -> bool:
    company = get_our_company(db, company_id)
    if not company:
        return False
    db.delete(company)
    db.commit()
    return True
