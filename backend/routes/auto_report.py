# auto_report.py — Add this to your backend/routes/ folder
# Endpoint: GET /api/admin/summary-report
# Generates a structured consolidated report for MDRRMO

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from database import SessionLocal
from models import IncidentReport, User
from datetime import datetime, date
from collections import Counter

router = APIRouter()


@router.get("/api/admin/summary-report", response_class=HTMLResponse)
async def generate_summary_report():
    db = SessionLocal()
    try:
        reports = db.query(IncidentReport).all()
        users = db.query(User).filter(User.role == "resident").all()

        total = len(reports)
        pending = sum(1 for r in reports if r.status == "pending")
        reviewed = sum(1 for r in reports if r.status == "reviewed")
        resolved = sum(1 for r in reports if r.status == "resolved")
        with_images = sum(1 for r in reports if r.image_path)

        # Count by type
        by_type = Counter(r.report_type for r in reports)

        # Count by barangay
        by_brgy = Counter(r.barangay for r in reports)

        # Count by severity
        by_sev = Counter((r.severity or "unset").lower() for r in reports)

        # Critical/high reports (last 10)
        critical = [r for r in reports if (
            r.severity or "").lower() in ("critical", "high")]
        critical.sort(key=lambda r: r.created_at, reverse=True)

        # Format helpers
        def pct(n): return f"{round(n/total*100)}%" if total else "0%"
        def fmt(dt): return dt.strftime("%b %d, %Y %H:%M") if dt else "—"

        def row(label, val):
            return f'<tr><td style="color:#7a8fa8;padding:.45rem .5rem;border-bottom:1px solid #263347">{label}</td><td style="padding:.45rem .5rem;border-bottom:1px solid #263347;font-weight:600">{val}</td></tr>'

        def type_rows():
            out = ""
            icons = {"Flood": "🌊", "Wind Damage": "💨", "Missing Person": "🔍",
                     "Road Block": "🚧", "Power Outage": "⚡", "Other": "📝"}
            for t, c in by_type.most_common():
                icon = icons.get(t, "📝")
                out += f'<tr><td style="padding:.4rem .5rem;border-bottom:1px solid #263347">{icon} {t}</td><td style="padding:.4rem .5rem;border-bottom:1px solid #263347;font-weight:600">{c}</td><td style="padding:.4rem .5rem;border-bottom:1px solid #263347;color:#7a8fa8">{pct(c)}</td></tr>'
            return out

        def brgy_rows():
            out = ""
            for b, c in by_brgy.most_common(10):
                out += f'<tr><td style="padding:.4rem .5rem;border-bottom:1px solid #263347">📍 {b}</td><td style="padding:.4rem .5rem;border-bottom:1px solid #263347;font-weight:600">{c}</td><td style="padding:.4rem .5rem;border-bottom:1px solid #263347;color:#7a8fa8">{pct(c)}</td></tr>'
            return out

        def critical_rows():
            if not critical:
                return '<tr><td colspan="5" style="padding:1rem;text-align:center;color:#7a8fa8">No critical/high severity reports.</td></tr>'
            out = ""
            for r in critical[:15]:
                sev = (r.severity or "—").upper()
                sc = "#ef4444" if sev == "CRITICAL" else "#f59e0b"
                out += f'''<tr>
                  <td style="padding:.4rem .5rem;border-bottom:1px solid #263347;font-family:monospace;font-size:.75rem;color:#60a5fa">RPT-{str(r.id).zfill(4)}</td>
                  <td style="padding:.4rem .5rem;border-bottom:1px solid #263347">{r.barangay or "—"}</td>
                  <td style="padding:.4rem .5rem;border-bottom:1px solid #263347">{r.report_type or "—"}</td>
                  <td style="padding:.4rem .5rem;border-bottom:1px solid #263347"><span style="background:{sc}20;border:1px solid {sc};color:{sc};padding:1px 8px;border-radius:20px;font-size:.72rem;font-weight:700">{sev}</span></td>
                  <td style="padding:.4rem .5rem;border-bottom:1px solid #263347;font-size:.75rem;color:#7a8fa8">{fmt(r.created_at)}</td>
                </tr>'''
            return out

        now = datetime.now().strftime("%B %d, %Y — %I:%M %p")
        today = date.today().strftime("%B %d, %Y")

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MDRRMO Incident Summary Report — {today}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'IBM Plex Sans',sans-serif;background:#ffffff;color:#111827;padding:2rem;min-height:100vh}}
  .report-wrap{{max-width:860px;margin:0 auto}}
  .report-header{{border-bottom:2px solid #3b82f6;padding-bottom:1.25rem;margin-bottom:1.75rem}}
  .rh-top{{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem}}
  .rh-logo{{font-size:1.3rem;font-weight:700;letter-spacing:.5px}}
  .rh-logo span{{color:#60a5fa}}
  .rh-meta{{text-align:right;font-size:.78rem;color:#7a8fa8;line-height:1.7}}
  .rh-title{{margin-top:1rem;font-size:1.5rem;font-weight:600;color:#e8edf5}}
  .rh-sub{{font-size:.82rem;color:#7a8fa8;margin-top:.25rem}}
  .section{{background:#d2e7ff;border:1px solid #d2e7ff;border-radius:12px;padding:1.1rem 1.25rem;margin-bottom:1rem}}
  .section-title{{font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:#7a8fa8;margin-bottom:.85rem}}
  .kpi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem}}
  .kpi{{background:#111827;border:1px solid #263347;border-radius:9px;padding:.75rem 1rem;text-align:center}}
  .kpi-val{{font-size:1.6rem;font-weight:700;font-family:'IBM Plex Sans',sans-serif;line-height:1}}
  .kpi-label{{font-size:.68rem;color:#7a8fa8;margin-top:.3rem;text-transform:uppercase;letter-spacing:.5px}}
  table{{width:100%;border-collapse:collapse;font-size:.82rem}}
  th{{text-align:left;padding:.45rem .5rem;border-bottom:2px solid #263347;color:#7a8fa8;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px}}
  .print-btn{{display:flex;gap:.75rem;margin-bottom:1.5rem;flex-wrap:wrap}}
  .pbtn{{padding:.6rem 1.25rem;border:none;border-radius:8px;font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer}}
  .pbtn-blue{{background:#3b82f6;color:#fff}}
  .pbtn-blue:hover{{opacity:.85}}
  .pbtn-ghost{{background:transparent;border:1px solid #263347;color:#7a8fa8}}
  .pbtn-ghost:hover{{border-color:#3b82f6;color:#60a5fa}}
  .recommendation{{background:#0f1e32;border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;padding:.65rem .9rem;margin-bottom:.55rem;font-size:.83rem;line-height:1.5}}
  @media print{{
    body{{background:#fff;color:#111;padding:1rem}}
    .print-btn{{display:none}}
    .section{{background:#f8f9fa;border:1px solid #dee2e6}}
    .kpi{{background:#fff;border:1px solid #dee2e6}}
    .rh-title{{color:#111}}
    .kpi-label,.rh-meta,.section-title{{color:#555}}
    .recommendation{{background:#f0f4ff;border-left-color:#2563eb}}
  }}
</style>
</head>
<body>
<div class="report-wrap">

  <div class="print-btn">
    <button class="pbtn pbtn-blue" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="pbtn pbtn-ghost" onclick="window.history.back()">← Back to Dashboard</button>
  </div>

  <div class="report-header">
    <div class="rh-top">
      <div>
        <div class="rh-logo">🛡️ MDRRMO <span>POLANGUI</span></div>
        <div style="font-size:.72rem;color:#7a8fa8;margin-top:2px">Municipal Disaster Risk Reduction & Management Office</div>
      </div>
      <div class="rh-meta">
        Generated: {now}<br>
        Period: All records to date<br>
        Classification: <strong style="color:#f59e0b">FOR OFFICIAL USE</strong>
      </div>
    </div>
    <div class="rh-title">Incident Summary Report</div>
    <div class="rh-sub">Automated consolidated summary from the DRES Polangui system · {today}</div>
  </div>

  <!-- KPI SUMMARY -->
  <div class="section">
    <div class="section-title">Summary Statistics</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">{total}</div><div class="kpi-label">Total Reports</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#fbbf24">{pending}</div><div class="kpi-label">Pending</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#60a5fa">{reviewed}</div><div class="kpi-label">Reviewed</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#4ade80">{resolved}</div><div class="kpi-label">Resolved</div></div>
      <div class="kpi"><div class="kpi-val">{len(users)}</div><div class="kpi-label">Registered Residents</div></div>
      <div class="kpi"><div class="kpi-val">{with_images}</div><div class="kpi-label">Reports with Photos</div></div>
      <div class="kpi"><div class="kpi-val">{pct(resolved)}</div><div class="kpi-label">Resolution Rate</div></div>
      <div class="kpi"><div class="kpi-val">{len(by_brgy)}</div><div class="kpi-label">Affected Barangays</div></div>
    </div>
  </div>

  <!-- BY TYPE -->
  <div class="section">
    <div class="section-title">Reports by Incident Type</div>
    <table>
      <thead><tr><th>Type</th><th>Count</th><th>Share</th></tr></thead>
      <tbody>{type_rows()}</tbody>
    </table>
  </div>

  <!-- BY BARANGAY -->
  <div class="section">
    <div class="section-title">Top Affected Barangays</div>
    <table>
      <thead><tr><th>Barangay</th><th>Reports</th><th>Share</th></tr></thead>
      <tbody>{brgy_rows()}</tbody>
    </table>
  </div>

  <!-- CRITICAL/HIGH REPORTS -->
  <div class="section">
    <div class="section-title">Critical & High Severity Reports</div>
    <table>
      <thead><tr><th>Report ID</th><th>Barangay</th><th>Type</th><th>Severity</th><th>Submitted</th></tr></thead>
      <tbody>{critical_rows()}</tbody>
    </table>
  </div>

  <!-- AUTOMATED RECOMMENDATIONS -->
  <div class="section">
    <div class="section-title">System Recommendations</div>
    {"".join([
            f'<div class="recommendation">⚠️ <strong>{pending} report(s) still pending review.</strong> Assign MDRRMO personnel to address outstanding reports to improve resolution rate.</div>' if pending > 0 else '',
            f'<div class="recommendation">📍 <strong>Barangay {by_brgy.most_common(1)[0][0]} has the highest incident count ({by_brgy.most_common(1)[0][1]} reports).</strong> Consider pre-positioning response teams in this area.</div>' if by_brgy else '',
            f'<div class="recommendation">🌊 <strong>Flood is the most common incident type ({by_type.get("Flood", 0)} reports).</strong> Review evacuation routes and drainage systems in flood-prone barangays.</div>' if by_type.get(
                "Flood", 0) > 0 else '',
            f'<div class="recommendation">🚨 <strong>{len(critical)} critical/high severity report(s) recorded.</strong> Verify that all have received appropriate emergency response.</div>' if critical else '',
            '<div class="recommendation">✅ <strong>No critical or high severity reports on record.</strong> System is operating under normal conditions.</div>' if not critical else '',
            f'<div class="recommendation">👥 <strong>{len(users)} residents are registered</strong> in the DRES system. Continue promoting app adoption for broader community coverage.</div>',
        ])}
  </div>

  <div style="text-align:center;color:#7a8fa8;font-size:.72rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #263347">
    This report was automatically generated by DRES Polangui · {now}<br>
    MDRRMO Polangui, Albay · (052) 486-0160 · mdrrmo@polangui.gov.ph
  </div>
</div>
</body>
</html>"""

        return HTMLResponse(content=html, status_code=200)

    finally:
        db.close()
