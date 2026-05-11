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
    { icon: '<i class="fa-solid fa-clipboard"></i>',   label: "Total Reports (2025)",  value: "0",  sub: "This year",              color: "#3b82f6" },
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
      ["Office Head",      "—"],
      ["Contact No.",      "(052) 486-0160"],
      ["Office",           "Municipal DRRMO Polangui"],
      ["Email",            "mdrrmo@polangui.gov.ph"],
      ["Operating Hours",  "24/7 during alerts"],
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
  high:     "#f59e0b",
  moderate: "#3b82f6",
  low:      "#22c55e",
};

// ── CHART STATE ──────────────────────────────────────────────
let chartData = {
  reports:  { month: [], year: [] },
  affected: { month: [], year: [] },
};

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

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
  t.style.borderColor = type === "error" ? "rgba(239,68,68,0.4)" : type === "success" ? "rgba(34,197,94,0.4)" : "";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// ── CLOCK ────────────────────────────────────────────────────
function startClock() {
  const tick = () => {
    const now = new Date();
    const el = document.getElementById("clock");
    if (el) el.textContent = now.toLocaleTimeString("en-PH");
    const de = document.getElementById("tb-date");
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

  const m = PAGE_META[id] || [id, ""];
  const tp = document.getElementById("tb-page");
  const ts = document.getElementById("tb-sub");
  if (tp) tp.textContent = m[0];
  if (ts) ts.textContent = m[1];

  document.getElementById("sidebar")?.classList.remove("open");

  if (id === "reports") loadAllReports();
  if (id === "chatbot") loadChatLogs();
  if (id === "settings") { loadUsers(); loadSignalLevel(); loadContactSettings(); }
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

function loadAdminInfo() {
  const n = sessionStorage.getItem("admin_name") || "Admin User";
  const initials = n.split(" ").map(w => w[0] || "").join("").toUpperCase().slice(0, 2);
  const nameEl = document.getElementById("sb-name");
  const avatarEl = document.getElementById("sb-avatar");
  if (nameEl) nameEl.textContent = n;
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
    const val = d[key] > 0 ? d[key] : "";
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
    renderBarChart("chart-reports", chartData.reports[mode], "reports",
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
      <thead>
        <tr>
          <th>Barangay</th>
          <th>Risk</th>
          <th>Households</th>
          <th>Last Flooded</th>
        </tr>
      </thead>
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
      <thead>
        <tr>
          <th>Year</th>
          <th>Typhoons</th>
          <th>Reports</th>
          <th>Affected</th>
        </tr>
      </thead>
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
// MAP PAGE
// ══════════════════════════════════════════════════════════════

function renderMunicipal(data) {
  const row = ([k, v]) => `
    <div class="muni-row">
      <span class="muni-k">${k}</span>
      <span class="muni-v">${v}</span>
    </div>`;
  const profileEl  = document.getElementById("muni-profile");
  const contactEl  = document.getElementById("muni-contact");
  if (profileEl) profileEl.innerHTML  = data.profile.map(row).join("");
  if (contactEl) contactEl.innerHTML  = data.contact.map(row).join("");
}

function renderAlertLevels(lvls) {
  const el = document.getElementById("alert-levels");
  if (!el) return;
  el.innerHTML = lvls.map(a => `
    <div class="al-row${a.active ? " al-active" : ""}">
      <div>
        <span class="al-name">${a.level}</span>
        <span class="al-desc">${a.desc}</span>
      </div>
      ${a.active ? '<span class="al-badge">ACTIVE</span>' : ""}
    </div>`).join("");
}

// ══════════════════════════════════════════════════════════════
// SIGNAL INDICATOR (topbar + sidebar)
// ══════════════════════════════════════════════════════════════

function updateSignalUI(level) {
  const n = parseInt(level || 0);
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

  // Count chips
  const counts = { all: reports.length, pending: 0, reviewed: 0, resolved: 0 };
  reports.forEach(r => {
    const s = (r.status || "pending").toLowerCase();
    if (counts[s] !== undefined) counts[s]++;
  });
  ["all","pending","reviewed","resolved"].forEach(k => {
    const el = document.getElementById("chip-" + k);
    if (el) el.textContent = counts[k];
  });

  // Pending badge in sidebar
  const badge = document.getElementById("pending-badge");
  if (badge) {
    badge.textContent = counts.pending;
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
    const id       = r.id || r.report_id || "—";
    const type     = r.type || r.report_type || "Other";
    const barangay = r.barangay || r.barangay_name || "Unknown";
    const desc     = r.description || r.details || "—";
    const image    = r.image_path || r.image || null;
    const created  = fmtDate(r.created_at || r.date);
    const status   = (r.status || "pending").toLowerCase();

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

// Quick-filter helper (chip buttons)
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
  const statusClass = {
    Pending:  "b-pending",
    Reviewed: "b-reviewed",
    Resolved: "b-resolved",
  };
  const sev    = (r.severity || "").toLowerCase();
  const sevClr = SEV_COLOR[sev] || "#3b82f6";
  const type   = r.type || r.report_type || "Other";
  const status = r.status || "Pending";

  // Title
  document.getElementById("modal-title").innerHTML =
    `${TYPE_ICONS[type] || TYPE_ICONS["Other"]}
     <span>${type}</span>
     <span style="font-size:.65em;color:var(--text-3);font-weight:400;font-family:var(--font-mono)">${r.id || ""}</span>`;

  // Image section
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
    </div>`;

  document.getElementById("rptModal").classList.add("open");
}

function closeModal() {
  document.getElementById("rptModal").classList.remove("open");
}

async function updateStatus(rid) {
  const nv     = document.getElementById("modal-sel").value;
  const numId  = String(rid).replace("RPT-", "").replace(/^0+/, "") || "0";
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
    if (usersEl) usersEl.textContent = st.data.unique_users ?? "—";
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
      <div class="cl-a">${esc((l.response || "").replace(/<[^>]+>/g, "")).slice(0, 200)}${(l.response?.length || 0) > 200 ? "…" : ""}</div>
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
    if (d.head)    { const e = document.getElementById("s-head");    if (e) e.value = d.head; }
    if (d.contact) { const e = document.getElementById("s-contact"); if (e) e.value = d.contact; }
    if (d.email)   { const e = document.getElementById("s-email");   if (e) e.value = d.email; }
    if (d.hours)   { const e = document.getElementById("s-hours");   if (e) e.value = d.hours; }
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
  chartData.reports.month  = chartData.affected.month = bm;
  chartData.reports.year   = chartData.affected.year  = by;

  renderBarChart("chart-reports",  bm, "reports",  "linear-gradient(to top,#1d4ed8,#60a5fa)");
  renderBarChart("chart-affected", bm, "affected", "linear-gradient(to top,#b91c1c,#fca5a5)");
  renderFloodTable(fR?.data || FALLBACK.flood);
  renderRecentReports(rR?.data || FALLBACK.recentReports);
  renderYearTable(by);

  // Update pending badge from stats if available
  const statsArr = sR?.data || FALLBACK.stats;
  const pendingStat = statsArr.find(s => s.label?.toLowerCase().includes("pending"));
  if (pendingStat) {
    const badge = document.getElementById("pending-badge");
    const n     = parseInt(pendingStat.value || 0);
    if (badge) {
      badge.textContent = n;
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

// ══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// Click outside modal close
document.getElementById("rptModal")?.addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  loadAdminInfo();
  startClock();
  loadSignalLevel();
  loadDashboard();
  loadMapPage();
});


const barangays = {
  'AGOS': [55,225], 'COTONOGAN': [100,198], 'MAGPANAMBO': [155,169],
  'LAPURISIMA': [272,151], 'LOURDES': [363,149], 'LIDONG': [458,168],
  'ANOPOL': [524,175], 'MAYSUA': [588,178], 'DANAO': [620,147],
  'COTMON': [615,232], 'BALINAD': [582,295], 'NAPO': [565,355],
  'MATACON': [162,267], 'BALANGIBANG': [244,335], 'KINALE': [225,392],
  'ALOMON': [238,435], 'MAYNAGA': [489,217], 'AMOGUIS': [524,219],
  'STA. TERESITA': [218,179], 'SAN ROQUE': [192,228], 'LA MEDALLA': [294,217],
  'SANTICON': [220,275], 'APAD': [310,273], 'KINUARTILAN': [373,229],
  'LANIGAY': [362,290], 'GAMOT': [432,287], 'ITARAN': [443,249],
  'PINAGDAPUGAN': [513,260], 'BUYO': [503,297], 'CEPRES': [453,320],
  'BALABA': [530,332], 'PINTOR': [420,348], 'STA. CRUZ': [483,348],
  'PONSO': [490,393], 'MENDEZ': [455,432], 'SUGCAD': [350,337],
  'CENTRO OCC.': [312,382], 'CENTRO OR.': [378,383], 'UBALIW': [308,432],
  'QARON': [380,427], 'BASUD': [352,460], 'ALNAY': [420,460]
};

const reports = {};
const sel = document.getElementById('brgy-select');
Object.keys(barangays).sort().forEach(b => {
  const o = document.createElement('option');
  o.value = b; o.textContent = b;
  sel.appendChild(o);
});

function addReport(brgy, sev) {
  brgy = brgy || document.getElementById('brgy-select').value;
  sev = sev || document.getElementById('sev-select').value;
  if (!reports[brgy]) reports[brgy] = [];
  reports[brgy].push({ sev, time: new Date().toLocaleTimeString() });
  renderDots();
  renderList();
}

function clearReports() {
  Object.keys(reports).forEach(k => delete reports[k]);
  renderDots();
  renderList();
}

function selectBrgy(name, x, y) {
  document.getElementById('brgy-select').value = name;
}

function severityRank(s) { return s === 'critical' ? 3 : s === 'moderate' ? 2 : 1; }

function renderDots() {
  const layer = document.getElementById('dots-layer');
  layer.innerHTML = '';
  Object.entries(reports).forEach(([brgy, reps]) => {
    if (!reps.length) return;
    const coords = barangays[brgy];
    if (!coords) return;
    const top = reps.reduce((a,b) => severityRank(b.sev) > severityRank(a.sev) ? b : a);
    const cls = 'sev-' + top.sev;
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', coords[0]);
    c.setAttribute('cy', coords[1]);
    c.setAttribute('r', '6');
    c.setAttribute('class', cls);
    c.style.cursor = 'pointer';
    c.addEventListener('mouseenter', e => showTooltip(e, brgy, reps));
    c.addEventListener('mouseleave', hideTooltip);
    layer.appendChild(c);
    // ring
    const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
    ring.setAttribute('cx', coords[0]);
    ring.setAttribute('cy', coords[1]);
    ring.setAttribute('r', '10');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', top.sev === 'critical' ? '#E24B4A' : top.sev === 'moderate' ? '#EF9F27' : '#639922');
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('opacity', '0.4');
    ring.setAttribute('class', cls);
    layer.appendChild(ring);
  });
}

function showTooltip(e, brgy, reps) {
  const t = document.getElementById('tooltip');
  const counts = {critical:0,moderate:0,minor:0};
  reps.forEach(r => counts[r.sev]++);
  t.innerHTML = `<strong>${brgy}</strong><br>${counts.critical ? `🔴 ${counts.critical} critical<br>`:''}${counts.moderate ? `🟡 ${counts.moderate} moderate<br>`:''}${counts.minor ? `🟢 ${counts.minor} minor`:''}`;
  t.style.display = 'block';
  const rect = e.target.closest('svg').getBoundingClientRect();
  t.style.left = (e.clientX - rect.left + 8) + 'px';
  t.style.top = (e.clientY - rect.top - 28) + 'px';
}
function hideTooltip() { document.getElementById('tooltip').style.display='none'; }

function renderList() {
  const list = document.getElementById('report-list');
  const all = [];
  Object.entries(reports).forEach(([b, reps]) => reps.forEach(r => all.push({brgy:b,...r})));
  if (!all.length) { list.innerHTML = '<p style="font-size:12px;color:var(--color-text-secondary);margin:6px 0 0">No reports yet.</p>'; return; }
  all.reverse();
  list.innerHTML = all.map(r => `
    <div class="report-item">
      <div class="dot-badge dot-${r.sev}"></div>
      <span style="font-weight:500">${r.brgy}</span>
      <span style="color:var(--color-text-secondary);font-size:12px;margin-left:auto">${r.sev} · ${r.time}</span>
    </div>
  `).join('');
}

renderList();

// Demo: seed a few reports
setTimeout(() => {
  addReport('AGOS','critical');
  addReport('LOURDES','moderate');
  addReport('CENTRO OCC.','minor');
  addReport('PINAGDAPUGAN','critical');
  addReport('SAN ROQUE','moderate');
}, 300);