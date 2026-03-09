from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER
from datetime import datetime
import io


def generate_mdrrmo_report(summary_text: str, reports: list, filename: str = None) -> bytes:
    """Generate a PDF situation report for MDRRMO"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=6
    )

    story.append(Paragraph("MUNICIPALITY OF POLANGUI", title_style))
    story.append(Paragraph(
        "MUNICIPAL DISASTER RISK REDUCTION AND MANAGEMENT OFFICE", title_style))
    story.append(Paragraph("TYPHOON SITUATION REPORT", title_style))
    story.append(Paragraph(
        f"Generated: {datetime.now().strftime('%B %d, %Y %I:%M %p')}", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))

    # AI Summary
    story.append(
        Paragraph("SITUATION SUMMARY (AI-Generated)", styles['Heading2']))
    story.append(Paragraph(summary_text.replace(
        '\n', '<br/>'), styles['Normal']))
    story.append(Spacer(1, 0.2*inch))

    # Reports Table
    if reports:
        story.append(Paragraph("INCIDENT REPORTS", styles['Heading2']))

        table_data = [['ID', 'Barangay', 'Type',
                       'Severity', 'Description', 'Time']]
        for r in reports[:20]:  # limit to 20
            table_data.append([
                str(r.get('id', '')),
                r.get('barangay', ''),
                r.get('report_type', ''),
                r.get('severity', '').upper(),
                r.get('description', '')[
                    :60] + '...' if len(r.get('description', '')) > 60 else r.get('description', ''),
                str(r.get('created_at', ''))[:16]
            ])

        table = Table(table_data, colWidths=[
                      0.4*inch, 1*inch, 0.8*inch, 0.7*inch, 2.5*inch, 1*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [colors.white, colors.lightgrey]),
        ]))
        story.append(table)

    doc.build(story)
    return buffer.getvalue()
