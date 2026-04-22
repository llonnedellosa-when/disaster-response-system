from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from database import get_db
from models import IncidentReport, ReportStatus, User

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def ok(data):
    return {"status": "success", "data": data}


# ── DASHBOARD STATS ───────────────────────────────────────────────────────────
@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    from datetime import datetime
    current_year = datetime.now().year

    total_reports = db.query(IncidentReport).filter(
        extract("year", IncidentReport.created_at) == current_year
    ).count()

    resolved = db.query(IncidentReport).filter(
        IncidentReport.status == ReportStatus.resolved
    ).count()

    total = db.query(IncidentReport).count()
    rate = round((resolved / total * 100)) if total else 0

    affected_barangays = db.query(IncidentReport.barangay).distinct().count()

    pending = db.query(IncidentReport).filter(
        IncidentReport.status == ReportStatus.pending
    ).count()

    stats = [
        {"icon": '<i class="fa-solid fa-hurricane" style="color: rgb(255, 0, 0);"></i>', "label": "Active Typhoon Alerts",         "value": "0",
            "sub": "No active alerts",        "color": "#ef4444"},
        {"icon": '<i class="fa-regular fa-clipboard" style="color: rgb(26, 108, 255);"></i>', "label": f"Total Reports ({current_year})", "value": str(
            total_reports),     "sub": "This year",               "color": "#3b82f6"},
        {"icon": '<i class="fa-solid fa-house-circle-exclamation" style="color: rgb(210, 127, 16);"></i>', "label": "Affected Barangays",            "value": str(
            affected_barangays), "sub": "With submitted reports",  "color": "#f59e0b"},
        {"icon": '<i class="fa-solid fa-hourglass-half" style="color: rgb(135, 11, 196);"></i>', "label": "Pending Reports",                "value": str(
            pending),            "sub": "Awaiting review",         "color": "#d83cff"},
        {"icon": '<i class="fa-solid fa-clipboard-check" style="color: rgb(59, 214, 17);"></i>', "label": "Resolved Incidents",             "value": str(
            resolved),           "sub": f"{rate}% resolution rate", "color": "#22c55e"},
    ]
    return ok(stats)


# ── MONTHLY DISASTERS ─────────────────────────────────────────────────────────
@router.get("/disasters/monthly")
def get_monthly_disasters(year: int = Query(default=2024), db: Session = Depends(get_db)):
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    data = [{"label": m, "reports": 0, "affected": 0} for m in months]

    rows = (
        db.query(
            extract("month", IncidentReport.created_at).label("month"),
            func.count(IncidentReport.id).label("reports")
        )
        .filter(extract("year", IncidentReport.created_at) == year)
        .group_by("month")
        .all()
    )
    for row in rows:
        idx = int(row.month) - 1
        data[idx]["reports"] = row.reports

    return ok(data)


# ── YEARLY DISASTERS ──────────────────────────────────────────────────────────
@router.get("/disasters/yearly")
def get_yearly_disasters(db: Session = Depends(get_db)):
    rows = (
        db.query(
            extract("year", IncidentReport.created_at).label("year"),
            func.count(IncidentReport.id).label("reports")
        )
        .group_by("year")
        .order_by("year")
        .all()
    )

    data = [
        {"label": str(int(r.year)), "reports": r.reports,
         "affected": 0, "typhoons": 0}
        for r in rows
    ]

    if not data:
        data = [
            {"label": "2019", "reports": 145, "affected": 892,  "typhoons": 4},
            {"label": "2020", "reports": 234, "affected": 1456, "typhoons": 6},
            {"label": "2021", "reports": 98,  "affected": 612,  "typhoons": 3},
            {"label": "2022", "reports": 187, "affected": 1123, "typhoons": 5},
            {"label": "2023", "reports": 312, "affected": 2045, "typhoons": 7},
            {"label": "2024", "reports": 276, "affected": 1678, "typhoons": 5},
        ]

    return ok(data)


# ── FLOOD-PRONE BARANGAYS ─────────────────────────────────────────────────────
@router.get("/flood-barangays")
def get_flood_barangays():
    data = [
        {"name": "Barangay Magpanambo",   "risk": "High",
            "households": 312, "lastFlooded": "2024"},
        {"name": "Barangay Oas",           "risk": "High",
            "households": 278, "lastFlooded": "2023"},
        {"name": "Barangay San Francisco", "risk": "High",
            "households": 195, "lastFlooded": "2024"},
        {"name": "Barangay Tinago",        "risk": "Medium",
            "households": 243, "lastFlooded": "2023"},
        {"name": "Barangay Salvacion",     "risk": "Medium",
            "households": 187, "lastFlooded": "2022"},
        {"name": "Barangay Paulba",        "risk": "Medium",
            "households": 156, "lastFlooded": "2023"},
        {"name": "Barangay Cotmon",        "risk": "Low",
            "households": 134, "lastFlooded": "2021"},
        {"name": "Barangay Tambo",         "risk": "Low",
            "households": 98,  "lastFlooded": "2021"},
    ]
    return ok(data)


# ── RECENT REPORTS ────────────────────────────────────────────────────────────
@router.get("/reports/recent")
def get_recent_reports(limit: int = Query(default=5), db: Session = Depends(get_db)):
    reports = (
        db.query(IncidentReport)
        .order_by(IncidentReport.created_at.desc())
        .limit(limit)
        .all()
    )
    data = [
        {
            "id":       f"RPT-{r.id:04d}",
            "barangay": r.barangay,
            "type":     r.report_type,
            "status":   r.status.value.capitalize(),
            "time":     r.created_at.strftime("%b %d, %Y %I:%M %p") if r.created_at else "---",
        }
        for r in reports
    ]
    return ok(data)


# ── MUNICIPAL DATA ────────────────────────────────────────────────────────────
@router.get("/municipal")
def get_municipal():
    data = {
        "profile": [
            ["Municipality",     "Polangui"],
            ["Province",         "Albay"],
            ["Population",       "118,657"],
            ["Land Area",        "239.83 km2"],
            ["No. of Barangays", "44"],
            ["Households",       "24,890"],
            ["Elevation Range",  "40-1,550 m"],
            ["Main River",       "Polangui River"],
            ["Disaster Risk",    "High"],
        ],
        "contact": [
            ["Office Head",     "---"],
            ["Contact No.",     "(052) 830-0000"],
            ["Office",          "Municipal DRRMO Polangui"],
            ["Email",           "mdrrmo@polangui.gov.ph"],
            ["Operating Hours", "24/7 during alerts"],
        ]
    }
    return ok(data)


# ── ALERT LEVELS ──────────────────────────────────────────────────────────────
@router.get("/alert-levels")
def get_alert_levels():
    data = [
        {"level": "Signal #1",
            "desc": "Moderate winds (30-60 km/h)",     "active": False},
        {"level": "Signal #2",
            "desc": "Strong winds (61-120 km/h)",       "active": False},
        {"level": "Signal #3",
            "desc": "Very strong winds (121-170 km/h)", "active": False},
        {"level": "Signal #4",
            "desc": "Extreme winds (171-220 km/h)",     "active": False},
    ]
    return ok(data)


# ── ALL REPORTS WITH FILTERS ──────────────────────────────────────────────────
@router.get("/reports")
def get_all_reports(
    status:      str = Query(None),
    barangay:    str = Query(None),
    report_type: str = Query(None),
    severity:    str = Query(None),
    limit:       int = Query(default=50),
    offset:      int = Query(default=0),
    db: Session = Depends(get_db)
):
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
        "data": [
            {
                "id":          f"RPT-{r.id:04d}",
                "user_id":     r.user_id,
                "barangay":    r.barangay,
                "type":        r.report_type,
                "description": r.description,
                "severity":    r.severity,
                "status":      r.status.value.capitalize(),
                "image_path":  r.image_path,
                "ai_analysis": r.ai_analysis,
                "latitude":    r.latitude,
                "longitude":   r.longitude,
                "created_at":  r.created_at.strftime("%b %d, %Y %I:%M %p") if r.created_at else "---",
            }
            for r in reports
        ]
    }


@router.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    """Returns all registered residents for the Settings page."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return {
        "status": "success",
        "data": [
            {
                "id":         u.id,
                "name":       u.name,
                "email":      u.email,
                "barangay":   u.barangay,
                "role":       u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }
