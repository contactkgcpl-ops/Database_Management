from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.db import get_db, SessionLocal
from app.deps import require_any_permission, current_user
from app.models import User, GlobalChatMessage, UserChatState, Role, RolePermission
from app.schemas import UserOut
from app.modules.auth.router import serialize_user
from app.security import decode_token
from datetime import datetime

router = APIRouter(prefix="/chat", tags=["chat"])

import asyncio

_main_loop = None

def set_main_loop(loop):
    global _main_loop
    _main_loop = loop

def get_main_loop():
    return _main_loop

class ConnectionManager:
    def __init__(self):
        # Maps user_id (int) -> list of WebSockets
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast(self, message: dict):
        # Broadcast to all connections (used for global chat)
        for user_id, connections in list(self.active_connections.items()):
            for connection in list(connections):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(user_id, connection)

    async def send_to_user(self, user_id: int, message: dict):
        # Send targeted message to specific user's connection(s) (used for notifications)
        if user_id in self.active_connections:
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(user_id, connection)

manager = ConnectionManager()

def send_notification_to_user_sync(user_id: int, message: dict):
    loop = get_main_loop()
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.send_to_user(user_id, message), loop)

def get_websocket_user(token: str, db: Session) -> User | None:
    email = decode_token(token)
    if not email:
        return None
    user = (
        db.query(User)
        .options(joinedload(User.role).joinedload(Role.permissions).joinedload(RolePermission.permission))
        .filter(User.email == email)
        .first()
    )
    if not user or not user.is_active:
        return None
    return user

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
async def send_chat_message(payload: ChatMessageCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
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
    msg_out = ChatMessageOut(
        id=msg.id,
        user_id=msg.user_id,
        message=msg.message,
        created_at=msg.created_at,
        user=user_out
    )
    
    # Broadcast new message as chat type to all active WebSocket connections
    await manager.broadcast({
        "type": "chat",
        "payload": jsonable_encoder(msg_out)
    })
    
    return msg_out

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


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = None
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    db = SessionLocal()
    try:
        user = get_websocket_user(token, db)
    finally:
        db.close()
        
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    await manager.connect(user.id, websocket)
    try:
        while True:
            # Receive incoming message json
            data = await websocket.receive_json()
            message_text = data.get("message")
            if message_text and message_text.strip():
                db_session = SessionLocal()
                try:
                    msg = GlobalChatMessage(
                        user_id=user.id,
                        message=message_text
                    )
                    db_session.add(msg)
                    db_session.commit()
                    db_session.refresh(msg)
                    
                    # Auto mark as read for sender
                    chat_state = db_session.query(UserChatState).filter(UserChatState.user_id == user.id).first()
                    if not chat_state:
                        chat_state = UserChatState(user_id=user.id, last_read_message_id=msg.id)
                        db_session.add(chat_state)
                    else:
                        chat_state.last_read_message_id = msg.id
                    db_session.commit()
                    
                    user_out = serialize_user(msg.user)
                    msg_out = ChatMessageOut(
                        id=msg.id,
                        user_id=msg.user_id,
                        message=msg.message,
                        created_at=msg.created_at,
                        user=user_out
                    )
                    
                    # Broadcast to everyone
                    await manager.broadcast({
                        "type": "chat",
                        "payload": jsonable_encoder(msg_out)
                    })
                finally:
                    db_session.close()
    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception:
        manager.disconnect(user.id, websocket)
