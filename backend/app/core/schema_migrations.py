from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db import engine

COMPANY_RELATED_TABLES = [
    "person_contacts",
    "company_persons",
    "company_contacts",
    "company_multi_value_data",
    "company_field_values",
    "company_mobile_numbers",
    "csv_upload_logs",
    "csv_field_definitions",
    "companies",
]


def migrate_company_storage_schema(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    
    if "companies" not in tables:
        dialect = engine.dialect.name
        if dialect == "mysql":
            db.execute(text("""
                CREATE TABLE companies (
                    id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    company_name VARCHAR(180) NOT NULL,
                    created_by INTEGER,
                    created_at DATETIME,
                    updated_at DATETIME,
                    INDEX ix_companies_company_name (company_name),
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """))
        else:
            db.execute(text("""
                CREATE TABLE companies (
                    id INTEGER PRIMARY KEY,
                    company_name VARCHAR(180) NOT NULL,
                    created_by INTEGER,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(created_by) REFERENCES users (id)
                )
            """))
        db.commit()
        tables.add("companies")

    # Drop legacy tables
    legacy = ["person_contacts", "company_persons", "company_contacts", "marketing_tracking", "sales_tracking", "social_media_events"]
    for table in legacy:
        if table in tables:
            db.execute(text(f"DROP TABLE IF EXISTS {table}"))
    db.commit()


def sync_dynamic_columns(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "companies" not in tables or "lead_manage" not in tables:
        return

    company_columns = {column["name"] for column in inspector.get_columns("companies")}
    lead_columns = {column["name"] for column in inspector.get_columns("lead_manage")}
    
    company_core = {"id", "company_name", "created_at", "updated_at", "created_by"}
    lead_core = {"id", "company_id", "assigned_to_id", "assigned_by_id", "created_at", "updated_at", "follow_up_reminder_date", "follow_up_date"}
    
    from app.models import Property
    all_properties = db.query(Property).filter(Property.is_active == True).all()
    
    # Columns that SHOULD exist (single-value)
    single_value_props = [p for p in all_properties if not p.is_multi_value]
    multi_value_keys = {p.field_key for p in all_properties if p.is_multi_value}
    
    dialect = engine.dialect.name
    
    # Remove columns that are now multi-value from companies
    for col in company_columns:
        if col in multi_value_keys and col not in company_core:
            try:
                if dialect == "mysql":
                    db.execute(text(f"ALTER TABLE companies DROP COLUMN {col}"))
            except Exception as e:
                print(f"Error dropping column {col}: {e}")

    # Remove columns that are now multi-value from lead_manage
    for col in lead_columns:
        if col in multi_value_keys and col not in lead_core:
            try:
                if dialect == "mysql":
                    db.execute(text(f"ALTER TABLE lead_manage DROP COLUMN {col}"))
            except Exception as e:
                print(f"Error dropping column {col}: {e}")
    
    # Add columns for single-value properties
    for prop in single_value_props:
        col_type = "TEXT"
        if prop.object_type in ["number", "integer"]: col_type = "INTEGER"
        elif prop.object_type == "boolean": col_type = "BOOLEAN"
        
        target_table = "lead_manage" if prop.entity_type == "lead" else "companies"
        target_columns = lead_columns if prop.entity_type == "lead" else company_columns
        
        if prop.field_key not in target_columns:
            db.execute(text(f"ALTER TABLE {target_table} ADD COLUMN {prop.field_key} {col_type}"))
    
    db.commit()
    
def cleanup_legacy_company_columns(db: Session) -> None:
    inspector = inspect(engine)
    if "companies" not in set(inspector.get_table_names()):
        return
    columns = {column["name"] for column in inspector.get_columns("companies")}
    dialect = engine.dialect.name
    
    if dialect == "mysql":
        if "assigned_to" in columns:
            try:
                db.execute(text("ALTER TABLE companies DROP COLUMN assigned_to"))
            except Exception as e:
                print(f"Error dropping assigned_to: {e}")
        if "status" in columns:
            try:
                db.execute(text("ALTER TABLE companies DROP COLUMN status"))
            except Exception as e:
                print(f"Error dropping status: {e}")
    
    db.commit()

def migrate_property_field_key_uniqueness(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "properties" not in tables:
        return

    duplicates = db.execute(
        text(
            """
            SELECT field_key
            FROM properties
            GROUP BY field_key
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()

    for (field_key,) in duplicates:
        rows = db.execute(text("SELECT id FROM properties WHERE field_key = :field_key ORDER BY id"), {"field_key": field_key}).fetchall()
        for (property_id,) in rows[1:]:
            db.execute(text("UPDATE properties SET field_key = :field_key WHERE id = :id"), {"field_key": f"{field_key}_{property_id}", "id": property_id})

    db.commit()

    indexes = {index["name"] for index in inspector.get_indexes("properties")}
    constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("properties")}
    if "ix_properties_field_key_unique" in indexes or "uq_property_field_key" in constraints:
        return

    db.execute(text("CREATE UNIQUE INDEX ix_properties_field_key_unique ON properties (field_key)"))
    db.commit()


def migrate_property_unique_flag(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "properties" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("properties")}
    if "is_unique" in columns:
        return

    dialect = engine.dialect.name
    if dialect == "mysql":
        db.execute(text("ALTER TABLE properties ADD COLUMN is_unique BOOL NOT NULL DEFAULT 0"))
    else:
        db.execute(text("ALTER TABLE properties ADD COLUMN is_unique BOOLEAN NOT NULL DEFAULT 0"))
    db.commit()


def migrate_property_grid_columns(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "properties" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("properties")}
    dialect = engine.dialect.name
    if "show_on_grid" not in columns:
        if dialect == "mysql":
            db.execute(text("ALTER TABLE properties ADD COLUMN show_on_grid BOOL NOT NULL DEFAULT 0"))
        else:
            db.execute(text("ALTER TABLE properties ADD COLUMN show_on_grid BOOLEAN NOT NULL DEFAULT 0"))
    if "grid_order" not in columns:
        db.execute(text("ALTER TABLE properties ADD COLUMN grid_order INTEGER NOT NULL DEFAULT 0"))
    if "grid_width" not in columns:
        db.execute(text("ALTER TABLE properties ADD COLUMN grid_width INTEGER NOT NULL DEFAULT 160"))
    db.commit()


def migrate_display_grids(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    dialect = engine.dialect.name

    if "display_grids" not in tables:
        if dialect == "mysql":
            db.execute(
                text(
                    """
                    CREATE TABLE display_grids (
                        id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        grid_key VARCHAR(80) NOT NULL,
                        name VARCHAR(120) NOT NULL,
                        is_active BOOL NOT NULL DEFAULT 1,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at DATETIME,
                        updated_at DATETIME,
                        UNIQUE (grid_key)
                    )
                    """
                )
            )
        else:
            db.execute(
                text(
                    """
                    CREATE TABLE display_grids (
                        id INTEGER PRIMARY KEY,
                        grid_key VARCHAR(80) NOT NULL UNIQUE,
                        name VARCHAR(120) NOT NULL,
                        is_active BOOLEAN NOT NULL DEFAULT 1,
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
    else:
        display_grid_columns = {column["name"] for column in inspector.get_columns("display_grids")}
        if "grid_key" not in display_grid_columns and "key" in display_grid_columns:
            if dialect == "mysql":
                db.execute(text("ALTER TABLE display_grids CHANGE COLUMN `key` grid_key VARCHAR(80) NOT NULL"))
            else:
                db.execute(text('ALTER TABLE display_grids RENAME COLUMN "key" TO grid_key'))
        elif "grid_key" not in display_grid_columns:
            db.execute(text("ALTER TABLE display_grids ADD COLUMN grid_key VARCHAR(80)"))

    if "property_grids" not in tables and dialect == "mysql":
        db.execute(
            text(
                """
                CREATE TABLE property_grids (
                    id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    property_id INTEGER NOT NULL,
                    grid_id INTEGER NOT NULL,
                    grid_order INTEGER NOT NULL DEFAULT 0,
                    grid_width INTEGER NOT NULL DEFAULT 160,
                    created_at DATETIME,
                    updated_at DATETIME,
                    CONSTRAINT uq_property_grid UNIQUE (property_id, grid_id),
                    FOREIGN KEY(property_id) REFERENCES properties (id) ON DELETE CASCADE,
                    FOREIGN KEY(grid_id) REFERENCES display_grids (id) ON DELETE CASCADE
                )
                """
            )
        )
    elif "property_grids" not in tables:
        db.execute(
            text(
                """
                CREATE TABLE property_grids (
                    id INTEGER PRIMARY KEY,
                    property_id INTEGER NOT NULL,
                    grid_id INTEGER NOT NULL,
                    grid_order INTEGER NOT NULL DEFAULT 0,
                    grid_width INTEGER NOT NULL DEFAULT 160,
                    created_at DATETIME,
                    updated_at DATETIME,
                    CONSTRAINT uq_property_grid UNIQUE (property_id, grid_id),
                    FOREIGN KEY(property_id) REFERENCES properties (id) ON DELETE CASCADE,
                    FOREIGN KEY(grid_id) REFERENCES display_grids (id) ON DELETE CASCADE
                )
                """
            )
        )

    db.execute(
        text(
            """
            INSERT INTO display_grids (grid_key, name, is_active, sort_order, created_at, updated_at)
            SELECT :key, :name, 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            WHERE NOT EXISTS (SELECT 1 FROM display_grids WHERE grid_key = :key)
            """
        ),
        {"key": "companies", "name": "Companies"},
    )
    db.execute(
        text(
            """
            INSERT INTO display_grids (grid_key, name, is_active, sort_order, created_at, updated_at)
            SELECT :key, :name, 1, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            WHERE NOT EXISTS (SELECT 1 FROM display_grids WHERE grid_key = :key)
            """
        ),
        {"key": "assign_leads", "name": "Assign Leads"},
    )
    company_grid_id = db.execute(text("SELECT id FROM display_grids WHERE grid_key = :key"), {"key": "companies"}).scalar()
    if company_grid_id and "properties" in tables:
        db.execute(
            text(
                """
                INSERT INTO property_grids (property_id, grid_id, grid_order, grid_width, created_at, updated_at)
                SELECT id, :grid_id, grid_order, grid_width, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                FROM properties
                WHERE show_on_grid = 1
                AND NOT EXISTS (
                    SELECT 1 FROM property_grids
                    WHERE property_grids.property_id = properties.id
                    AND property_grids.grid_id = :grid_id
                )
                """
            ),
            {"grid_id": company_grid_id},
        )
    db.commit()


def migrate_user_hierarchy_profile_fields(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "parent_id" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN parent_id INTEGER"))
    if "profile_image_url" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN profile_image_url TEXT"))
    if "company_ids" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN company_ids TEXT"))
    db.commit()


def migrate_property_option_description(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "property_options" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("property_options")}
    if "description" not in columns:
        db.execute(text("ALTER TABLE property_options ADD COLUMN description TEXT"))
        db.commit()


def migrate_property_multi_value_flag(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "properties" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("properties")}
    if "is_multi_value" in columns:
        return

    dialect = engine.dialect.name
    if dialect == "mysql":
        db.execute(text("ALTER TABLE properties ADD COLUMN is_multi_value BOOL NOT NULL DEFAULT 0"))
    else:
        db.execute(text("ALTER TABLE properties ADD COLUMN is_multi_value BOOLEAN NOT NULL DEFAULT 0"))
    db.commit()

def migrate_property_filter_type(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "properties" not in tables:
        return

    columns = {column["name"] for column in inspector.get_columns("properties")}
    if "filter_type" in columns:
        return

    db.execute(text("ALTER TABLE properties ADD COLUMN filter_type VARCHAR(50) DEFAULT 'text'"))
    db.commit()


def migrate_drop_eav_unique_constraint(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "company_property_values" not in tables:
        return

    # Get all indexes and constraints
    indexes = {idx["name"] for idx in inspector.get_indexes("company_property_values")}
    constraints = {c["name"] for c in inspector.get_unique_constraints("company_property_values")}
    all_names = indexes.union(constraints)
    
    # Ensure both old and global constraints are dropped to allow flexibility
    for name in ["uq_company_property_value", "uq_property_value"]:
        if name in all_names:
            dialect = engine.dialect.name
            try:
                if dialect == "mysql":
                    db.execute(text(f"ALTER TABLE company_property_values DROP INDEX {name}"))
                else:
                    db.execute(text(f"DROP INDEX IF EXISTS {name}"))
                db.commit()
            except Exception: pass

def cleanup_duplicate_company_name_property(db: Session) -> None:
    # Delete the property record that conflicts with the core company_name column
    # Also cleanup any properties that were created with typos but mapped to company_name field key
    db.execute(text("DELETE FROM property_grids WHERE property_id IN (SELECT id FROM properties WHERE field_key = 'company_name')"))
    db.execute(text("DELETE FROM company_property_values WHERE property_id IN (SELECT id FROM properties WHERE field_key = 'company_name')"))
    db.execute(text("DELETE FROM properties WHERE field_key = 'company_name'"))
    db.commit()

def consolidate_product_to_requirement(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "lead_manage" not in tables:
        return
    
    columns = {column["name"] for column in inspector.get_columns("lead_manage")}
    if "product_service" in columns:
        dialect = engine.dialect.name
        if dialect == "mysql":
            db.execute(text("""
                UPDATE lead_manage 
                SET requirement = CASE 
                    WHEN (requirement IS NULL OR requirement = '') THEN product_service 
                    WHEN (product_service IS NULL OR product_service = '') THEN requirement 
                    ELSE CONCAT(requirement, ' (Product/Service: ', product_service, ')') 
                END 
                WHERE product_service IS NOT NULL AND product_service != ''
            """))
        else:
            db.execute(text("""
                UPDATE lead_manage 
                SET requirement = CASE 
                    WHEN (requirement IS NULL OR requirement = '') THEN product_service 
                    WHEN (product_service IS NULL OR product_service = '') THEN requirement 
                    ELSE requirement || ' (Product/Service: ' || product_service || ')' 
                END 
                WHERE product_service IS NOT NULL AND product_service != ''
            """))
        db.commit()
        
        db.execute(text("DELETE FROM property_grids WHERE property_id IN (SELECT id FROM properties WHERE field_key = 'product_service')"))
        db.execute(text("DELETE FROM company_property_values WHERE property_id IN (SELECT id FROM properties WHERE field_key = 'product_service')"))
        db.execute(text("DELETE FROM properties WHERE field_key = 'product_service'"))
        db.commit()
        
        if dialect == "mysql":
            try:
                db.execute(text("ALTER TABLE lead_manage DROP COLUMN product_service"))
                db.commit()
            except Exception as e:
                print(f"Error dropping product_service column: {e}")

def migrate_lead_manage_inquiry_field(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "lead_manage" not in tables:
        return
    columns = {column["name"] for column in inspector.get_columns("lead_manage")}
    if "is_inquiry" not in columns:
        dialect = engine.dialect.name
        if dialect == "mysql":
            db.execute(text("ALTER TABLE lead_manage ADD COLUMN is_inquiry BOOL NOT NULL DEFAULT 0"))
        else:
            db.execute(text("ALTER TABLE lead_manage ADD COLUMN is_inquiry BOOLEAN NOT NULL DEFAULT 0"))
        db.commit()

def migrate_vendors_schema(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    dialect = engine.dialect.name

    if "vendors" in tables:
        columns = {column["name"] for column in inspector.get_columns("vendors")}
        if "products" in columns and dialect == "mysql":
            try:
                db.execute(text("ALTER TABLE vendors DROP COLUMN products"))
                db.commit()
            except Exception as e:
                print(f"Error dropping products from vendors: {e}")

    if "vendor_contact_numbers" in tables:
        columns = {column["name"] for column in inspector.get_columns("vendor_contact_numbers")}
        if "contact" not in columns:
            if "contact_number" in columns:
                try:
                    if dialect == "mysql":
                        db.execute(text("ALTER TABLE vendor_contact_numbers CHANGE COLUMN contact_number contact VARCHAR(50)"))
                    else:
                        db.execute(text("ALTER TABLE vendor_contact_numbers RENAME COLUMN contact_number TO contact"))
                    db.commit()
                except Exception as e:
                    print(f"Error renaming contact_number to contact: {e}")
            else:
                try:
                    db.execute(text("ALTER TABLE vendor_contact_numbers ADD COLUMN contact VARCHAR(50)"))
                    db.commit()
                except Exception as e:
                    print(f"Error adding contact column: {e}")


def migrate_hourly_reports_calling_schema(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    dialect = engine.dialect.name

    # Check if 'hourly_reports' table exists and check/add 'work_type' column
    if "hourly_reports" in tables:
        columns = {column["name"] for column in inspector.get_columns("hourly_reports")}
        if "work_type" not in columns:
            db.execute(text("ALTER TABLE hourly_reports ADD COLUMN work_type VARCHAR(50) DEFAULT 'General'"))
            db.commit()

    # Check/create 'hourly_report_calls' table
    if "hourly_report_calls" not in tables:
        if dialect == "mysql":
            db.execute(
                text(
                    """
                    CREATE TABLE hourly_report_calls (
                        id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        report_id INTEGER NOT NULL,
                        contact_number VARCHAR(50) NOT NULL,
                        contact_person VARCHAR(120) NOT NULL,
                        contact_for TEXT NOT NULL,
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY(report_id) REFERENCES hourly_reports (id) ON DELETE CASCADE,
                        INDEX ix_hourly_report_calls_report_id (report_id)
                    )
                    """
                )
            )
        else:
            db.execute(
                text(
                    """
                    CREATE TABLE hourly_report_calls (
                        id INTEGER PRIMARY KEY,
                        report_id INTEGER NOT NULL,
                        contact_number VARCHAR(50) NOT NULL,
                        contact_person VARCHAR(120) NOT NULL,
                        contact_for TEXT NOT NULL,
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY(report_id) REFERENCES hourly_reports (id) ON DELETE CASCADE
                    )
                    """
                )
            )
            db.execute(text("CREATE INDEX ix_hourly_report_calls_report_id ON hourly_report_calls (report_id)"))
        db.commit()


def migrate_all(db: Session) -> None:
    # 1. First, update the 'properties' table schema so ORM queries don't fail
    migrate_property_filter_type(db)
    migrate_property_multi_value_flag(db)
    migrate_property_unique_flag(db)
    migrate_property_grid_columns(db)
    migrate_property_option_description(db)
    migrate_property_field_key_uniqueness(db)
    
    # 2. Now run other migrations that might use the Property model
    migrate_company_storage_schema(db)
    cleanup_legacy_company_columns(db)
    sync_dynamic_columns(db)
    migrate_display_grids(db)
    migrate_user_hierarchy_profile_fields(db)
    migrate_drop_eav_unique_constraint(db)
    cleanup_duplicate_company_name_property(db)
    migrate_lead_manage_inquiry_field(db)
    consolidate_product_to_requirement(db)
    migrate_vendors_schema(db)
    migrate_hourly_reports_calling_schema(db)
    migrate_leave_requests_half_days(db)
    migrate_our_companies_schema(db)

def migrate_leave_requests_half_days(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "leave_requests" not in tables:
        return
    columns = {column["name"] for column in inspector.get_columns("leave_requests")}
    dialect = engine.dialect.name
    if "start_half_day" not in columns:
        if dialect == "mysql":
            db.execute(text("ALTER TABLE leave_requests ADD COLUMN start_half_day BOOL NOT NULL DEFAULT 0"))
        else:
            db.execute(text("ALTER TABLE leave_requests ADD COLUMN start_half_day BOOLEAN NOT NULL DEFAULT 0"))
    if "end_half_day" not in columns:
        if dialect == "mysql":
            db.execute(text("ALTER TABLE leave_requests ADD COLUMN end_half_day BOOL NOT NULL DEFAULT 0"))
        else:
            db.execute(text("ALTER TABLE leave_requests ADD COLUMN end_half_day BOOLEAN NOT NULL DEFAULT 0"))
    if "half_day_details" not in columns:
        db.execute(text("ALTER TABLE leave_requests ADD COLUMN half_day_details TEXT"))
    if "cancel_reason" not in columns:
        db.execute(text("ALTER TABLE leave_requests ADD COLUMN cancel_reason TEXT"))
    db.commit()


def migrate_our_companies_schema(db: Session) -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    
    if "our_companies" not in tables:
        dialect = engine.dialect.name
        if dialect == "mysql":
            db.execute(text("""
                CREATE TABLE our_companies (
                    id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(180) NOT NULL UNIQUE,
                    logo_url TEXT,
                    website VARCHAR(255),
                    email VARCHAR(160),
                    phone VARCHAR(50),
                    address TEXT,
                    status VARCHAR(20) DEFAULT 'Active',
                    created_at DATETIME,
                    updated_at DATETIME,
                    INDEX ix_our_companies_name (name)
                )
            """))
        else:
            db.execute(text("""
                CREATE TABLE our_companies (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(180) NOT NULL UNIQUE,
                    logo_url TEXT,
                    website VARCHAR(255),
                    email VARCHAR(160),
                    phone VARCHAR(50),
                    address TEXT,
                    status VARCHAR(20) DEFAULT 'Active',
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            db.execute(text("CREATE UNIQUE INDEX ix_our_companies_name ON our_companies (name)"))
        db.commit()


