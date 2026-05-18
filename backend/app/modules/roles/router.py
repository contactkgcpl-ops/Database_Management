from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_any_permission, require_permission
from app.models import Permission, Role, RolePermission, User
from app.schemas import PermissionOut, RoleCreate, RoleOut

router = APIRouter(prefix="/roles", tags=["roles"])


def serialize_role(role: Role) -> RoleOut:
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=[PermissionOut.model_validate(rp.permission) for rp in role.permissions],
    )


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require_permission("roles.manage"))):
    return db.query(Permission).order_by(Permission.sort_order, Permission.id).all()


@router.get("", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), _: User = Depends(require_any_permission("roles.manage", "users.manage"))):
    return [serialize_role(role) for role in db.query(Role).order_by(Role.id.desc()).all()]


@router.post("", response_model=RoleOut)
def create_role(payload: RoleCreate, db: Session = Depends(get_db), _: User = Depends(require_permission("roles.manage"))):
    if db.query(Role).filter(Role.name == payload.name).first():
        raise HTTPException(status_code=409, detail="Role already exists")
    role = Role(name=payload.name, description=payload.description)
    db.add(role)
    db.flush()
    for permission_id in payload.permission_ids:
        db.add(RolePermission(role_id=role.id, permission_id=permission_id))
    db.commit()
    db.refresh(role)
    return serialize_role(role)


@router.put("/{role_id}", response_model=RoleOut)
def update_role(role_id: int, payload: RoleCreate, db: Session = Depends(get_db), _: User = Depends(require_permission("roles.manage"))):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    role.name = payload.name
    role.description = payload.description
    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()
    for permission_id in payload.permission_ids:
        db.add(RolePermission(role_id=role.id, permission_id=permission_id))
    db.commit()
    db.refresh(role)
    return serialize_role(role)


@router.delete("/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("roles.manage"))):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    db.delete(role)
    db.commit()
    return {"ok": True}
