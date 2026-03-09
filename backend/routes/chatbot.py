from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import get_db
from models import ChatSession
from services.ai_service import (
    chat_with_bot,
    analyze_image_report,
    process_voice_message,
    generate_situation_summary
)
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


# ── SCHEMAS ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    user_id: int
    message: str
    history: list = []


class SituationReportRequest(BaseModel):
    reports: List[dict]


# ── HELPER ────────────────────────────────────────────────────────────────────
def save_chat(db: Session, user_id: int, message: str, response: str):
    try:
        db.add(ChatSession(user_id=user_id, message=message, response=response))
        db.commit()
    except Exception as e:
        print(f"[DB Warning] Could not save chat: {e}")


# ── ROUTE 1: TEXT CHAT ────────────────────────────────────────────────────────
@router.post("/message")
async def send_message(request: ChatRequest, db: Session = Depends(get_db)):
    """Main DRES-Bot text chat endpoint."""
    response = chat_with_bot(request.message, request.history)
    save_chat(db, request.user_id, request.message, response)
    return {"status": "success", "response": response}


# ── ROUTE 2: IMAGE ANALYSIS ───────────────────────────────────────────────────
@router.post("/analyze-image")
async def analyze_image(
    user_id:     int = Form(...),
    description: Optional[str] = Form(""),
    image:       UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Analyze a disaster photo using Gemini Vision."""
    image_bytes = await image.read()
    result = analyze_image_report(image_bytes, description or "")

    # Save to DB so admin can review image analysis logs
    save_chat(
        db, user_id,
        f"[IMAGE] {description or 'No description'}",
        result.get("analysis", "")
    )
    return result


# ── ROUTE 3: VOICE TRANSCRIPT ─────────────────────────────────────────────────
@router.post("/process-voice")
async def process_voice(
    user_id:    int = Form(...),
    transcript: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Accepts voice transcript from Web Speech API on the frontend
    and returns a plain-text AI response suitable to be read aloud.
    """
    response = process_voice_message(transcript)
    save_chat(db, user_id, f"[VOICE] {transcript}", response)
    return {"status": "success", "transcript": transcript, "response": response}


# ── ROUTE 4: SITUATION REPORT (admin) ────────────────────────────────────────
@router.post("/situation-report")
async def create_situation_report(payload: SituationReportRequest):
    """
    Auto-generate a formal MDRRMO Situation Report from a list of reports.
    Called from the admin dashboard's reporting module.
    """
    summary = generate_situation_summary(payload.reports)
    return {"status": "success", "report": summary}


# ── ROUTE 5: CHAT HISTORY (per user) ─────────────────────────────────────────
@router.get("/history/{user_id}")
def get_chat_history(
    user_id: int,
    limit:   int = 50,
    db: Session = Depends(get_db)
):
    """Returns chat history for a specific resident (for My Reports / review)."""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "status": "success",
        "data": [
            {
                "id":         s.id,
                "message":    s.message,
                "response":   s.response,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }


# ── ROUTE 6: ALL CHAT LOGS (admin dashboard) ──────────────────────────────────
@router.get("/admin/logs")
def get_all_logs(
    limit:  int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Returns all chatbot interactions for the admin Chatbot Logs page."""
    total = db.query(ChatSession).count()
    sessions = (
        db.query(ChatSession)
        .order_by(ChatSession.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return {
        "status": "success",
        "total":  total,
        "data": [
            {
                "id":         s.id,
                "user_id":    s.user_id,
                "message":    s.message,
                "response":   s.response,
                "created_at": s.created_at.strftime("%b %d, %Y %I:%M %p") if s.created_at else "—",
            }
            for s in sessions
        ]
    }
