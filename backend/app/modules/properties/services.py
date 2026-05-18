import re

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models import DisplayGrid, Property, PropertyGrid, PropertyOption, User
from app.schemas import DisplayGridOut, PropertyCreate, PropertyGridOut, PropertyOptionOut, PropertyOut, PropertyUpdate

FIELD_KEY_RE = re.compile(r"[^a-z0-9]+")


class DuplicatePropertyKeyError(ValueError):
    pass


class DuplicatePropertyOptionError(ValueError):
    pass


def make_field_key(name: str) -> str:
    field_key = FIELD_KEY_RE.sub("_", name.strip().lower()).strip("_")
    if not field_key:
        return "property"
    if field_key[0].isdigit():
        return f"p_{field_key}"
    return field_key


def list_properties(db: Session, q: str | None = None) -> list[Property]:
    query = db.query(Property).options(joinedload(Property.creator), joinedload(Property.options), joinedload(Property.grids).joinedload(PropertyGrid.grid)).order_by(Property.sort_order, Property.id)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Property.name.ilike(term), Property.field_key.ilike(term), Property.object_type.ilike(term)))
    return query.limit(500).all()


def get_property(db: Session, property_id: int) -> Property | None:
    return db.query(Property).options(joinedload(Property.creator), joinedload(Property.options), joinedload(Property.grids).joinedload(PropertyGrid.grid)).filter(Property.id == property_id).first()


def list_display_grids(db: Session) -> list[DisplayGrid]:
    return db.query(DisplayGrid).filter(DisplayGrid.is_active.is_(True)).order_by(DisplayGrid.sort_order, DisplayGrid.id).all()


def property_key_exists(db: Session, field_key: str, exclude_id: int | None = None) -> bool:
    query = db.query(Property.id).filter(Property.field_key == field_key)
    if exclude_id is not None:
        query = query.filter(Property.id != exclude_id)
    return db.query(query.exists()).scalar()


def validate_property_options(payload: PropertyCreate | PropertyUpdate) -> None:
    if payload.object_type not in {"dropdown", "multiselect"}:
        return
    values = [option.value for option in payload.options]
    if len(values) != len(set(values)):
        raise DuplicatePropertyOptionError("Dropdown option values must be unique")


def sync_property_options(db: Session, prop: Property, payload: PropertyCreate | PropertyUpdate) -> None:
    prop.options.clear()
    db.flush() # Ensure deletions happen before additions
    if payload.object_type not in {"dropdown", "multiselect"}:
        return
    for index, option in enumerate(payload.options):
        option_data = option.model_dump()
        option_data["sort_order"] = option_data.get("sort_order") or index
        prop.options.append(PropertyOption(**option_data))


def sync_property_grids(db: Session, prop: Property, payload: PropertyCreate | PropertyUpdate) -> None:
    grid_ids = set(payload.grid_ids)
    if not grid_ids:
        prop.grids.clear()
        prop.show_on_grid = False
        return

    valid_ids = {grid.id for grid in db.query(DisplayGrid).filter(DisplayGrid.id.in_(grid_ids), DisplayGrid.is_active.is_(True)).all()}
    existing_by_grid_id = {item.grid_id: item for item in prop.grids}
    prop.grids[:] = [item for item in prop.grids if item.grid_id in valid_ids]
    for grid_id in valid_ids:
        if grid_id in existing_by_grid_id:
            continue
        prop.grids.append(
            PropertyGrid(
                grid_id=grid_id,
                grid_order=payload.grid_order or prop.grid_order or 0,
                grid_width=payload.grid_width or prop.grid_width or 160,
            )
        )
    prop.show_on_grid = bool(valid_ids)


def create_property(db: Session, payload: PropertyCreate, user: User) -> Property:
    if property_key_exists(db, payload.field_key):
        raise DuplicatePropertyKeyError("Property key already exists")
    validate_property_options(payload)
    data = payload.model_dump(exclude={"options", "grid_ids"})
    data["group"] = "custom"
    prop = Property(**data, created_by=user.id)
    sync_property_options(db, prop, payload)
    sync_property_grids(db, prop, payload)
    db.add(prop)
    db.commit()

    # Dynamically add column to the correct table if not multi-value
    if not payload.is_multi_value:
        from sqlalchemy import text
        col_type = "TEXT"
        if payload.object_type in ["number", "integer"]: col_type = "INTEGER"
        elif payload.object_type == "boolean": col_type = "BOOLEAN"
        
        target_table = "lead_manage" if payload.entity_type == "lead" else "companies"
        
        try:
            db.execute(text(f"ALTER TABLE {target_table} ADD COLUMN {payload.field_key} {col_type}"))
            db.commit()
        except Exception:
            pass

    db.refresh(prop)
    return get_property(db, prop.id) or prop


def update_property(db: Session, prop: Property, payload: PropertyUpdate) -> Property:
    # Check field_key uniqueness
    if property_key_exists(db, payload.field_key, exclude_id=prop.id):
        raise DuplicatePropertyKeyError("Property key already exists")
    
    # Check name uniqueness within the same group
    group = "custom"
    existing_name = db.query(Property.id).filter(
        Property.name == payload.name,
        Property.group == group,
        Property.id != prop.id
    ).first()
    if existing_name:
        raise DuplicatePropertyKeyError(f"Property with name '{payload.name}' already exists")
    
    if prop.is_multi_value == False and payload.is_multi_value == True:
        raise ValueError("Cannot change a single-value property to multi-value once created")

    validate_property_options(payload)
    data = payload.model_dump(exclude={"options", "grid_ids"})
    data["group"] = group
    for key, value in data.items():
        setattr(prop, key, value)
    sync_property_options(db, prop, payload)
    sync_property_grids(db, prop, payload)
    db.commit()
    return get_property(db, prop.id) or prop


def update_property_grid_columns(db: Session, columns: list[dict[str, int | bool]]) -> list[Property]:
    active_grid = db.query(DisplayGrid).filter(DisplayGrid.is_active.is_(True)).order_by(DisplayGrid.sort_order, DisplayGrid.id).first()
    active_grid_id = active_grid.id if active_grid else None
    ids = [int(column["id"]) for column in columns]
    properties = db.query(Property).options(joinedload(Property.grids)).filter(Property.id.in_(ids)).all()
    by_id = {prop.id: prop for prop in properties}
    for column in columns:
        prop = by_id.get(int(column["id"]))
        if not prop:
            continue
            
        target_grid_id = column.get("grid_id") or active_grid_id
        if not target_grid_id:
            continue

        prop.show_on_grid = bool(column["show_on_grid"])
        prop.grid_order = int(column["grid_order"] or 0)
        prop.grid_width = min(max(int(column.get("grid_width") or prop.grid_width or 160), 80), 640)
        
        link = next((item for item in prop.grids if item.grid_id == target_grid_id), None)
        if prop.show_on_grid:
            if link:
                link.grid_order = prop.grid_order
                link.grid_width = prop.grid_width
            else:
                prop.grids.append(PropertyGrid(grid_id=target_grid_id, grid_order=prop.grid_order, grid_width=prop.grid_width))
        elif link:
            prop.grids.remove(link)
        prop.show_on_grid = bool(prop.grids)
    db.commit()
    return db.query(Property).options(joinedload(Property.creator), joinedload(Property.options), joinedload(Property.grids).joinedload(PropertyGrid.grid)).filter(Property.id.in_(ids)).all()


def delete_property(db: Session, prop: Property) -> None:
    raise ValueError("Deleting properties is not allowed to prevent data loss")


def to_property_out(prop: Property) -> PropertyOut:
    grids = [
        PropertyGridOut(
            grid_id=item.grid_id,
            grid_key=item.grid.key if item.grid else "",
            grid_name=item.grid.name if item.grid else "",
            grid_order=item.grid_order,
            grid_width=item.grid_width,
        )
        for item in sorted(prop.grids, key=lambda link: (link.grid.sort_order if link.grid else 0, link.grid_id))
        if item.grid and item.grid.is_active
    ]
    return PropertyOut(
        id=prop.id,
        name=prop.name,
        field_key=prop.field_key,
        object_type=prop.object_type,
        description=prop.description,
        is_required=prop.is_required,
        is_unique=prop.is_unique,
        is_multi_value=prop.is_multi_value,
        is_active=prop.is_active,
        show_on_grid=prop.show_on_grid,
        grid_order=prop.grid_order,
        grid_width=prop.grid_width,
        filter_type=prop.filter_type,
        sort_order=prop.sort_order,
        entity_type=prop.entity_type,
        grid_ids=[item.grid_id for item in grids],
        grids=grids,
        created_by=prop.created_by,
        created_by_name=prop.creator.name if prop.creator else None,
        options=[PropertyOptionOut.model_validate(option) for option in prop.options],
    )


def to_display_grid_out(grid: DisplayGrid) -> DisplayGridOut:
    return DisplayGridOut.model_validate(grid)
