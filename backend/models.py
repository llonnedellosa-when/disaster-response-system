from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Enum
from sqlalchemy.sql import func
from database import Base
import enum


class UserRole(str, enum.Enum):
    resident = "resident"
    mdrrmo = "mdrrmo"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    reviewed = "reviewed"
    resolved = "resolved"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    email = Column(String(100), unique=True, index=True)
    password = Column(String(200))
    barangay = Column(String(100))
    role = Column(Enum(UserRole), default=UserRole.resident)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class IncidentReport(Base):
    __tablename__ = "incident_reports"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    barangay = Column(String(100))
    report_type = Column(String(50))   # flood, damage, missing person, etc.
    description = Column(Text)
    image_path = Column(String(200), nullable=True)
    voice_transcript = Column(Text, nullable=True)
    ai_analysis = Column(Text, nullable=True)    # Gemini's image/text analysis
    # low, moderate, high, critical
    severity = Column(String(20), nullable=True)
    status = Column(Enum(ReportStatus), default=ReportStatus.pending)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    message = Column(Text)
    response = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
