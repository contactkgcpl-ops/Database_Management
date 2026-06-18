import datetime
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from app.models import Order, BOM, BOMItem, Company, User
from app.schemas import OrderCreate, OrderUpdate, BOMCreate


def list_orders(db: Session, q: str | None = None) -> list[Order]:
    query = db.query(Order).options(
        joinedload(Order.company),
        joinedload(Order.created_by),
        joinedload(Order.bom)
    )
    if q:
        search_filter = or_(
            Order.order_number.like(f"%{q}%"),
            Order.description.like(f"%{q}%"),
            Order.company_name.like(f"%{q}%"),
            Company.company_name.like(f"%{q}%")
        )
        query = query.join(Order.company, isouter=True).filter(search_filter)
    
    return query.order_by(Order.created_at.desc()).all()


def get_order(db: Session, order_id: int) -> Order | None:
    return db.query(Order).options(
        joinedload(Order.company),
        joinedload(Order.created_by),
        joinedload(Order.bom)
    ).filter(Order.id == order_id).first()


def create_order(db: Session, payload: OrderCreate, user_id: int) -> Order:
    # Auto-generate order number if not provided
    if not payload.order_number or not payload.order_number.strip():
        today = datetime.date.today().strftime("%Y%m%d")
        count = db.query(Order).filter(Order.order_number.like(f"ORD-{today}-%")).count()
        payload.order_number = f"ORD-{today}-{count + 1:04d}"

    # Calculate total amount
    total_amount = (payload.amount_in_rupee or 0.0) * (payload.quantity or 0.0)

    db_order = Order(
        order_number=payload.order_number,
        company_id=payload.company_id,
        company_name=payload.company_name,
        order_date=payload.order_date,
        delivery_date=payload.delivery_date,
        amount_in_rupee=payload.amount_in_rupee or 0.0,
        quantity=payload.quantity or 0.0,
        total_amount=total_amount,
        description=payload.description,
        status=payload.status or "Pending",
        created_by_id=user_id
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return get_order(db, db_order.id)


def update_order(db: Session, order_id: int, payload: OrderUpdate, user_id: int) -> Order | None:
    db_order = get_order(db, order_id)
    if not db_order:
        return None

    update_data = payload.model_dump(exclude_unset=True)
    
    # Recalculate total_amount if either rate or quantity is updated
    new_rate = update_data.get("amount_in_rupee", db_order.amount_in_rupee)
    new_qty = update_data.get("quantity", db_order.quantity)
    update_data["total_amount"] = (new_rate or 0.0) * (new_qty or 0.0)

    for key, value in update_data.items():
        setattr(db_order, key, value)

    db.commit()
    db.refresh(db_order)
    return get_order(db, db_order.id)


def delete_order(db: Session, order: Order) -> None:
    db.delete(order)
    db.commit()


def get_bom_by_order_id(db: Session, order_id: int) -> BOM | None:
    return db.query(BOM).options(
        joinedload(BOM.items)
    ).filter(BOM.order_id == order_id).first()


def create_or_update_bom(db: Session, order_id: int, payload: BOMCreate, user_id: int) -> BOM:
    # Find if a BOM already exists for this order
    db_bom = db.query(BOM).filter(BOM.order_id == order_id).first()
    
    if not db_bom:
        # Create new BOM
        db_bom = BOM(
            order_id=order_id,
            status="Draft",
            created_by_id=user_id
        )
        db.add(db_bom)
        db.flush()
    else:
        # Delete existing items for full replacement
        db.query(BOMItem).filter(BOMItem.bom_id == db_bom.id).delete()
        db_bom.updated_at = datetime.datetime.utcnow()

    # Add new items
    for item in payload.items:
        db_item = BOMItem(
            bom_id=db_bom.id,
            item_name=item.item_name,
            quantity=item.quantity,
            available_stock=item.available_stock or 0.0,
            unit=item.unit,
            supplier=item.supplier,
            specification=item.specification,
            estimated_cost=item.estimated_cost or 0.0,
            remarks=item.remarks
        )
        db.add(db_item)

    # If the order is currently "Pending", upgrade its status to "BOM Created"
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if db_order and db_order.status == "Pending":
        db_order.status = "BOM Created"

    db.commit()
    db.refresh(db_bom)
    
    # Reload with items
    return get_bom_by_order_id(db, order_id)


def send_bom_to_purchase(db: Session, order_id: int) -> BOM | None:
    db_bom = db.query(BOM).filter(BOM.order_id == order_id).first()
    if not db_bom:
        return None

    db_bom.status = "Sent to Purchase"
    
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if db_order:
        db_order.status = "BOM Sent to Purchase"

    db.commit()
    db.refresh(db_bom)
    return get_bom_by_order_id(db, order_id)


def list_purchase_indents(db: Session) -> list[BOM]:
    return db.query(BOM).options(
        joinedload(BOM.order).joinedload(Order.company),
        joinedload(BOM.items)
    ).filter(BOM.status != "Draft").order_by(BOM.updated_at.desc()).all()


def update_bom_status(db: Session, order_id: int, status: str) -> BOM | None:
    db_bom = db.query(BOM).filter(BOM.order_id == order_id).first()
    if not db_bom:
        return None

    db_bom.status = status
    
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if db_order:
        if status == "Received":
            db_order.status = "In Production"
        elif status == "PO Sent":
            db_order.status = "In Progress"
        else:
            db_order.status = f"BOM {status}"

    db.commit()
    db.refresh(db_bom)
    return get_bom_by_order_id(db, order_id)
