from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Role, RolePermission, User
from app.security import decode_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def user_permission_codes(user: User) -> list[str]:
    if not user.role:
        return []
    return [rp.permission.code for rp in user.role.permissions]


def current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    email = decode_token(token)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = (
        db.query(User)
        .options(joinedload(User.role).joinedload(Role.permissions).joinedload(RolePermission.permission))
        .filter(User.email == email)
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user")
    return user


def require_permission(code: str) -> Callable:
    def checker(user: User = Depends(current_user)) -> User:
        if code not in user_permission_codes(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {code}")
        return user

    return checker


def require_any_permission(*codes: str | list[str]) -> Callable:
    allowed_codes = [code for item in codes for code in (item if isinstance(item, list) else [item])]

    def checker(user: User = Depends(current_user)) -> User:
        permissions = set(user_permission_codes(user))
        if not permissions.intersection(allowed_codes):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: one of {', '.join(allowed_codes)}")
        return user

    return checker
