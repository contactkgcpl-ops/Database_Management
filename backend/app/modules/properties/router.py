from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_permission
from app.models import User
from app.modules.properties.services import (
    DuplicatePropertyKeyError,
    DuplicatePropertyOptionError,
    create_property,
    delete_property,
    get_property,
    list_display_grids,
    list_properties,
    to_display_grid_out,
    to_property_out,
    update_property_grid_columns,
    update_property,
)
from app.schemas import DisplayGridOut, PropertyCreate, PropertyGridColumnBulkUpdate, PropertyOut, PropertyUpdate

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("", response_model=list[PropertyOut])
def list_property_records(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.view")),
):
    return [to_property_out(prop) for prop in list_properties(db, q)]


@router.get("/grids", response_model=list[DisplayGridOut])
def list_property_grids(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.view")),
):
    return [to_display_grid_out(grid) for grid in list_display_grids(db)]


@router.get("/{property_id}", response_model=PropertyOut)
def get_property_record(
    property_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.view")),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return to_property_out(prop)


@router.post("", response_model=PropertyOut)
def create_property_record(
    payload: PropertyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("properties.manage")),
):
    try:
        return to_property_out(create_property(db, payload, user))
    except DuplicatePropertyOptionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DuplicatePropertyKeyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Property name or key already exists") from exc


@router.put("/grid-columns", response_model=list[PropertyOut])
def update_property_grid_column_records(
    payload: PropertyGridColumnBulkUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.manage")),
):
    rows = [
        {
            "id": column.id,
            "grid_id": column.grid_id,
            "show_on_grid": column.show_on_grid,
            "grid_order": column.grid_order,
            "grid_width": column.grid_width,
        }
        for column in payload.columns
    ]
    return [to_property_out(prop) for prop in update_property_grid_columns(db, rows)]


@router.put("/{property_id}", response_model=PropertyOut)
def update_property_record(
    property_id: int,
    payload: PropertyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.manage")),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    try:
        return to_property_out(update_property(db, prop, payload))
    except DuplicatePropertyOptionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DuplicatePropertyKeyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Property name or key already exists") from exc


@router.delete("/{property_id}")
def delete_property_record(
    property_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("properties.manage")),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    delete_property(db, prop)
    return {"ok": True}
