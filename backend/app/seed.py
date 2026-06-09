from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db import engine
from app.models import DisplayGrid, Permission, Property, PropertyGrid, PropertyOption, Role, RolePermission, User
from app.security import hash_password


DEFAULT_PERMISSIONS = [
    ("dashboard.view", "View Dashboard", "dashboard", "Dashboard", 10),
    ("users.manage", "User", "user-management", "User Management", 20),
    ("roles.manage", "Role", "user-management", "User Management", 30),
    ("properties.view", "View Properties", "properties", "Properties", 35),
    ("properties.manage", "Manage Properties", "properties", "Properties", 36),
    ("companies.view", "View Companies", "contact", "Contact", 40),
    ("companies.manage", "Manage/Add Companies", "contact", "Contact", 45),
    ("leads.add", "Add Lead", "contact", "Contact", 48),
    ("leads.assign", "Assign Leads", "contact", "Contact", 50),
    ("leads.my", "My Leads", "contact", "Contact", 55),
    ("leads.followup", "Today Followup", "contact", "Contact", 60),
    ("inquiry.view", "View Inquiries", "contact", "Contact", 70),
    ("inquiry.create", "Create Inquiry", "contact", "Contact", 71),
    ("inquiry.update", "Update Inquiry", "contact", "Contact", 72),
    ("inquiry.convert", "Convert Lead To Inquiry", "contact", "Contact", 73),
    ("inquiry.assign", "Assign Inquiry", "contact", "Contact", 74),
    ("inquiry.pipeline", "Update Inquiry Pipeline", "contact", "Contact", 75),
    ("requirement.view", "View Requirements", "requirements", "Requirements", 80),
    ("requirement.create", "Create Requirement", "requirements", "Requirements", 81),
    ("requirement.update", "Update Requirement", "requirements", "Requirements", 82),
    ("requirement.delete", "Delete Requirement", "requirements", "Requirements", 83),
    ("time.view", "View My Time", "time", "Time Tracking", 90),
    ("time.break", "Break Controls", "time", "Time Tracking", 91),
    ("time.manage", "Manage User Time", "time", "Time Tracking", 92),
    ("tasks.view", "View Tasks", "staff-management", "Staff Management", 100),
    ("tasks.create", "Create Tasks", "staff-management", "Staff Management", 101),
    ("tasks.manage", "Manage Tasks", "staff-management", "Staff Management", 102),
    ("tasks.report", "View Staff Report", "staff-management", "Staff Management", 103),
    ("vendors.view", "View Vendors", "purchase", "Purchase", 110),
    ("vendors.manage", "Manage Vendors", "purchase", "Purchase", 111),
]

DEFAULT_PROPERTIES = [
    # (name, field_key, object_type, group, description, is_required, is_unique, is_multi_value, entity_type, filter_type, show_on_grid, grid_order, sort_order)
    ("Contact Number", "contact_number", "mobile", "custom", "Contact Number", False, True, True, "company", "text", True, 2, 0),
    ("Email Id", "email_id", "email", "custom", "Email Id", False, True, True, "company", "text", True, 4, 0),
    ("City", "city", "text", "custom", "City", True, False, False, "company", "multiselect", False, 0, 0),
    ("Address", "address", "textarea", "custom", "Address", False, False, False, "company", "text", True, 3, 0),
    ("State", "state", "text", "custom", "State", False, False, False, "company", "multiselect", True, 20, 0),
    ("Type", "type", "multiselect", "custom", "", False, False, False, "company", "multiselect", True, 80, 0),
    ("Website", "website", "text", "custom", "Website", False, False, False, "company", "text", True, 50, 0),
    ("Description", "description", "textarea", "custom", "", False, False, False, "company", "text", True, 60, 0),
    ("Verification Status", "verification_status", "dropdown", "custom", "Company verification status", False, False, False, "company", "dropdown", True, 15, 0),
    ("Cold Leads Status", "status", "dropdown", "custom", "", False, False, False, "lead", "dropdown", True, 2, 0),
    ("Connected Source", "connected_source", "multiselect", "custom", "Lead connected source", False, False, False, "lead", "multiselect", True, 3, 0),
    ("Inquiry No", "inquiry_no", "text", "custom", "Inquiry Number", False, False, False, "lead", "text", True, 10, 0),
    ("Contact Person", "contact_person", "text", "custom", "Contact Person Name", False, False, False, "lead", "text", True, 11, 0),
    ("Inquiry Source", "inquiry_source", "dropdown", "custom", "Source of Inquiry", False, False, False, "lead", "dropdown", True, 13, 0),
    ("Order Amount", "order_amount", "number", "custom", "Order Amount", False, False, False, "lead", "number", True, 14, 0),
    ("Requirement", "requirement", "text", "custom", "Lead/Inquiry requirement details", False, False, False, "lead", "text", True, 15, 0),
]
DEFAULT_GRIDS = [
    ("companies", "Companies", True, 10),
    ("assign_leads", "Assign Leads", True, 20),
    ("my_leads", "My Leads", True, 30),
    ("inquiries", "Inquiries", True, 40),
]

DEFAULT_PROPERTY_OPTIONS = {
    "verification_status": [
        ("Pending", "pending", 0),
        ("Verified", "verified", 10),
        ("Unverified", "unverified", 20),
    ],
    "status": [
        ("New", "new", 0),
        ("Connected", "connected", 10),
        ("Not Connected", "not_connected", 20),
        ("Converted", "converted", 25),
        ("Follow-up", "follow_up", 30),
        ("Quotation Sent", "quotation_sent", 40),
        ("Negotiation", "negotiation", 50),
        ("Converted to Order", "converted_to_order", 60),
        ("Invoice Sent", "invoice_sent", 70),
        ("Payment Received", "payment_received", 80),
        ("Dispatched", "dispatched", 90),
        ("Completed", "completed", 100),
        ("Lost", "lost", 110),
        ("Not Interested", "not_interested", 120),
    ],
    "connected_source": [
        ("Call", "call", 0),
        ("Email", "email", 10),
        ("Whatsapp", "whatsapp", 20),
    ],
    "inquiry_source": [
        ("Website", "website", 0),
        ("Referral", "referral", 10),
        ("Trade Show", "trade_show", 20),
        ("Existing Customer", "existing_customer", 30),
        ("Social Media", "social_media", 40),
    ],
}

DEFAULT_ADMIN_NAME = "Salvin Admin"
DEFAULT_ADMIN_EMAIL = "salvin@gmail.com"
DEFAULT_ADMIN_PASSWORD = "salvin@123"


def ensure_dynamic_column(db: Session, prop: Property) -> None:
    if prop.is_multi_value:
        return

    inspector = inspect(engine)
    table_name = "lead_manage" if prop.entity_type == "lead" else "companies"
    if table_name not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if prop.field_key in columns:
        return

    column_type = "TEXT"
    if prop.object_type in {"number", "integer"}:
        column_type = "INTEGER"
    elif prop.object_type == "boolean":
        column_type = "BOOLEAN"
    db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {prop.field_key} {column_type}"))


def seed_property_options(db: Session, prop: Property) -> None:
    default_options = DEFAULT_PROPERTY_OPTIONS.get(prop.field_key, [])
    if prop.field_key == "connected_source":
        valid_values = {value for _, value, _ in default_options}
        db.query(PropertyOption).filter(
            PropertyOption.property_id == prop.id,
            PropertyOption.value.notin_(valid_values),
        ).update({"is_active": False}, synchronize_session=False)

    for label, value, sort_order in default_options:
        option = (
            db.query(PropertyOption)
            .filter(PropertyOption.property_id == prop.id, PropertyOption.value == value)
            .first()
        )
        if not option:
            db.add(PropertyOption(property_id=prop.id, label=label, value=value, sort_order=sort_order, is_active=True))
        else:
            option.label = label
            option.sort_order = sort_order
            option.is_active = True


def seed_property_grids(db: Session, prop: Property) -> None:
    if not prop.show_on_grid:
        return

    if prop.field_key == "verification_status":
        grid_keys = ["companies", "my_leads", "assign_leads"]
    else:
        grid_keys = ["assign_leads", "my_leads", "inquiries"] if prop.entity_type == "lead" else ["companies", "inquiries"]
    grids = db.query(DisplayGrid).filter(DisplayGrid.key.in_(grid_keys), DisplayGrid.is_active.is_(True)).all()
    existing_grid_ids = {item.grid_id for item in prop.grids}
    for grid in grids:
        if grid.id in existing_grid_ids:
            continue
        prop.grids.append(PropertyGrid(grid_id=grid.id, grid_order=prop.grid_order or 0, grid_width=prop.grid_width or 160))


def seed_defaults(db: Session) -> None:
    permissions: list[Permission] = []
    for code, label, menu_key, menu_label, sort_order in DEFAULT_PERMISSIONS:
        permission = db.query(Permission).filter(Permission.code == code).first()
        if not permission:
            permission = Permission(code=code, label=label, menu_key=menu_key, menu_label=menu_label, sort_order=sort_order)
            db.add(permission)
            db.flush()
        else:
            permission.label = label
            permission.menu_key = menu_key
            permission.menu_label = menu_label
            permission.sort_order = sort_order
        permissions.append(permission)

    # Remove any permissions that are no longer in DEFAULT_PERMISSIONS
    valid_codes = [p[0] for p in DEFAULT_PERMISSIONS]
    db.query(Permission).filter(Permission.code.notin_(valid_codes)).delete(synchronize_session=False)

    admin_role = db.query(Role).filter(Role.name == "Admin").first()
    if not admin_role:
        admin_role = Role(name="Admin", description="Full system access")
        db.add(admin_role)
        db.flush()

    existing = {rp.permission_id for rp in admin_role.permissions}
    for permission in permissions:
        if permission.id not in existing:
            db.add(RolePermission(role_id=admin_role.id, permission_id=permission.id))

    admin = db.query(User).filter(User.email == DEFAULT_ADMIN_EMAIL).first()
    if not admin:
        db.add(
            User(
                name=DEFAULT_ADMIN_NAME,
                email=DEFAULT_ADMIN_EMAIL,
                hashed_password=hash_password(DEFAULT_ADMIN_PASSWORD),
                role_id=admin_role.id,
                is_active=True,
            )
        )
    else:
        admin.name = DEFAULT_ADMIN_NAME
        admin.hashed_password = hash_password(DEFAULT_ADMIN_PASSWORD)
        admin.role_id = admin_role.id
        admin.is_active = True

    for key, name, is_active, sort_order in DEFAULT_GRIDS:
        grid = db.query(DisplayGrid).filter(DisplayGrid.key == key).first()
        if not grid:
            db.add(DisplayGrid(key=key, name=name, is_active=is_active, sort_order=sort_order))
        else:
            grid.name = name
            grid.is_active = is_active
            grid.sort_order = sort_order

    for name, field_key, object_type, group, description, is_required, is_unique, is_multi_value, entity_type, filter_type, show_on_grid, grid_order, sort_order in DEFAULT_PROPERTIES:
        prop = db.query(Property).filter(Property.field_key == field_key).first()
        if not prop:
            prop = Property(
                name=name,
                field_key=field_key,
                object_type=object_type,
                group=group,
                description=description,
                is_required=is_required,
                is_unique=is_unique,
                is_multi_value=is_multi_value,
                entity_type=entity_type,
                filter_type=filter_type,
                is_active=True,
                show_on_grid=show_on_grid,
                grid_order=grid_order,
                sort_order=sort_order,
            )
            db.add(prop)
            db.flush()
        else:
            prop.name = name
            prop.object_type = object_type
            prop.group = group
            prop.description = description
            prop.is_required = is_required
            prop.is_unique = is_unique
            prop.is_multi_value = is_multi_value
            prop.entity_type = entity_type
            prop.filter_type = filter_type
            if not prop.grid_order:
                prop.show_on_grid = show_on_grid
                prop.grid_order = grid_order
            prop.sort_order = sort_order
        seed_property_options(db, prop)
        seed_property_grids(db, prop)
        ensure_dynamic_column(db, prop)
    db.commit()

    # Initialize verification_status to pending for existing companies
    db.execute(text("UPDATE companies SET verification_status = 'pending' WHERE verification_status IS NULL OR verification_status = ''"))
    db.commit()
