from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user, require_permission, user_permission_codes
from app.models import User
from app.modules.auth.router import serialize_user
from app.schemas import UserOut
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])

UPLOAD_DIR = Path("storage/uploads")
MAX_IMAGE_BYTES = 2 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
EMAIL_ADAPTER = TypeAdapter(EmailStr)


def validate_parent(db: Session, user_id: int | None, parent_id: int | None) -> None:
    if parent_id is None:
        return
    if user_id is not None and parent_id == user_id:
        raise HTTPException(status_code=400, detail="User cannot be their own parent")
    parent = db.get(User, parent_id)
    if not parent:
        raise HTTPException(status_code=400, detail="Parent user not found")

    seen: set[int] = set()
    current = parent
    while current and current.parent_id is not None:
        if current.id in seen:
            raise HTTPException(status_code=400, detail="Circular hierarchy detected")
        seen.add(current.id)
        if user_id is not None and current.parent_id == user_id:
            raise HTTPException(status_code=400, detail="Circular hierarchy detected")
        current = db.get(User, current.parent_id)


def validate_email_unique(db: Session, email: str, user_id: int | None = None) -> None:
    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.id != user_id:
        raise HTTPException(status_code=409, detail="Email already exists")


def valid_email(value: str) -> str:
    try:
        return str(EMAIL_ADAPTER.validate_python(value))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Email is invalid") from exc


def optional_int(value: str | None, field_name: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid number") from exc


def required_text(data: dict[str, object], field_name: str) -> str:
    value = data.get(field_name)
    if value is None or not str(value).strip():
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    return str(value).strip()


def optional_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


async def parse_user_payload(request: Request, require_password: bool) -> tuple[dict[str, object], UploadFile | None]:
    content_type = request.headers.get("content-type", "")
    image: UploadFile | None = None
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        data = dict(form)
        candidate = data.pop("profile_image", None)
        if hasattr(candidate, "filename"):
            image = candidate
    elif content_type.startswith("application/json"):
        data = await request.json()
    else:
        raise HTTPException(status_code=400, detail="Use multipart/form-data for user save")

    payload = {
        "name": required_text(data, "name"),
        "email": valid_email(required_text(data, "email")),
        "role_id": optional_int(str(data.get("role_id")) if data.get("role_id") is not None else None, "role_id"),
        "parent_id": optional_int(str(data.get("parent_id")) if data.get("parent_id") is not None else None, "parent_id"),
        "is_active": optional_bool(data.get("is_active"), True),
        "remove_image": optional_bool(data.get("remove_image"), False),
    }
    password = str(data.get("password") or "")
    if require_password and len(password) < 6:
        raise HTTPException(status_code=400, detail="password is required and must be at least 6 characters")
    if password:
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="password must be at least 6 characters")
        payload["password"] = password
    return payload, image


async def save_profile_image(image: UploadFile | None) -> str | None:
    if not image or not image.filename:
        return None
    extension = ALLOWED_IMAGE_TYPES.get(image.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Profile image must be JPG, PNG, GIF, or WEBP")

    content = await image.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Profile image must be 2MB or smaller")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{uuid4().hex}{extension}"
    path = UPLOAD_DIR / filename
    path.write_bytes(content)
    return f"/uploads/{filename}"


def remove_profile_image(image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/uploads/"):
        return
    path = UPLOAD_DIR / Path(image_url).name
    if path.exists():
        path.unlink()


@router.get("", response_model=list[UserOut])
def list_users(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    requesting_user: User = Depends(current_user),
):
    query = db.query(User)
    if include_inactive:
        if "users.manage" not in user_permission_codes(requesting_user):
            raise HTTPException(status_code=403, detail="Missing permission: users.manage")
    else:
        query = query.filter(User.is_active.is_(True))

    users = query.order_by(User.name.asc(), User.id.asc()).all()
    return [serialize_user(user) for user in users]


@router.post("", response_model=UserOut)
async def create_user(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users.manage")),
):
    payload, profile_image = await parse_user_payload(request, require_password=True)
    validate_email_unique(db, payload["email"])
    validate_parent(db, None, payload["parent_id"])
    image_url = await save_profile_image(profile_image)
    user = User(
        name=payload["name"],
        email=payload["email"],
        hashed_password=hash_password(payload["password"]),
        role_id=payload["role_id"],
        parent_id=payload["parent_id"],
        profile_image_url=image_url,
        is_active=payload["is_active"],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("users.manage")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload, profile_image = await parse_user_payload(request, require_password=False)
    validate_email_unique(db, payload["email"], user_id)
    validate_parent(db, user_id, payload["parent_id"])
    image_url = await save_profile_image(profile_image)
    if payload["remove_image"] or image_url:
        remove_profile_image(user.profile_image_url)
        user.profile_image_url = image_url
    user.name = payload["name"]
    user.email = payload["email"]
    user.role_id = payload["role_id"]
    user.parent_id = payload["parent_id"]
    user.is_active = payload["is_active"]
    if payload.get("password"):
        user.hashed_password = hash_password(payload["password"])
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("users.manage"))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"ok": True}
