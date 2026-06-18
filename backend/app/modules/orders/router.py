from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import require_permission
from app.models import User, Order
from app.schemas import (
    OrderCreate,
    OrderUpdate,
    OrderOut,
    BOMCreate,
    BOMOut,
)
from app.modules.orders.services import (
    list_orders,
    get_order,
    create_order,
    update_order,
    delete_order,
    get_bom_by_order_id,
    create_or_update_bom,
    send_bom_to_purchase,
    list_purchase_indents,
    update_bom_status,
)

router = APIRouter(prefix="/orders", tags=["orders"])


def to_order_out(db_order: Order) -> OrderOut:
    return OrderOut(
        id=db_order.id,
        order_number=db_order.order_number,
        company_id=db_order.company_id,
        company_name=db_order.company_name or (db_order.company.company_name if db_order.company else None),
        order_date=db_order.order_date,
        delivery_date=db_order.delivery_date,
        amount_in_rupee=db_order.amount_in_rupee,
        quantity=db_order.quantity,
        total_amount=db_order.total_amount,
        description=db_order.description,
        status=db_order.status,
        created_by_id=db_order.created_by_id,
        created_by_name=db_order.created_by.name if db_order.created_by else None,
        created_at=db_order.created_at,
        updated_at=db_order.updated_at,
        has_bom=db_order.bom is not None,
        bom_status=db_order.bom.status if db_order.bom else None
    )


@router.get("", response_model=list[OrderOut])
def get_orders(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("orders.view")),
):
    orders = list_orders(db, q)
    return [to_order_out(o) for o in orders]


@router.get("/purchase-indents", response_model=list[BOMOut])
def get_purchase_indents(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("vendors.view")),
):
    return list_purchase_indents(db)


@router.get("/{order_id}", response_model=OrderOut)
def get_order_record(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("orders.view")),
):
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return to_order_out(order)


@router.post("", response_model=OrderOut)
def create_order_record(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = create_order(db, payload, user.id)
    return to_order_out(order)


@router.put("/{order_id}", response_model=OrderOut)
def update_order_record(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    updated = update_order(db, order_id, payload, user.id)
    return to_order_out(updated)


@router.delete("/{order_id}")
def delete_order_record(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("orders.manage")),
):
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    delete_order(db, order)
    return {"ok": True}


@router.get("/{order_id}/bom", response_model=BOMOut)
def get_order_bom(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("orders.view")),
):
    # Verify order exists
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    bom = get_bom_by_order_id(db, order_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found for this order")
    return bom


@router.post("/{order_id}/bom", response_model=BOMOut)
def save_order_bom(
    order_id: int,
    payload: BOMCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # If BOM is already sent to purchase, we restrict saving changes unless user is admin or we permit corrections
    bom = get_bom_by_order_id(db, order_id)
    if bom and bom.status == "Sent to Purchase":
        # Allow edit if needed, or enforce rule. The user prompt says:
        # "once bom send to purchase then add only show button edit... on click a bom purchase ma send thay jshe, once bom send to purchase then add only show button edit and with text with indiacate ke bom sended to purchase"
        # It implies they can still edit the BOM even after sending to purchase, but the UI indicates it was sended to purchase and limits actions (like sending again).
        pass

    updated_bom = create_or_update_bom(db, order_id, payload, user.id)
    return updated_bom


@router.post("/{order_id}/bom/send-to-purchase", response_model=BOMOut)
def forward_bom_to_purchase(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    bom = get_bom_by_order_id(db, order_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found for this order. Create it first.")
    
    updated_bom = send_bom_to_purchase(db, order_id)
    return updated_bom




class BOMStatusUpdatePayload(BaseModel):
    status: str


@router.put("/{order_id}/bom/status", response_model=BOMOut)
def change_bom_status(
    order_id: int,
    payload: BOMStatusUpdatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("vendors.manage")),
):
    bom = get_bom_by_order_id(db, order_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found for this order")
    
    updated = update_bom_status(db, order_id, payload.status)
    return updated
