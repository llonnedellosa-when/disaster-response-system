from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import get_db
from models import User, UserRole
import hashlib
import secrets

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── HELPERS ───────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Simple SHA-256 hash. Use bcrypt in production."""
    return hashlib.sha256(password.encode()).hexdigest()


def make_token(user_id: int, role: str) -> str:
    """Simple token. Use JWT in production."""
    return hashlib.sha256(f"{user_id}:{role}:{secrets.token_hex(8)}".encode()).hexdigest()


# ── SCHEMAS ───────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    barangay: Optional[str] = None
    contact: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


# ── REGISTER ──────────────────────────────────────────────────────────────────
@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    # Check if email already exists
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Email already registered.")

    user = User(
        name=payload.name,
        email=payload.email,
        password=hash_password(payload.password),
        barangay=payload.barangay,
        role=UserRole.resident,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "status":  "success",
        "message": "Account created successfully.",
        "data": {
            "user_id":  user.id,
            "name":     user.name,
            "email":    user.email,
            "barangay": user.barangay,
            "role":     user.role,
        }
    }


# ── LOGIN ─────────────────────────────────────────────────────────────────────
@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or user.password != hash_password(payload.password):
        raise HTTPException(
            status_code=401, detail="Invalid email or password.")

    token = make_token(user.id, user.role)

    return {
        "status": "success",
        "data": {
            "user_id":  user.id,
            "name":     user.name,
            "email":    user.email,
            "barangay": user.barangay,
            "role":     user.role,
            "token":    token,
        }
    }


# ── LOGOUT ────────────────────────────────────────────────────────────────────
@router.post("/logout")
def logout():
    return {"status": "success", "message": "Logged out."}
