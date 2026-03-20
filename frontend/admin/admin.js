function renderRecentReports(reports) {
  const stClass = {
    // from API (capitalized by your backend)
    Pending:   "badge-monitoring",
    Reviewed:  "badge-active",
    Resolved:  "badge-resolved",
    // legacy fallback keys
    Active:    "badge-active",
    Monitoring:"badge-monitoring",
  };

  if (!reports.length) {
    document.getElementById("recent-reports-list").innerHTML =
      `<div style="padding:1rem;color:var(--text-muted);font-size:.85rem;">Walang reports pa.</div>`;
    return;
  }

  document.getElementById("recent-reports-list").innerHTML = reports
    .map(r => `
      <div class="report-item">
        <div class="report-left">
          <span class="report-id">${r.id}</span>
          <span class="report-brgy">${r.barangay} — ${r.type}</span>
        </div>
        <div class="report-right">
          <span class="badge ${stClass[r.status] || 'badge-monitoring'}">${r.status}</span>
          <span class="report-time">${r.time}</span>
        </div>
      </div>`)
    .join("");
}

// ── REPLACE your existing loadDashboard function with this ────────────────────
async function loadDashboard() {
  const [statsRes, monthRes, yearRes, floodRes, reportsRes] =
    await Promise.all([
      apiFetch("/api/admin/stats"),
      apiFetch("/api/admin/disasters/monthly"),
      apiFetch("/api/admin/disasters/yearly"),
      apiFetch("/api/admin/flood-barangays"),
      apiFetch("/api/admin/reports/recent"),   // ← hits admin.py
    ]);

  // Stats — use real data if available
  renderStats(statsRes?.data || FALLBACK.stats);

  // Charts
  const byMonth = monthRes?.data || FALLBACK.byMonth;
  const byYear  = yearRes?.data  || FALLBACK.byYear;
  chartData.reports.month  = byMonth;
  chartData.reports.year   = byYear;
  chartData.affected.month = byMonth;
  chartData.affected.year  = byYear;

  renderBarChart("chart-reports",  byMonth, "reports",  "linear-gradient(to top,#1d4ed8,#60a5fa)");
  renderBarChart("chart-affected", byMonth, "affected", "linear-gradient(to top,#b91c1c,#fca5a5)");

  // Flood table
  renderFloodTable(floodRes?.data || FALLBACK.floodBarangays);

  // Recent reports — use real data from DB
  renderRecentReports(reportsRes?.data || FALLBACK.recentReports);

  // Year table
  renderYearTable(byYear);
}