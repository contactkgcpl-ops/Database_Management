from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import get_db
from app.deps import require_any_permission, current_user
from app.models import User, GlobalChatMessage, UserChatState
from app.schemas import UserOut
from app.modules.auth.router import serialize_user
from datetime import datetime

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatMessageCreate(BaseModel):
    message: str

class ChatMessageOut(BaseModel):
    id: int
    user_id: int | None
    message: str
    created_at: datetime
    user: UserOut | None
    
    class Config:
        from_attributes = True

@router.get("", response_model=list[ChatMessageOut])
def get_chat_messages(limit: int = 100, db: Session = Depends(get_db), user: User = Depends(current_user)):
    messages = db.query(GlobalChatMessage).order_by(GlobalChatMessage.id.desc()).limit(limit).all()
    # Return in chronological order (oldest first)
    messages.reverse()
    
    result = []
    for msg in messages:
        user_out = serialize_user(msg.user) if msg.user else None
        result.append(ChatMessageOut(
            id=msg.id,
            user_id=msg.user_id,
            message=msg.message,
            created_at=msg.created_at,
            user=user_out
        ))
    return result

@router.post("", response_model=ChatMessageOut)
def send_chat_message(payload: ChatMessageCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    msg = GlobalChatMessage(
        user_id=user.id,
        message=payload.message
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    # Auto mark as read for sender
    chat_state = db.query(UserChatState).filter(UserChatState.user_id == user.id).first()
    if not chat_state:
        chat_state = UserChatState(user_id=user.id, last_read_message_id=msg.id)
        db.add(chat_state)
    else:
        chat_state.last_read_message_id = msg.id
    db.commit()
    
    user_out = serialize_user(msg.user)
    return ChatMessageOut(
        id=msg.id,
        user_id=msg.user_id,
        message=msg.message,
        created_at=msg.created_at,
        user=user_out
    )

@router.get("/unread")
def get_unread_count(db: Session = Depends(get_db), user: User = Depends(current_user)):
    chat_state = db.query(UserChatState).filter(UserChatState.user_id == user.id).first()
    last_read_id = chat_state.last_read_message_id if chat_state else 0
    
    count = db.query(GlobalChatMessage).filter(GlobalChatMessage.id > last_read_id).count()
    return {"unread_count": count}

@router.post("/read")
def mark_chat_read(db: Session = Depends(get_db), user: User = Depends(current_user)):
    # Get highest message id
    latest_msg = db.query(func.max(GlobalChatMessage.id)).scalar() or 0
    
    chat_state = db.query(UserChatState).filter(UserChatState.user_id == user.id).first()
    if not chat_state:
        chat_state = UserChatState(user_id=user.id, last_read_message_id=latest_msg)
        db.add(chat_state)
    else:
        chat_state.last_read_message_id = latest_msg
    db.commit()
    
    return {"ok": True, "last_read_message_id": latest_msg}
