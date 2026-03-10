"""
Add this route to your routes/ folder as chatbot_logs.py
Then in main.py add:
    from routes import chatbot_logs
    app.include_router(chatbot_logs.router)

Also call log_chat() from dashboard.js whenever the bot responds.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import ChatSession

router = APIRouter(prefix="/api/admin", tags=["Chatbot Logs"])


class ChatLogRequest(BaseModel):
    user_id: int
    message: str
    response: str


# ── LOG A CHAT MESSAGE (called from frontend after each bot reply) ─────────────
@router.post("/chatbot-logs")
def log_chat(payload: ChatLogRequest, db: Session = Depends(get_db)):
    entry = ChatSession(
        user_id=payload.user_id,
        message=payload.message,
        response=payload.response,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"status": "success", "id": entry.id}


# ── GET ALL CHAT LOGS (admin) ──────────────────────────────────────────────────
@router.get("/chatbot-logs")
def get_chat_logs(
    user_id: Optional[int] = Query(None),
    limit:   int = Query(default=50),
    offset:  int = Query(default=0),
    db: Session = Depends(get_db)
):
    query = db.query(ChatSession)
    if user_id:
        query = query.filter(ChatSession.user_id == user_id)

    total = query.count()
    logs = query.order_by(ChatSession.created_at.desc()
                          ).offset(offset).limit(limit).all()

    return {
        "status": "success",
        "total":  total,
        "data": [
            {
                "id":         l.id,
                "user_id":    l.user_id,
                "message":    l.message,
                "response":   l.response,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]
    }


# ── STATS ──────────────────────────────────────────────────────────────────────
@router.get("/chatbot-stats")
def get_chatbot_stats(db: Session = Depends(get_db)):
    total = db.query(ChatSession).count()
    unique_users = db.query(ChatSession.user_id).distinct().count()
    return {
        "status": "success",
        "data": {
            "total_conversations": total,
            "unique_users":        unique_users,
        }
    }
