from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, user_permission_codes
from app.models import User
from app.modules.time_tracking.services import start_day_log
from app.schemas import LoginIn, Token, UserOut
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        is_active=user.is_active,
        role_id=user.role_id,
        parent_id=user.parent_id,
        profile_image_url=user.profile_image_url,
        role_name=user.role.name if user.role else None,
        permissions=user_permission_codes(user),
        company_ids=user.company_ids,
        restrict_reporting=bool(user.restrict_reporting),
        crm_notification_email=user.crm_notification_email,
        need_user_location=bool(user.need_user_location),
    )


@router.post("/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    start_day_log(db, user)
    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return serialize_user(user)
