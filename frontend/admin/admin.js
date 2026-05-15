/* ═══════════════════════════════════════════════════════════
   MDRRMO POLANGUI — admin.js
   Full admin dashboard logic — all pages, charts, modals,
   API integration with graceful fallback data.
═══════════════════════════════════════════════════════════ */
"use strict";

// ── CONFIG ──────────────────────────────────────────────────
const API = `${window.location.protocol}//${window.location.hostname}:8000`;
const PAGE_META = {
  dashboard: ["Dashboard",        "Overview & Analytics"],
  map:       ["Typhoon Tracker",  "Live wind map · Polangui, Albay"],
  reports:   ["Incident Reports", "All submitted field reports"],
  chatbot:   ["Chatbot Logs",     "DRES-Bot resident conversations"],
  settings:  ["Settings",         "System configuration"],
};

// ── FALLBACK DATA ────────────────────────────────────────────
const FALLBACK = {
  stats: [
    { icon: '<i class="fa-solid fa-tornado"></i>',      label: "Active Typhoon Alerts", value: "0",  sub: "No active alerts",       color: "#ef4444" },
    { icon: '<i class="fa-solid fa-clipboard"></i>',    label: "Total Reports (2025)",  value: "0",  sub: "This year",              color: "#3b82f6" },
    { icon: '<i class="fa-solid fa-house-damage"></i>', label: "Affected Barangays",    value: "0",  sub: "With submitted reports", color: "#f59e0b" },
    { icon: '<i class="fa-solid fa-hourglass"></i>',    label: "Pending Reports",       value: "0",  sub: "Awaiting review",        color: "#a855f7" },
    { icon: '<i class="fa-solid fa-circle-check"></i>', label: "Resolved Incidents",    value: "0",  sub: "0% resolution rate",     color: "#22c55e" },
  ],
  byMonth: "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec"
    .split(",")
    .map(l => ({ label: l, reports: 0, affected: 0 })),
  byYear: ["2022","2023","2024","2025"].map(l => ({ label: l, reports: 0, affected: 0, typhoons: 0 })),
  flood: [
    { name: "Magpanambo", risk: "High",     households: 245, lastFlooded: "2024" },
    { name: "Gabon",      risk: "High",     households: 278, lastFlooded: "2023" },
    { name: "Salvacion",  risk: "High",     households: 195, lastFlooded: "2024" },
    { name: "San Roque",  risk: "High",     households: 210, lastFlooded: "2023" },
    { name: "Sugcad",     risk: "Moderate", households: 187, lastFlooded: "2024" },
    { name: "Santicon",   risk: "Moderate", households: 156, lastFlooded: "2023" },
    { name: "Cotmon",     risk: "Low",      households: 134, lastFlooded: "2021" },
    { name: "Ponso",      risk: "Low",      households: 98,  lastFlooded: "2021" },
  ],
  recentReports: [],
  municipal: {
    profile: [
      ["Municipality",    "Polangui"],
      ["Province",        "Albay"],
      ["Population",      "118,657"],
      ["Land Area",       "239.83 km²"],
      ["No. of Barangays","44"],
      ["Households",      "24,890"],
      ["Elevation Range", "40–1,550 m"],
      ["Main River",      "Polangui River"],
      ["Disaster Risk",   "High"],
    ],
    contact: [
      ["Office Head",     "—"],
      ["Contact No.",     "(052) 486-0160"],
      ["Office",          "Municipal DRRMO Polangui"],
      ["Email",           "mdrrmo@polangui.gov.ph"],
      ["Operating Hours", "24/7 during alerts"],
    ],
  },
  alertLevels: [
    { level: "Signal #1", desc: "Moderate winds (30–60 km/h)",        active: false },
    { level: "Signal #2", desc: "Strong winds (61–120 km/h)",         active: false },
    { level: "Signal #3", desc: "Very strong winds (121–170 km/h)",   active: false },
    { level: "Signal #4", desc: "Extreme winds (171–220 km/h)",       active: false },
  ],
};

// ── ICON + COLOR MAP ─────────────────────────────────────────
const TYPE_ICONS = {
  "Flood":          '<i class="fa-solid fa-water" style="color:#3b82f6"></i>',
  "Wind Damage":    '<i class="fa-solid fa-wind" style="color:#a855f7"></i>',
  "Missing Person": '<i class="fa-solid fa-person-circle-question" style="color:#f59e0b"></i>',
  "Road Block":     '<i class="fa-solid fa-road-barrier" style="color:#ef4444"></i>',
  "Power Outage":   '<i class="fa-solid fa-bolt" style="color:#fde047"></i>',
  "Other":          '<i class="fa-regular fa-file-lines" style="color:#8a92a8"></i>',
};
const SEV_COLOR = {
  critical: "#ef4444",
  high:     "#f97316",
  moderate: "#f59e0b",
  low:      "#22c55e",
  minor:    "#22c55e",
};

// ── CHART STATE ──────────────────────────────────────────────
let chartData = {
  reports:  { month: [], year: [] },
  affected: { month: [], year: [] },
};


// UTILITIES
function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function fmtDate(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return s; }
}
function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.borderColor = type === "error"   ? "rgba(239,68,68,0.4)"
                      : type === "success" ? "rgba(34,197,94,0.4)"
                      : "";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// ── CLOCK ────────────────────────────────────────────────────
function startClock() {
  const tick = () => {
    const now = new Date();
    const el  = document.getElementById("clock");
    if (el) el.textContent = now.toLocaleTimeString("en-PH");
    const de  = document.getElementById("tb-date");
    if (de) de.textContent = now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
  };
  tick();
  setInterval(tick, 1000);
}

// ── API HELPER ───────────────────────────────────────────────
async function apiFetch(ep) {
  try {
    const r = await fetch(API + ep, {
      headers: {
        "Authorization": "Bearer " + (sessionStorage.getItem("token") || ""),
        "Content-Type":  "application/json",
      },
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    console.warn("[DRS] API miss:", ep, e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════════════════════
function switchPage(id, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const pg = document.getElementById("page-" + id);
  if (pg) pg.classList.add("active");
  if (btn) btn.classList.add("active");
  const m  = PAGE_META[id] || [id, ""];
  const tp = document.getElementById("tb-page");
  const ts = document.getElementById("tb-sub");
  if (tp) tp.textContent = m[0];
  if (ts) ts.textContent = m[1];
  document.getElementById("sidebar")?.classList.remove("open");
  if (id === "reports")  loadAllReports();
  if (id === "chatbot")  loadChatLogs();
  if (id === "settings") { loadUsers(); loadSignalLevel(); loadContactSettings(); }
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
function loadAdminInfo() {
  const n        = sessionStorage.getItem("admin_name") || "Admin User";
  const initials = n.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2);
  const nameEl   = document.getElementById("sb-name");
  const avatarEl = document.getElementById("sb-avatar");
  if (nameEl)   nameEl.textContent   = n;
  if (avatarEl) avatarEl.textContent = initials;
}
function logout() {
  fetch(`${API}/api/auth/logout`, { method: "POST" }).catch(() => {}).finally(() => {
    sessionStorage.clear();
    window.location.href = "/index.html";
  });
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD — STATS
// ══════════════════════════════════════════════════════════════
function renderStats(stats) {
  const row = document.getElementById("stats-row");
  if (!row) return;
  row.innerHTML = stats.map(s => `
    <div class="stat-card" style="border-left-color:${s.color}">
      <div class="stat-icon" style="color:${s.color}">${s.icon}</div>
      <div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD — BAR CHARTS
// ══════════════════════════════════════════════════════════════
function renderBarChart(id, data, key, grad) {
  const el = document.getElementById(id);
  if (!el || !data.length) return;
  const max = Math.max(...data.map(d => d[key] || 0), 1);
  el.innerHTML = data.map(d => {
    const pct = Math.max(((d[key] || 0) / max) * 100, d[key] > 0 ? 4 : 2);
    return `
      <div class="bar-col" title="${d.label}: ${d[key] || 0}">
        <div class="bar-track">
          <div class="bar-fill" style="height:${pct}%;background:${grad}"></div>
        </div>
        <div class="bar-label">${d.label}</div>
      </div>`;
  }).join("");
}
function switchChart(cid, mode, btn) {
  btn.closest(".toggle-group").querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (cid === "reports") {
    renderBarChart("chart-reports",  chartData.reports[mode],  "reports",
      "linear-gradient(to top,#1d4ed8,#60a5fa)");
  } else {
    renderBarChart("chart-affected", chartData.affected[mode], "affected",
      "linear-gradient(to top,#b91c1c,#fca5a5)");
  }
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD — FLOOD TABLE
// ══════════════════════════════════════════════════════════════
function renderFloodTable(data) {
  const countEl = document.getElementById("flood-count");
  const wrap    = document.getElementById("flood-table-wrap");
  if (countEl) countEl.textContent = data.length + " barangays";
  if (!wrap) return;
  const rc = { High: "b-high", Medium: "b-med", Moderate: "b-med", Low: "b-low" };
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Barangay</th><th>Risk</th><th>Households</th><th>Last Flooded</th></tr></thead>
      <tbody>
        ${data.map(b => `
          <tr>
            <td>${b.name}</td>
            <td><span class="badge ${rc[b.risk] || 'b-low'}">${b.risk}</span></td>
            <td>${Number(b.households).toLocaleString()}</td>
            <td>${b.lastFlooded}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD — RECENT REPORTS
// ══════════════════════════════════════════════════════════════
function renderRecentReports(rpts) {
  const el = document.getElementById("recent-reports-list");
  if (!el) return;
  if (!rpts?.length) {
    el.innerHTML = `<div style="padding:1.2rem;text-align:center;color:var(--text-3);font-size:.75rem">Walang recent reports.</div>`;
    return;
  }
  const sc = { Pending:"b-pending", Reviewed:"b-reviewed", Resolved:"b-resolved", Active:"b-reviewed", Monitoring:"b-pending" };
  el.innerHTML = rpts.map(r => `
    <div class="report-item">
      <div class="r-left">
        <span class="r-id">${r.id || "—"}</span>
        <span class="r-brgy">${r.barangay || "—"} — ${r.type || "—"}</span>
      </div>
      <div class="r-right">
        <span class="badge ${sc[r.status] || 'b-pending'}">${r.status || "Pending"}</span>
        <span class="r-time">${r.time || ""}</span>
      </div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD — YEAR SUMMARY TABLE
// ══════════════════════════════════════════════════════════════
function renderYearTable(data) {
  const el = document.getElementById("year-table-wrap");
  if (!el) return;
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Year</th><th>Typhoons</th><th>Reports</th><th>Affected</th></tr></thead>
      <tbody>
        ${data.map(y => `
          <tr>
            <td>${y.label}</td>
            <td>🌀 ${y.typhoons ?? 0}</td>
            <td>${y.reports ?? 0}</td>
            <td>${Number(y.affected || 0).toLocaleString()}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════════════
// MAP PAGE — MUNICIPAL INFO + ALERT LEVELS
// ══════════════════════════════════════════════════════════════
function renderMunicipal(data) {
  const profileWrap = document.getElementById("municipal-profile");
  const contactWrap = document.getElementById("municipal-contact");
  if (profileWrap && data.profile) {
    profileWrap.innerHTML = `
      <table class="data-table"><tbody>
        ${data.profile.map(([k, v]) => `
          <tr><td style="font-weight:600;white-space:nowrap">${esc(k)}</td><td>${esc(v)}</td></tr>
        `).join("")}
      </tbody></table>`;
  }
  if (contactWrap && data.contact) {
    contactWrap.innerHTML = `
      <table class="data-table"><tbody>
        ${data.contact.map(([k, v]) => `
          <tr><td style="font-weight:600;white-space:nowrap">${esc(k)}</td><td>${esc(v)}</td></tr>
        `).join("")}
      </tbody></table>`;
  }
}
function renderAlertLevels(levels) {
  const wrap = document.getElementById("alert-levels-wrap");
  if (!wrap) return;
  wrap.innerHTML = levels.map(l => `
    <div class="alert-level-row ${l.active ? "alert-level-active" : ""}">
      <span class="al-level">${esc(l.level)}</span>
      <span class="al-desc">${esc(l.desc)}</span>
      <span class="badge ${l.active ? "b-reviewed" : "b-low"}">${l.active ? "Active" : "Inactive"}</span>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// GOOGLE MAP — POLANGUI INCIDENT TRACKER
// ══════════════════════════════════════════════════════════════
let map;
let infoWindow;
let markers      = [];   // all current markers
let knownIds     = new Set(); // IDs already on the map (for live-diff)
let mapRefreshInterval = null;

/* ── BARANGAY FALLBACK COORDINATES ─────────────────────────── */
const BARANGAY_COORDS = {
  "AGOS":         [13.3051, 123.4851],
  "COTONOGAN":    [13.3092, 123.4930],
  "MAGPANAMBO":   [13.3148, 123.5021],
  "LAPURISIMA":   [13.3181, 123.5210],
  "LOURDES":      [13.3199, 123.5330],
  "LIDONG":       [13.3225, 123.5471],
  "ANOPOL":       [13.3240, 123.5572],
  "MAYSUA":       [13.3262, 123.5702],
  "DANAO":        [13.3305, 123.5791],
  "COTMON":       [13.2998, 123.5755],
  "BALINAD":      [13.2865, 123.5655],
  "NAPO":         [13.2728, 123.5550],
  "MATACON":      [13.2964, 123.5020],
  "BALANGIBANG":  [13.2820, 123.5120],
  "KINALE":       [13.2682, 123.5155],
  "ALOMON":       [13.2552, 123.5201],
  "MAYNAGA":      [13.3010, 123.5470],
  "AMOGUIS":      [13.3035, 123.5555],
  "STA. TERESITA":[13.3122, 123.5070],
  "SAN ROQUE":    [13.3040, 123.5105],
  "LA MEDALLA":   [13.3025, 123.5230],
  "SANTICON":     [13.2930, 123.5142],
  "APAD":         [13.2925, 123.5280],
  "KINUARTILAN":  [13.3015, 123.5372],
  "LANIGAY":      [13.2860, 123.5350],
  "GAMOT":        [13.2865, 123.5455],
  "ITARAN":       [13.2952, 123.5485],
  "PINAGDAPUGAN": [13.2920, 123.5582],
  "BUYO":         [13.2832, 123.5535],
  "CEPRES":       [13.2780, 123.5450],
  "BALABA":       [13.2742, 123.5572],
  "PINTOR":       [13.2705, 123.5382],
  "STA. CRUZ":    [13.2702, 123.5480],
  "PONSO":        [13.2602, 123.5485],
  "MENDEZ":       [13.2485, 123.5400],
  "SUGCAD":       [13.2725, 123.5300],
  "CENTRO OCC.":  [13.2660, 123.5235],
  "CENTRO OR.":   [13.2665, 123.5332],
  "UBALIW":       [13.2535, 123.5250],
  "QARON":        [13.2525, 123.5355],
  "BASUD":        [13.2425, 123.5290],
  "ALNAY":        [13.2422, 123.5395],
};

/* ── SEVERITY → COLOR ───────────────────────────────────────── */
function getSeverityColor(severity) {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return "#ef4444";   // red
  if (s === "high")     return "#f97316";   // orange
  if (s === "moderate") return "#f59e0b";   // amber
  return "#22c55e";                          // green (low / minor)
}

/* ── SEVERITY → SCALE ───────────────────────────────────────── */
function getSeverityScale(severity) {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return 13;
  if (s === "high")     return 11;
  if (s === "moderate") return 10;
  return 8;
}

/* ── MAP INIT ───────────────────────────────────────────────── */
function initMap() {
  map = new google.maps.Map(document.getElementById("google-map"), {
    center:           { lat: 13.2923, lng: 123.4857 },
    zoom:             13,
    mapTypeId:        "terrain",
    fullscreenControl: true,
    streetViewControl: false,
    mapTypeControl:    false,
    styles: [{ featureType: "all", elementType: "geometry", stylers: [{ saturation: -20 }] }],
  });
  infoWindow = new google.maps.InfoWindow();

  // Initial load
  loadMapReports();

  // Poll every 15 s — only adds NEW pins, no flicker
  mapRefreshInterval = setInterval(() => loadMapReports(false), 15000);
}


function resolveCoords(report) {
  const lat = parseFloat(report.latitude);
  const lng = parseFloat(report.longitude);
  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }
  const name = (report.barangay || report.barangay_name || "").toUpperCase().trim();
  const fb   = BARANGAY_COORDS[name];
  if (fb) return { lat: fb[0], lng: fb[1] };
  // Partial match — find a key that starts with the given name
  const key = Object.keys(BARANGAY_COORDS).find(k => k.startsWith(name) || name.startsWith(k));
  if (key) return { lat: BARANGAY_COORDS[key][0], lng: BARANGAY_COORDS[key][1] };
  return null;
}

/* ── ADD A SINGLE MARKER ───────────────────────────────────── */
function addReportMarker(report, isNew = false) {
  const coords = resolveCoords(report);
  if (!coords) {
    console.warn("[MAP] Cannot place report — no coords or unknown barangay:", report);
    return null;
  }

  const severity = (report.severity || "minor").toLowerCase();
  const color    = getSeverityColor(severity);
  const scale    = getSeverityScale(severity);
  const type     = report.type || report.report_type || "Other";
  const barangay = report.barangay || report.barangay_name || "Unknown";
  const id       = report.id || report.report_id || "—";
  const status   = report.status || "Pending";
  const desc     = report.description || report.details || "No details.";

  // Outer pulsing circle overlay (for new reports only)
  if (isNew) {
    addPulseOverlay(coords, color);
  }

  const marker = new google.maps.Marker({
    position:  coords,
    map,
    title:     `${barangay} — ${type}`,
    animation: isNew ? google.maps.Animation.DROP : null,
    icon: {
      path:         google.maps.SymbolPath.CIRCLE,
      scale,
      fillColor:    color,
      fillOpacity:  1,
      strokeColor:  "#ffffff",
      strokeWeight: 2.5,
    },
    zIndex: isNew ? 999 : 1,
  });

  // Info-window content
  const statusColors = { pending: "#f59e0b", reviewed: "#3b82f6", resolved: "#22c55e" };
  const sColor = statusColors[status.toLowerCase()] || "#8a92a8";
  const created = fmtDate(report.created_at || report.date);

  marker.addListener("click", () => {
    infoWindow.setContent(`
      <div style="min-width:240px;font-family:system-ui,sans-serif;padding:4px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="
            width:10px;height:10px;border-radius:50%;
            background:${color};flex-shrink:0;
            box-shadow:0 0 0 3px ${color}33">
          </div>
          <strong style="font-size:14px">${esc(barangay)}</strong>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <span style="
            padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
            background:${color}22;color:${color};border:1px solid ${color}55;
            letter-spacing:.05em">
            ${severity.toUpperCase()}
          </span>
          <span style="
            padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
            background:${sColor}22;color:${sColor};border:1px solid ${sColor}55">
            ${esc(status)}
          </span>
        </div>

        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr>
            <td style="color:#888;padding:2px 6px 2px 0;white-space:nowrap">Report ID</td>
            <td style="font-family:monospace;color:#333">${esc(String(id))}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:2px 6px 2px 0">Type</td>
            <td>${esc(type)}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:2px 6px 2px 0">Submitted</td>
            <td>${created}</td>
          </tr>
          ${report.latitude ? `
          <tr>
            <td style="color:#888;padding:2px 6px 2px 0">GPS</td>
            <td style="font-family:monospace;font-size:10px">${parseFloat(report.latitude).toFixed(5)}, ${parseFloat(report.longitude).toFixed(5)}</td>
          </tr>` : ""}
        </table>

        <div style="
          margin-top:10px;padding:8px;border-radius:8px;
          background:#f5f5f5;font-size:12px;color:#444;
          max-height:80px;overflow-y:auto;line-height:1.5">
          ${esc(desc)}
        </div>

        <button onclick="
          document.querySelector('[data-page=reports]').click();
          setTimeout(() => loadAllReports(), 300);
        " style="
          margin-top:10px;width:100%;padding:7px;border:none;border-radius:8px;
          background:${color};color:#fff;font-size:12px;font-weight:600;
          cursor:pointer;letter-spacing:.03em">
          View Full Report →
        </button>
      </div>`);
    infoWindow.open(map, marker);
  });

  markers.push({ marker, reportId: String(id) });
  return marker;
}

/* ── PULSE OVERLAY (CSS animation via OverlayView) ────────────
   Creates a ripple ring around a new report pin.
─────────────────────────────────────────────────────────────── */
function addPulseOverlay(coords, color) {
  if (!google?.maps?.OverlayView) return;

  class PulseOverlay extends google.maps.OverlayView {
    constructor(pos, col) {
      super();
      this.pos = pos;
      this.col = col;
      this.div = null;
    }
    onAdd() {
      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute;
        width:40px;height:40px;
        border-radius:50%;
        border:3px solid ${this.col};
        opacity:0;
        pointer-events:none;
        transform:translate(-50%,-50%);
        animation:mapPulse 2s ease-out 3;
      `;
      this.div = div;
      this.getPanes().overlayMouseTarget.appendChild(div);
    }
    draw() {
      const proj = this.getProjection();
      const pt   = proj.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
      if (pt) {
        this.div.style.left = pt.x + "px";
        this.div.style.top  = pt.y + "px";
      }
    }
    onRemove() {
      this.div?.parentNode?.removeChild(this.div);
    }
  }

  const overlay = new PulseOverlay(coords, color);
  overlay.setMap(map);
  // Auto-remove after animation finishes (3 × 2s = 6s)
  setTimeout(() => overlay.setMap(null), 6500);
}

/* ── INJECT PULSE KEYFRAME ONCE ────────────────────────────── */
(function injectPulseStyle() {
  if (document.getElementById("map-pulse-style")) return;
  const s = document.createElement("style");
  s.id = "map-pulse-style";
  s.textContent = `
    @keyframes mapPulse {
      0%   { transform:translate(-50%,-50%) scale(0.5); opacity:.9; }
      100% { transform:translate(-50%,-50%) scale(2.5); opacity:0; }
    }
  `;
  document.head.appendChild(s);
})();

/* ── CLEAR ALL MARKERS ─────────────────────────────────────── */
function clearMapMarkers() {
  markers.forEach(({ marker }) => marker.setMap(null));
  markers  = [];
  knownIds = new Set();
}

/* ══════════════════════════════════════════════════════════════
   LOAD MAP REPORTS
   fullRefresh=true  → clear all pins and redraw (initial load)
   fullRefresh=false → only add pins for IDs not yet on the map
══════════════════════════════════════════════════════════════ */
async function loadMapReports(fullRefresh = true) {
  if (!map) return;

  const res  = await apiFetch("/api/reports/?limit=200");
  const data = Array.isArray(res) ? res : (res?.data || []);

  if (fullRefresh) {
    clearMapMarkers();
    data.forEach(r => {
      const rid = String(r.id || r.report_id || "");
      addReportMarker(r, false);
      if (rid) knownIds.add(rid);
    });
  } else {
    // Incremental — only add reports we haven't seen yet
    let newCount = 0;
    data.forEach(r => {
      const rid = String(r.id || r.report_id || "");
      if (rid && knownIds.has(rid)) return;
      addReportMarker(r, true);   // isNew=true → drop animation + pulse
      if (rid) knownIds.add(rid);
      newCount++;
    });
    if (newCount > 0) {
      showToast(`${newCount} new report${newCount > 1 ? "s" : ""} on the map`, "info");
      // Also refresh dashboard stats quietly
      loadDashboard();
    }
  }
}


window.onNewReport = function(report) {
  if (!report) return;
  const rid = String(report.id || report.report_id || "");

  // Avoid duplicates
  if (rid && knownIds.has(rid)) return;

  // Place pin immediately — no need to wait for next poll
  const marker = addReportMarker(report, true);
  if (rid) knownIds.add(rid);

  // Pan map to the new report if map page is visible
  if (marker && document.getElementById("page-map")?.classList.contains("active")) {
    const coords = resolveCoords(report);
    if (coords) {
      map.panTo(coords);
      map.setZoom(15);
    }
  }

  showToast(
    `New ${(report.severity || "").toUpperCase() || "report"} report in ${report.barangay || "unknown barangay"}`,
    "info"
  );
  loadDashboard();
};

/* ── Listen for cross-origin postMessage from resident app ─── */
window.addEventListener("message", (e) => {
  if (e.data?.type === "NEW_REPORT" && e.data?.report) {
    window.onNewReport(e.data.report);
  }
});

/* ── Also poll the backend specifically for reports submitted
      in the last 60 s (catches cases where resident submits
      without triggering postMessage) ─────────────────────── */
async function pollForNewReports() {
  if (!map) return;
  const res  = await apiFetch("/api/reports/?limit=50&ordering=-created_at");
  const data = Array.isArray(res) ? res : (res?.data || []);
  let newCount = 0;
  data.forEach(r => {
    const rid = String(r.id || r.report_id || "");
    if (rid && knownIds.has(rid)) return;
    addReportMarker(r, true);
    if (rid) knownIds.add(rid);
    newCount++;
  });
  if (newCount > 0) {
    showToast(`${newCount} new report${newCount > 1 ? "s" : ""} added to map`, "info");
    loadDashboard();
  }
}
// Fast poll every 20 s for new-report detection
setInterval(pollForNewReports, 20000);

// ══════════════════════════════════════════════════════════════
// SIGNAL INDICATOR
// ══════════════════════════════════════════════════════════════
function updateSignalUI(level) {
  const n      = parseInt(level || 0);
  const labels = ["No Signal", "Signal #1", "Signal #2", "Signal #3", "Signal #4"];
  const colors = ["var(--green)", "var(--amber)", "var(--amber)", "var(--red)", "var(--purple)"];
  const signalLabel = document.getElementById("signal-label");
  const signalDot   = document.querySelector(".signal-dot");
  const alertStrip  = document.getElementById("sb-alert-strip");
  const alertText   = document.getElementById("sb-alert-text");
  if (signalLabel) signalLabel.textContent = labels[n] || "No Signal";
  if (signalDot)   signalDot.style.background = colors[n] || "var(--green)";
  if (alertStrip) {
    if (n > 0) {
      alertStrip.classList.add("alert-active");
      if (alertText) alertText.textContent = labels[n] + " — Active";
    } else {
      alertStrip.classList.remove("alert-active");
      if (alertText) alertText.textContent = "No Active Typhoon";
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ALL REPORTS PAGE
// ══════════════════════════════════════════════════════════════
async function loadAllReports() {
  const statusVal = document.getElementById("filter-status")?.value || "";
  const typeVal   = document.getElementById("filter-type")?.value   || "";
  const wrap      = document.getElementById("all-reports-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading reports…</div>`;
  let url = "/api/reports/?limit=200";
  if (statusVal) url += `&status=${statusVal.toLowerCase()}`;
  if (typeVal)   url += `&report_type=${encodeURIComponent(typeVal)}`;
  const res     = await apiFetch(url);
  const reports = Array.isArray(res) ? res : (res?.data || []);
  const counts  = { all: reports.length, pending: 0, reviewed: 0, resolved: 0 };
  reports.forEach(r => {
    const s = (r.status || "pending").toLowerCase();
    if (counts[s] !== undefined) counts[s]++;
  });
  ["all","pending","reviewed","resolved"].forEach(k => {
    const el = document.getElementById("chip-" + k);
    if (el) el.textContent = counts[k];
  });
  const badge = document.getElementById("pending-badge");
  if (badge) {
    badge.textContent   = counts.pending;
    badge.style.display = counts.pending > 0 ? "inline" : "none";
  }
  if (!reports.length) {
    wrap.innerHTML = `
      <div style="padding:3rem;text-align:center;color:var(--text-3)">
        <i class="fa-solid fa-folder-open" style="font-size:2rem;margin-bottom:.75rem;display:block;opacity:.3"></i>
        Walang reports na nahanap.
      </div>`;
    return;
  }
  wrap.innerHTML = reports.map(r => {
    const id        = r.id || r.report_id || "—";
    const type      = r.type || r.report_type || "Other";
    const barangay  = r.barangay || r.barangay_name || "Unknown";
    const desc      = r.description || r.details || "—";
    const image     = r.image_path || r.image || null;
    const created   = fmtDate(r.created_at || r.date);
    const status    = (r.status || "pending").toLowerCase();
    const severity  = (r.severity || "").toLowerCase();
    const sevColor  = SEV_COLOR[severity] || "#3b82f6";
    const statusClass = status === "resolved" ? "b-resolved"
                      : status === "reviewed"  ? "b-reviewed"
                      : "b-pending";
    return `
      <div class="rpt-card" onclick='openModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
        <div class="rpt-top">
          <span class="rpt-type">${TYPE_ICONS[type] || TYPE_ICONS["Other"]} ${type}</span>
          <span class="rpt-id">${id}</span>
        </div>
        <div class="rpt-desc">${esc(desc)}</div>
        <div class="rpt-meta">
          <span class="rpt-loc">
            <i class="fa-solid fa-map-pin" style="color:var(--red);font-size:.65rem"></i>
            ${esc(barangay)}
            ${severity ? `<span style="margin-left:5px;font-size:.62rem;font-weight:700;color:${sevColor}">${severity.toUpperCase()}</span>` : ""}
            <span style="color:var(--text-3);font-size:.65rem;margin-left:4px">${created}</span>
          </span>
          <div class="rpt-acts">
            ${image ? '<span class="img-chip"><i class="fa-solid fa-image"></i> Photo</span>' : ""}
            <span class="badge ${statusClass}">${status}</span>
          </div>
        </div>
      </div>`;
  }).join("");
}

function filterByStatus(status) {
  const sel = document.getElementById("filter-status");
  if (sel) sel.value = status;
  document.querySelectorAll(".r-chip").forEach(c => c.classList.remove("active-chip"));
  const chip = document.querySelector(`.r-chip.${status || "all"}`);
  if (chip) chip.classList.add("active-chip");
  loadAllReports();
}

// ══════════════════════════════════════════════════════════════
// REPORT MODAL
// ══════════════════════════════════════════════════════════════
function openModal(r) {
  const statusClass = { Pending: "b-pending", Reviewed: "b-reviewed", Resolved: "b-resolved" };
  const sev    = (r.severity || "").toLowerCase();
  const sevClr = SEV_COLOR[sev] || "#3b82f6";
  const type   = r.type || r.report_type || "Other";
  const status = r.status || "Pending";
  document.getElementById("modal-title").innerHTML =
    `${TYPE_ICONS[type] || TYPE_ICONS["Other"]}
     <span>${type}</span>
     <span style="font-size:.65em;color:var(--text-3);font-weight:400;font-family:var(--font-mono)">${r.id || ""}</span>`;
  let imgHtml = "";
  if (r.image_path) {
    const clean = r.image_path.replace(/\\/g, "/").replace(/^uploads\//, "");
    const src   = `${API}/uploads/${clean}`;
    imgHtml = `
      <div class="rpt-photo">
        <img src="${src}" alt="Incident photo"
          onerror="this.closest('.rpt-photo').innerHTML='<div class=rpt-photo-err><i class=fa-solid fa-image-slash style=opacity:.3;font-size:2rem></i><br>Image could not be loaded</div>'"/>
        <div class="rpt-photo-label"><i class="fa-solid fa-camera"></i> ${clean.split("/").pop()}</div>
      </div>`;
  }
  document.getElementById("modal-body").innerHTML = `
    ${imgHtml}
    <div class="m-row"><span class="m-key">Report ID</span>
      <span class="m-val" style="font-family:var(--font-mono);font-size:.72rem">${r.id || "—"}</span></div>
    <div class="m-row"><span class="m-key">Status</span>
      <span class="m-val"><span class="badge ${statusClass[status] || 'b-pending'}">${status}</span></span></div>
    <div class="m-row"><span class="m-key">Barangay</span>
      <span class="m-val">${esc(r.barangay || "—")}</span></div>
    <div class="m-row"><span class="m-key">Report Type</span>
      <span class="m-val">${esc(type)}</span></div>
    <div class="m-row"><span class="m-key">Severity</span>
      <span class="m-val">
        <span style="background:${sevClr}22;border:1px solid ${sevClr}66;color:${sevClr};padding:2px 10px;border-radius:20px;font-size:.68rem;font-weight:700;letter-spacing:.05em">
          ${(r.severity || "—").toUpperCase()}
        </span>
      </span></div>
    <div class="m-row"><span class="m-key">Submitted</span>
      <span class="m-val">${fmtDate(r.created_at)}</span></div>
    ${r.latitude ? `
    <div class="m-row"><span class="m-key">GPS Location</span>
      <span class="m-val" style="font-family:var(--font-mono);font-size:.7rem">${r.latitude}, ${r.longitude}</span></div>` : ""}
    <div class="m-row" style="flex-direction:column;gap:.5rem">
      <span class="m-key">Description</span>
      <div class="desc-box">${esc(r.description || "—")}</div>
    </div>
    <div class="status-strip">
      <label>Update Status:</label>
      <select id="modal-sel">
        <option value="pending"  ${status === "Pending"  ? "selected" : ""}>Pending</option>
        <option value="reviewed" ${status === "Reviewed" ? "selected" : ""}>Reviewed</option>
        <option value="resolved" ${status === "Resolved" ? "selected" : ""}>Resolved</option>
      </select>
      <button class="upd-btn" onclick="updateStatus('${r.id}')">
        <i class="fa-solid fa-check"></i> Update
      </button>
    </div>
    ${(r.latitude && r.longitude) ? `
    <button onclick="viewOnMap(${r.latitude},${r.longitude},'${r.id}')" style="
      margin-top:10px;width:100%;padding:8px;border:none;border-radius:8px;
      background:var(--blue,#3b82f6);color:#fff;font-size:.78rem;font-weight:600;
      cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
      <i class="fa-solid fa-map-location-dot"></i> View on Map
    </button>` : ""}`;
  document.getElementById("rptModal").classList.add("open");
}

/* ── View on map: close modal, switch to map page, pan ──────── */
function viewOnMap(lat, lng, reportId) {
  closeModal();
  switchPage("map", document.querySelector("[data-page=map]"));
  setTimeout(() => {
    if (!map) return;
    map.panTo({ lat: parseFloat(lat), lng: parseFloat(lng) });
    map.setZoom(16);
    // Open the matching marker's info window
    const entry = markers.find(m => String(m.reportId) === String(reportId));
    if (entry) google.maps.event.trigger(entry.marker, "click");
  }, 300);
}

function closeModal() {
  document.getElementById("rptModal").classList.remove("open");
}
async function updateStatus(rid) {
  const nv    = document.getElementById("modal-sel").value;
  const numId = String(rid).replace("RPT-", "").replace(/^0+/, "") || "0";
  try {
    const res = await fetch(`${API}/api/reports/${numId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: nv }),
    });
    if (res.ok) {
      closeModal();
      showToast(`Status updated to ${nv}`, "success");
      loadAllReports();
      loadDashboard();
    } else {
      throw new Error(res.status);
    }
  } catch (e) {
    showToast("Failed to update status — check backend", "error");
    console.error("[DRS] updateStatus:", e);
  }
}

// ══════════════════════════════════════════════════════════════
// CHATBOT LOGS
// ══════════════════════════════════════════════════════════════
async function loadChatLogs() {
  const uid  = document.getElementById("filter-uid")?.value || "";
  const wrap = document.getElementById("chat-logs-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading logs…</div>`;
  const [st, res] = await Promise.all([
    apiFetch("/api/admin/chatbot-stats"),
    apiFetch(`/api/admin/chatbot-logs?limit=50${uid ? "&user_id=" + uid : ""}`),
  ]);
  if (st?.data) {
    const totalEl = document.getElementById("cs-total");
    const usersEl = document.getElementById("cs-users");
    if (totalEl) totalEl.textContent = st.data.total_conversations ?? "—";
    if (usersEl) usersEl.textContent = st.data.unique_users        ?? "—";
  }
  const logs = res?.data || [];
  if (!logs.length) {
    wrap.innerHTML = `
      <div style="padding:3rem;text-align:center;color:var(--text-3)">
        <i class="fa-regular fa-comments" style="font-size:2rem;margin-bottom:.75rem;display:block;opacity:.3"></i>
        Walang chat logs pa.
      </div>`;
    return;
  }
  wrap.innerHTML = logs.map(l => `
    <div class="cl-item">
      <div class="cl-head">
        <span class="cl-uid">User #${l.user_id || "?"}</span>
        <span class="cl-time">${fmtDate(l.created_at)}</span>
      </div>
      <div class="cl-q"><strong>Resident asked:</strong> ${esc(l.message)}</div>
      <div class="cl-a">${esc((l.response || "").replace(/<[^>]+>/g,"")).slice(0,200)}${(l.response?.length||0)>200?"…":""}</div>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
function setSignalLevel(btn) {
  document.querySelectorAll(".sig-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const level = btn.dataset.level;
  localStorage.setItem("dres_signal_level", level);
  updateSignalUI(level);
  const el = document.getElementById("signal-saved");
  if (el) { el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2500); }
}
function loadSignalLevel() {
  const level = localStorage.getItem("dres_signal_level") || "0";
  document.querySelector(`.sig-btn[data-level="${level}"]`)?.classList.add("active");
  updateSignalUI(level);
}
function saveContact() {
  const data = {
    head:    document.getElementById("s-head")?.value    || "",
    contact: document.getElementById("s-contact")?.value || "",
    email:   document.getElementById("s-email")?.value   || "",
    hours:   document.getElementById("s-hours")?.value   || "",
  };
  localStorage.setItem("dres_contact", JSON.stringify(data));
  const el = document.getElementById("contact-saved");
  if (el) { el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2500); }
  showToast("Contact info saved", "success");
}
function loadContactSettings() {
  try {
    const d = JSON.parse(localStorage.getItem("dres_contact") || "{}");
    if (d.head)    { const e = document.getElementById("s-head");    if (e) e.value = d.head;    }
    if (d.contact) { const e = document.getElementById("s-contact"); if (e) e.value = d.contact; }
    if (d.email)   { const e = document.getElementById("s-email");   if (e) e.value = d.email;   }
    if (d.hours)   { const e = document.getElementById("s-hours");   if (e) e.value = d.hours;   }
  } catch { /* ignore */ }
}
async function loadUsers() {
  const wrap = document.getElementById("users-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;
  const res   = await apiFetch("/api/admin/users");
  const users = res?.data || [];
  if (!users.length) {
    wrap.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:.75rem">Walang registered users pa.</div>`;
    return;
  }
  wrap.innerHTML = users.map(u => `
    <div class="user-row">
      <div>
        <div class="ur-name">${esc(u.name || "—")}</div>
        <div class="ur-email">${esc(u.email || "")} · ${esc(u.barangay || "No barangay")}</div>
      </div>
      <span class="ur-b ${u.role === "mdrrmo" ? "ur-md" : "ur-res"}">${u.role || "resident"}</span>
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// MAIN DATA LOADERS
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  const [sR, mR, yR, fR, rR] = await Promise.all([
    apiFetch("/api/admin/stats"),
    apiFetch("/api/admin/disasters/monthly"),
    apiFetch("/api/admin/disasters/yearly"),
    apiFetch("/api/admin/flood-barangays"),
    apiFetch("/api/reports/admin/recent"),
  ]);
  renderStats(sR?.data || FALLBACK.stats);
  const bm = mR?.data || FALLBACK.byMonth;
  const by = yR?.data || FALLBACK.byYear;
  chartData.reports.month  = bm;
  chartData.affected.month = bm;
  chartData.reports.year   = by;
  chartData.affected.year  = by;
  renderBarChart("chart-reports",  bm, "reports",  "linear-gradient(to top,#1d4ed8,#60a5fa)");
  renderBarChart("chart-affected", bm, "affected", "linear-gradient(to top,#b91c1c,#fca5a5)");
  renderFloodTable(fR?.data || FALLBACK.flood);
  renderRecentReports(rR?.data || FALLBACK.recentReports);
  renderYearTable(by);
  const statsArr    = sR?.data || FALLBACK.stats;
  const pendingStat = statsArr.find(s => s.label?.toLowerCase().includes("pending"));
  if (pendingStat) {
    const badge = document.getElementById("pending-badge");
    const n     = parseInt(pendingStat.value || 0);
    if (badge) {
      badge.textContent   = n;
      badge.style.display = n > 0 ? "inline" : "none";
    }
  }
}

async function loadMapPage() {
  const [mR, aR] = await Promise.all([
    apiFetch("/api/admin/municipal"),
    apiFetch("/api/admin/alert-levels"),
  ]);
  renderMunicipal(mR?.data || FALLBACK.municipal);
  renderAlertLevels(aR?.data || FALLBACK.alertLevels);
}

// KEYBOARD / MODAL CLOSE

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});
document.getElementById("rptModal")?.addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

// INIT
document.addEventListener("DOMContentLoaded", () => {
  loadAdminInfo();
  startClock();
  loadSignalLevel();
  loadDashboard();
  loadMapPage();
});


// ── CONFIG ───────────────────────────────────────────────────
const NOTIF_API   = `${window.location.protocol}//${window.location.hostname}:8000`;
const NOTIF_KEY   = "dres_notifications";   // localStorage key
const MAX_STORED  = 60;
const POLL_MS     = 15_000;

// BroadcastChannel for same-origin cross-tab messaging
const BC = (typeof BroadcastChannel !== "undefined")
  ? new BroadcastChannel("dres_notif")
  : null;

// ── NOTIFICATION STORE ───────────────────────────────────────
let _notifications = [];   // { id, type, title, body, time, read, role, meta }
let _badge         = 0;
let _pollTimer     = null;
let _onNewCb       = null; // callback(notif) set by host page

function loadStored() {
  try { _notifications = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); }
  catch { _notifications = []; }
  _badge = _notifications.filter(n => !n.read).length;
}
function saveStored() {
  const trimmed = _notifications.slice(0, MAX_STORED);
  localStorage.setItem(NOTIF_KEY, JSON.stringify(trimmed));
}

// ── PUSH PERMISSION ──────────────────────────────────────────
async function requestPushPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied")  return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

// ── SEND BROWSER PUSH ────────────────────────────────────────
function sendBrowserPush(title, body, icon = "/favicon.ico") {
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon, badge: icon, silent: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch (e) { console.warn("[NOTIF] Push failed:", e); }
}

// ── PLAY SOUND ───────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore if audio blocked */ }
}

// ── ADD NOTIFICATION ─────────────────────────────────────────
function addNotification(notif) {
  const n = {
    id:    notif.id   || `n_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    type:  notif.type || "info",       // info | report | order | update | resolve
    title: notif.title || "Notification",
    body:  notif.body  || "",
    time:  notif.time  || new Date().toISOString(),
    read:  false,
    role:  notif.role  || "all",       // all | admin | responder | resident
    meta:  notif.meta  || {},
  };

  // Deduplicate by id
  if (_notifications.find(x => x.id === n.id)) return;

  _notifications.unshift(n);
  _badge++;
  saveStored();
  renderBell();
  renderDropdown();
  playChime();
  sendBrowserPush(n.title, n.body);

  // Broadcast to other tabs
  BC?.postMessage({ type: "NOTIF_NEW", notif: n });

  if (_onNewCb) _onNewCb(n);
}

// ── MARK READ ────────────────────────────────────────────────
function markRead(id) {
  const n = _notifications.find(x => x.id === id);
  if (n && !n.read) { n.read = true; _badge = Math.max(0, _badge - 1); saveStored(); }
  renderBell();
  renderDropdown();
}
function markAllRead() {
  _notifications.forEach(n => { n.read = true; });
  _badge = 0;
  saveStored();
  renderBell();
  renderDropdown();
}

// ── ICON MAP ─────────────────────────────────────────────────
const NOTIF_ICONS = {
  report:  { icon: "fa-triangle-exclamation", color: "#ef4444" },
  order:   { icon: "fa-bullhorn",             color: "#f59e0b" },
  update:  { icon: "fa-circle-info",          color: "#3b82f6" },
  resolve: { icon: "fa-circle-check",         color: "#22c55e" },
  info:    { icon: "fa-bell",                 color: "#a855f7" },
};
function getIcon(type) {
  return NOTIF_ICONS[type] || NOTIF_ICONS.info;
}

// ── RENDER BELL BADGE ────────────────────────────────────────
function renderBell() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  badge.textContent    = _badge > 99 ? "99+" : _badge;
  badge.style.display  = _badge > 0 ? "flex" : "none";
}

// ── RENDER DROPDOWN ──────────────────────────────────────────
function renderDropdown() {
  const list = document.getElementById("notif-list");
  if (!list) return;
  if (!_notifications.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <i class="fa-regular fa-bell-slash"></i>
        <span>No notifications yet</span>
      </div>`;
    return;
  }
  list.innerHTML = _notifications.slice(0, 30).map(n => {
    const { icon, color } = getIcon(n.type);
    const time = timeAgo(n.time);
    return `
      <div class="notif-item ${n.read ? "read" : "unread"}" onclick="handleNotifClick('${n.id}')">
        <div class="ni-icon" style="background:${color}22;color:${color}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="ni-body">
          <div class="ni-title">${esc2(n.title)}</div>
          <div class="ni-desc">${esc2(n.body)}</div>
          <div class="ni-time">${time}</div>
        </div>
        ${!n.read ? '<span class="ni-dot"></span>' : ""}
      </div>`;
  }).join("");
}

function handleNotifClick(id) {
  markRead(id);
  const n = _notifications.find(x => x.id === id);
  if (!n) return;
  // Navigate if meta contains a page hint
  if (n.meta?.page && typeof switchPage === "function") {
    const btn = document.querySelector(`[data-page="${n.meta.page}"]`);
    switchPage(n.meta.page, btn);
  }
  if (n.meta?.reportId && typeof openModalById === "function") {
    openModalById(n.meta.reportId);
  }
}

// ── TIME AGO ─────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
function esc2(s) {
  return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── TOGGLE DROPDOWN ──────────────────────────────────────────
function toggleNotifPanel() {
  const panel = document.getElementById("notif-panel");
  if (!panel) return;
  const open = panel.classList.toggle("open");
  if (open) { renderDropdown(); }
}
// Close on outside click
document.addEventListener("click", e => {
  const wrap = document.getElementById("notif-wrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("notif-panel")?.classList.remove("open");
  }
});

// ── INJECT BELL HTML ─────────────────────────────────────────
function injectBell(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.insertAdjacentHTML("beforeend", `
    <div class="notif-wrap" id="notif-wrap">
      <button class="notif-btn" onclick="toggleNotifPanel()" title="Notifications">
        <i class="fa-regular fa-bell"></i>
        <span class="notif-badge" id="notif-badge" style="display:none">0</span>
      </button>
      <div class="notif-panel" id="notif-panel">
        <div class="notif-header">
          <span class="notif-title">Notifications</span>
          <button class="notif-clear" onclick="markAllRead()">Mark all read</button>
        </div>
        <div class="notif-list" id="notif-list"></div>
      </div>
    </div>`);
  renderBell();
}

// ── INJECT BELL CSS ──────────────────────────────────────────
function injectBellStyles() {
  if (document.getElementById("notif-styles")) return;
  const s = document.createElement("style");
  s.id = "notif-styles";
  s.textContent = `
    .notif-wrap { position:relative; }
    .notif-btn {
      position:relative; background:transparent; border:none; cursor:pointer;
      width:38px; height:38px; border-radius:10px; display:flex;
      align-items:center; justify-content:center;
      color:var(--text-2,#8a92a8); font-size:1.1rem;
      transition:background .15s, color .15s;
    }
    .notif-btn:hover { background:var(--surface-2,rgba(255,255,255,.06)); color:var(--text-1,#e2e8f0); }
    .notif-badge {
      position:absolute; top:4px; right:4px;
      min-width:17px; height:17px; padding:0 4px;
      background:#ef4444; color:#fff; border-radius:20px;
      font-size:10px; font-weight:700; line-height:17px;
      text-align:center; border:2px solid var(--bg,#0f1117);
      align-items:center; justify-content:center;
    }
    .notif-panel {
      position:absolute; top:calc(100% + 10px); right:0;
      width:340px; max-height:480px;
      background:var(--card-bg,#1a1d27);
      border:1px solid var(--border,rgba(255,255,255,.08));
      border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.5);
      display:none; flex-direction:column; overflow:hidden;
      z-index:9999; animation:notifSlide .2s ease;
    }
    .notif-panel.open { display:flex; }
    @keyframes notifSlide {
      from { opacity:0; transform:translateY(-8px) scale(.97); }
      to   { opacity:1; transform:none; }
    }
    .notif-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 16px 10px; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
      flex-shrink:0;
    }
    .notif-title { font-weight:700; font-size:.85rem; color:var(--text-1,#e2e8f0); }
    .notif-clear {
      background:none; border:none; cursor:pointer;
      font-size:.72rem; color:var(--text-3,#4a5568);
      padding:4px 8px; border-radius:6px; transition:background .15s;
    }
    .notif-clear:hover { background:rgba(255,255,255,.06); color:var(--text-2,#8a92a8); }
    .notif-list { overflow-y:auto; flex:1; }
    .notif-item {
      display:flex; align-items:flex-start; gap:12px;
      padding:12px 16px; cursor:pointer; position:relative;
      transition:background .15s; border-bottom:1px solid var(--border,rgba(255,255,255,.05));
    }
    .notif-item:hover  { background:rgba(255,255,255,.04); }
    .notif-item.unread { background:rgba(59,130,246,.04); }
    .ni-icon {
      width:36px; height:36px; border-radius:10px; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-size:.85rem;
    }
    .ni-body { flex:1; min-width:0; }
    .ni-title { font-size:.78rem; font-weight:600; color:var(--text-1,#e2e8f0); margin-bottom:2px; }
    .ni-desc  { font-size:.71rem; color:var(--text-2,#8a92a8); line-height:1.4; margin-bottom:4px;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ni-time  { font-size:.67rem; color:var(--text-3,#4a5568); }
    .ni-dot   {
      position:absolute; top:50%; right:14px; transform:translateY(-50%);
      width:7px; height:7px; border-radius:50%; background:#3b82f6; flex-shrink:0;
    }
    .notif-empty {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:2.5rem 1rem; gap:.75rem; color:var(--text-3,#4a5568); font-size:.8rem;
    }
    .notif-empty i { font-size:1.8rem; opacity:.4; }
    @media (max-width:420px) {
      .notif-panel { width:calc(100vw - 24px); right:-8px; }
    }
  `;
  document.head.appendChild(s);
}

// ── POLL BACKEND FOR NEW NOTIFICATIONS ───────────────────────
async function pollNotifications() {
  try {
    const r = await fetch(`${NOTIF_API}/api/notifications/`, {
      headers: { "Authorization": "Bearer " + (sessionStorage.getItem("token") || "") },
    });
    if (!r.ok) return;
    const data = await r.json();
    const list = Array.isArray(data) ? data : (data?.data || []);
    list.forEach(n => addNotification({
      id:    String(n.id),
      type:  n.type  || "info",
      title: n.title || n.subject || "New notification",
      body:  n.body  || n.message || "",
      time:  n.created_at || new Date().toISOString(),
      role:  n.role  || "all",
      meta:  n.meta  || { page: n.page, reportId: n.report_id },
    }));
  } catch { /* backend unavailable — silent */ }
}

// ── CROSS-TAB RECEIVE ────────────────────────────────────────
if (BC) {
  BC.onmessage = e => {
    if (e.data?.type === "NOTIF_NEW") {
      const n = e.data.notif;
      if (!_notifications.find(x => x.id === n.id)) {
        _notifications.unshift(n);
        if (!n.read) _badge++;
        saveStored();
        renderBell();
        renderDropdown();
        playChime();
      }
    }
  };
}

// ── INIT ─────────────────────────────────────────────────────
function initNotifications(bellContainerId, onNewCallback) {
  _onNewCb = onNewCallback || null;
  loadStored();
  injectBellStyles();
  injectBell(bellContainerId);
  requestPushPermission();
  pollNotifications();
  _pollTimer = setInterval(pollNotifications, POLL_MS);
}

// ── PUBLIC API ───────────────────────────────────────────────
window.DRES_NOTIF = {
  init:       initNotifications,
  add:        addNotification,
  markRead,
  markAllRead,
  toggle:     toggleNotifPanel,
  getAll:     () => [..._notifications],
  getUnread:  () => _notifications.filter(n => !n.read),
};