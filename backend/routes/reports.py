from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from database import get_db
from models import IncidentReport, ReportStatus, User
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import shutil

router = APIRouter(prefix="/api/reports", tags=["Reports"])

UPLOAD_DIR = "uploads/images"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── SCHEMAS ───────────────────────────────────────────────────────────────────
class ReportUpdate(BaseModel):
    status: Optional[ReportStatus] = None
    severity: Optional[str] = None
    ai_analysis: Optional[str] = None


# ── HELPER ───────────────────────────────────────────────────────────────────
def report_to_dict(r: IncidentReport):
    return {
        "id":               r.id,
        "user_id":          r.user_id,
        "barangay":         r.barangay,
        "report_type":      r.report_type,
        "description":      r.description,
        "image_path":       r.image_path,
        "voice_transcript": r.voice_transcript,
        "ai_analysis":      r.ai_analysis,
        "severity":         r.severity,
        "status":           r.status,
        "latitude":         r.latitude,
        "longitude":        r.longitude,
        "created_at":       r.created_at.isoformat() if r.created_at else None,
    }


# ── CREATE REPORT (with optional image + voice) ───────────────────────────────
@router.post("/submit")
async def submit_report(
    user_id:          int = Form(...),
    barangay:         str = Form(...),
    report_type:      str = Form(...),
    description:      str = Form(...),
    severity:         Optional[str] = Form(None),
    latitude:         Optional[float] = Form(None),
    longitude:        Optional[float] = Form(None),
    voice_transcript: Optional[str] = Form(None),
    image:            Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):

    image_path = f"/uploads/images/{filename}"

    # Save image if provided
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1]
        filename = f"report_{datetime.now().strftime('%Y%m%d%H%M%S')}_{user_id}{ext}"
        save_path = os.path.join(UPLOAD_DIR, filename)
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_path = save_path

    report = IncidentReport(
        user_id=user_id,
        barangay=barangay,
        report_type=report_type,
        description=description,
        severity=severity,
        latitude=latitude,
        longitude=longitude,
        voice_transcript=voice_transcript,
        image_path=image_path,
        status=ReportStatus.pending,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"status": "success", "message": "Report submitted successfully.", "data": report_to_dict(report)}


# ── READ ALL REPORTS (admin) ──────────────────────────────────────────────────
@router.get("/")
def get_all_reports(
    status:      Optional[str] = Query(None),
    barangay:    Optional[str] = Query(None),
    report_type: Optional[str] = Query(None),
    severity:    Optional[str] = Query(None),
    limit:       int = Query(default=50),
    offset:      int = Query(default=0),
    db: Session = Depends(get_db)
):
    """
    Get all reports with optional filters.
    Used by the admin dashboard.
    """
    query = db.query(IncidentReport)

    if status:
        query = query.filter(IncidentReport.status == status)
    if barangay:
        query = query.filter(IncidentReport.barangay == barangay)
    if report_type:
        query = query.filter(IncidentReport.report_type == report_type)
    if severity:
        query = query.filter(IncidentReport.severity == severity)

    total = query.count()
    reports = query.order_by(IncidentReport.created_at.desc()).offset(
        offset).limit(limit).all()

    return {
        "status": "success",
        "total":  total,
        "data":   [report_to_dict(r) for r in reports]
    }


# ── READ REPORTS BY USER (resident app) ───────────────────────────────────────
@router.get("/user/{user_id}")
def get_user_reports(user_id: int, db: Session = Depends(get_db)):
    """
    Get all reports submitted by a specific resident.
    Used by the resident mobile app.
    """
    reports = (
        db.query(IncidentReport)
        .filter(IncidentReport.user_id == user_id)
        .order_by(IncidentReport.created_at.desc())
        .all()
    )
    return {"status": "success", "data": [report_to_dict(r) for r in reports]}


# ── READ SINGLE REPORT ────────────────────────────────────────────────────────
@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get a single report by ID."""
    report = db.query(IncidentReport).filter(
        IncidentReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "success", "data": report_to_dict(report)}


# ── UPDATE REPORT STATUS (admin) ──────────────────────────────────────────────
@router.patch("/{report_id}")
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db)):
    """
    Admin updates the status, severity, or AI analysis of a report.
    e.g. mark as reviewed or resolved.
    """
    report = db.query(IncidentReport).filter(
        IncidentReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if payload.status is not None:
        report.status = payload.status
    if payload.severity is not None:
        report.severity = payload.severity
    if payload.ai_analysis is not None:
        report.ai_analysis = payload.ai_analysis

    db.commit()
    db.refresh(report)
    return {"status": "success", "message": "Report updated.", "data": report_to_dict(report)}


# ── DELETE REPORT (admin) ─────────────────────────────────────────────────────
@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """Admin deletes a report."""
    report = db.query(IncidentReport).filter(
        IncidentReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Delete image file if exists
    if report.image_path and os.path.exists(report.image_path):
        os.remove(report.image_path)

    db.delete(report)
    db.commit()
    return {"status": "success", "message": "Report deleted."}


# ── RECENT REPORTS (admin dashboard) ─────────────────────────────────────────
@router.get("/admin/recent")
def get_recent_reports(limit: int = Query(default=5), db: Session = Depends(get_db)):
    """Returns the most recent reports for the admin dashboard widget."""
    reports = (
        db.query(IncidentReport)
        .order_by(IncidentReport.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "status": "success",
        "data": [
            {
                "id":          f"RPT-{r.id:04d}",
                "barangay":    r.barangay,
                "type":        r.report_type,
                "status":      r.status.value.capitalize(),
                "time":        r.created_at.isoformat() if r.created_at else "—",
            }
            for r in reports
        ]
    }


# ── STATS FOR ADMIN DASHBOARD ─────────────────────────────────────────────────
@router.get("/admin/summary")
def get_report_summary(db: Session = Depends(get_db)):
    """Returns counts by status for the admin dashboard stat cards."""
    total = db.query(IncidentReport).count()
    pending = db.query(IncidentReport).filter(
        IncidentReport.status == ReportStatus.pending).count()
    reviewed = db.query(IncidentReport).filter(
        IncidentReport.status == ReportStatus.reviewed).count()
    resolved = db.query(IncidentReport).filter(
        IncidentReport.status == ReportStatus.resolved).count()
    rate = round((resolved / total * 100)) if total else 0

    return {
        "status": "success",
        "data": {
            "total":    total,
            "pending":  pending,
            "reviewed": reviewed,
            "resolved": resolved,
            "resolution_rate": rate,
        }
    }
