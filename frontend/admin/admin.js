      const API = `${window.location.protocol}//${window.location.hostname}:8000`;

      const PAGE_META = {
        dashboard: ["Dashboard", "Overview & Demographics"],
        map: ["Typhoon Map", "Live tracker & municipal data"],
        reports: ["Incident Reports", "All submitted reports"],
        chatbot: ["Chatbot Logs", "DRES-Bot resident conversations"],
        settings: ["Settings", "System configuration"],
      };

      const FALLBACK = {
        stats: [
          {
            icon: '<i class="bi bi-tornado"></i>',
            label: "Active Typhoon Alerts",
            value: "0",
            sub: "No active alerts",
            color: "#ef4444",
          },
          {
            icon: '<i class="bi bi-clipboard"></i>',
            label: "Total Reports (2025)",
            value: "0",
            sub: "This year",
            color: "#3b82f6",
          },
          {
            icon: '<i class="bi bi-houses"></i>',
            label: "Affected Barangays",
            value: "0",
            sub: "With submitted reports",
            color: "#f59e0b",
          },
          {
            icon: '<i class="bi bi-hourglass"></i>',
            label: "Pending Reports",
            value: "0",
            sub: "Awaiting review",
            color: "#8b5cf6",
          },
          {
            icon: '<i class="bi bi-check-circle"></i>',
            label: "Resolved Incidents",
            value: "0",
            sub: "0% resolution rate",
            color: "#22c55e",
          },
        ],
        byMonth: "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec"
          .split(",")
          .map((l) => ({ label: l, reports: 0, affected: 0 })),
        byYear: ["2022", "2023", "2024", "2025"].map((l) => ({
          label: l,
          reports: 0,
          affected: 0,
          typhoons: 0,
        })),
        flood: [
          {
            name: "Barangay Magpanambo",
            risk: "High",
            households: 312,
            lastFlooded: "2024",
          },
          {
            name: "Barangay Oas",
            risk: "High",
            households: 278,
            lastFlooded: "2023",
          },
          {
            name: "Barangay San Francisco",
            risk: "High",
            households: 195,
            lastFlooded: "2024",
          },
          {
            name: "Barangay Tinago",
            risk: "Medium",
            households: 243,
            lastFlooded: "2023",
          },
          {
            name: "Barangay Salvacion",
            risk: "Medium",
            households: 187,
            lastFlooded: "2022",
          },
          {
            name: "Barangay Paulba",
            risk: "Medium",
            households: 156,
            lastFlooded: "2023",
          },
          {
            name: "Barangay Cotmon",
            risk: "Low",
            households: 134,
            lastFlooded: "2021",
          },
          {
            name: "Barangay Tambo",
            risk: "Low",
            households: 98,
            lastFlooded: "2021",
          },
        ],
        recentReports: [],
        municipal: {
          profile: [
            ["Municipality", "Polangui"],
            ["Province", "Albay"],
            ["Population", "118,657"],
            ["Land Area", "239.83 km²"],
            ["No. of Barangays", "44"],
            ["Households", "24,890"],
            ["Elevation Range", "40–1,550 m"],
            ["Main River", "Polangui River"],
            ["Disaster Risk", "High"],
          ],
          contact: [
            ["Office Head", "—"],
            ["Contact No.", "(052) 486-0160"],
            ["Office", "Municipal DRRMO Polangui"],
            ["Email", "mdrrmo@polangui.gov.ph"],
            ["Operating Hours", "24/7 during alerts"],
          ],
        },
        alertLevels: [
          {
            level: "Signal #1",
            desc: "Moderate winds (30–60 km/h)",
            active: false,
          },
          {
            level: "Signal #2",
            desc: "Strong winds (61–120 km/h)",
            active: false,
          },
          {
            level: "Signal #3",
            desc: "Very strong winds (121–170 km/h)",
            active: false,
          },
          {
            level: "Signal #4",
            desc: "Extreme winds (171–220 km/h)",
            active: false,
          },
        ],
      };

      let chartData = {
        reports: { month: [], year: [] },
        affected: { month: [], year: [] },
      };

      const TYPE_ICONS = {
        Flood: '<i class="bi bi-water"></i>',
        "Wind Damage": '<i class="bi bi-wind"></i>',
        "Missing Person": '<i class="bi bi-person-dash"></i>',
        "Road Block": '<i class="bi bi-sign-stop"></i>',
        "Power Outage": '<i class="bi bi-lightning"></i>',
        Other: '<i class="bi bi-file-earmark"></i>',
      };
      const SEV_COLOR = {
        critical: "#ef4444",
        high: "#f59e0b",
        moderate: "#3b82f6",
        low: "#22c55e",
      };

      // Clock
      setInterval(() => {
        document.getElementById("clock").textContent =
          new Date().toLocaleTimeString();
      }, 1000);
      document.getElementById("clock").textContent =
        new Date().toLocaleTimeString();

      // Page switch
      function switchPage(id, btn) {
        document
          .querySelectorAll(".page")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".nav-btn")
          .forEach((b) => b.classList.remove("active"));
        document.getElementById("page-" + id).classList.add("active");
        if (btn) btn.classList.add("active");
        const m = PAGE_META[id] || [id, ""];
        document.getElementById("tb-title").innerHTML =
          `${m[0]} <span>${m[1]}</span>`;
        document.getElementById("sidebar").classList.remove("open");
        if (id === "reports") loadAllReports();
        if (id === "chatbot") loadChatLogs();
        if (id === "settings") {
          loadUsers();
          loadSignalLevel();
          loadContactSettings();
        }
      }

      // Auth
      function loadAdminInfo() {
        const n = sessionStorage.getItem("admin_name") || "Admin User";
        const i = n
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        document.getElementById("sb-name").textContent = n;
        document.getElementById("sb-avatar").textContent = i;
      }
      function logout() {
        fetch(`${API}/api/auth/logout`, { method: "POST" })
          .catch(() => {})
          .finally(() => {
            sessionStorage.clear();
            window.location.href = "/index.html";
          });
      }

      // Fetch helper
      async function apiFetch(ep) {
        try {
          const r = await fetch(API + ep, {
            headers: {
              Authorization:
                "Bearer " + (sessionStorage.getItem("token") || ""),
            },
          });
          if (!r.ok) throw new Error(r.status);
          return await r.json();
        } catch (e) {
          console.warn("API fail:", ep);
          return null;
        }
      }

      // Stats
      function renderStats(stats) {
        document.getElementById("stats-row").innerHTML = stats
          .map(
            (s) => `
      <div class="stat-card" style="border-left-color:${s.color}">
        <div class="stat-icon">${s.icon}</div>
        <div><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div><div class="stat-sub">${s.sub}</div></div>
      </div>`,
          )
          .join("");
      }

      // Bar chart
      function renderBarChart(id, data, key, grad) {
        const el = document.getElementById(id);
        if (!el || !data.length) return;
        const max = Math.max(...data.map((d) => d[key]), 1);
        el.innerHTML = data
          .map(
            (d) => `
      <div class="bar-col">
        <div class="bar-track"><div class="bar-fill" style="height:${Math.max((d[key] / max) * 100, 2)}%;background:${grad}"></div></div>
        <div class="bar-label">${d.label}</div>
      </div>`,
          )
          .join("");
      }
      function switchChart(cid, mode, btn) {
        btn
          .closest(".toggle-group")
          .querySelectorAll(".toggle-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (cid === "reports")
          renderBarChart(
            "chart-reports",
            chartData.reports[mode],
            "reports",
            "linear-gradient(to top,#1d4ed8,#60a5fa)",
          );
        else
          renderBarChart(
            "chart-affected",
            chartData.affected[mode],
            "affected",
            "linear-gradient(to top,#b91c1c,#fca5a5)",
          );
      }

      // Flood table
      function renderFloodTable(data) {
        document.getElementById("flood-count").textContent =
          data.length + " barangays";
        const rc = { High: "b-high", Medium: "b-med", Low: "b-low" };
        document.getElementById("flood-table-wrap").innerHTML = `
      <table class="data-table">
        <thead><tr><th>Barangay</th><th>Risk</th><th>Households</th><th>Last Flooded</th></tr></thead>
        <tbody>${data.map((b) => `<tr><td>${b.name}</td><td><span class="badge ${rc[b.risk]}">${b.risk}</span></td><td>${Number(b.households).toLocaleString()}</td><td>${b.lastFlooded}</td></tr>`).join("")}</tbody>
      </table>`;
      }

      // Recent reports
      function renderRecentReports(rpts) {
        const sc = {
          Pending: "b-pending",
          Reviewed: "b-reviewed",
          Resolved: "b-resolved",
          Active: "b-reviewed",
          Monitoring: "b-pending",
        };
        if (!rpts?.length) {
          document.getElementById("recent-reports-list").innerHTML =
            `<div style="padding:1rem;color:var(--muted);font-size:.8rem;text-align:center">Walang reports pa.</div>`;
          return;
        }
        document.getElementById("recent-reports-list").innerHTML = rpts
          .map(
            (r) => `
      <div class="report-item">
        <div class="r-left"><span class="r-id">${r.id}</span><span class="r-brgy">${r.barangay} — ${r.type}</span></div>
        <div class="r-right"><span class="badge ${sc[r.status] || "b-pending"}">${r.status}</span><span class="r-time">${r.time}</span></div>
      </div>`,
          )
          .join("");
      }

      // Year table
      function renderYearTable(data) {
        document.getElementById("year-table-wrap").innerHTML = `
      <table class="data-table">
        <thead><tr><th>Year</th><th>Typhoons</th><th>Reports</th><th>Affected</th></tr></thead>
        <tbody>${data.map((y) => `<tr><td>${y.label}</td><td>🌀 ${y.typhoons}</td><td>${y.reports}</td><td>${Number(y.affected).toLocaleString()}</td></tr>`).join("")}</tbody>
      </table>`;
      }

      // Municipal
      function renderMunicipal(data) {
        const row = ([k, v]) =>
          `<div class="muni-row"><span class="muni-k">${k}</span><span class="muni-v">${v}</span></div>`;
        document.getElementById("muni-profile").innerHTML = data.profile
          .map(row)
          .join("");
        document.getElementById("muni-contact").innerHTML = data.contact
          .map(row)
          .join("");
      }
      function renderAlertLevels(lvls) {
        document.getElementById("alert-levels").innerHTML = lvls
          .map(
            (a) => `
      <div class="al-row${a.active ? " al-active" : ""}">
        <div><span class="al-name">${a.level}</span><span class="al-desc">${a.desc}</span></div>
        ${a.active ? '<span class="al-badge">ACTIVE</span>' : ""}
      </div>`,
          )
          .join("");
      }

      // ── ALL REPORTS ──────────────────────────────────────────
      async function loadAllReports() {
        const status = document.getElementById("filter-status")?.value || "";
        const type = document.getElementById("filter-type")?.value || "";
        const wrap = document.getElementById("all-reports-wrap");
        wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;

        let url = "/api/admin/reports?limit=100";
        if (status) url += `&status=${status}`;
        if (type) url += `&report_type=${encodeURIComponent(type)}`;

        const res = await apiFetch(url);
        const reports = res?.data || [];

        // Pending badge
        const pc = reports.filter((r) => r.status === "Pending").length;
        const badge = document.getElementById("pending-badge");
        badge.textContent = pc;
        badge.style.display = pc > 0 ? "inline" : "none";

        if (!reports.length) {
          wrap.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--muted)">Walang reports na nahanap.</div>`;
          return;
        }

        const sc = {
          Pending: "b-pending",
          Reviewed: "b-reviewed",
          Resolved: "b-resolved",
        };
        wrap.innerHTML = reports
          .map(
            (r) => `
      <div class="rpt-card" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
        <div class="rpt-top">
          <span class="rpt-type">${TYPE_ICONS[r.type] || "📝"} ${r.type}</span>
          <span class="rpt-id">${r.id}</span>
        </div>
        <div class="rpt-desc">${r.description || "—"}</div>
        <div class="rpt-meta">
          <span class="rpt-loc">📍 ${r.barangay} · <span style="font-size:.68rem">${r.created_at || ""}</span></span>
          <div class="rpt-acts">
            ${r.image_path ? '<span class="img-chip">📷 Photo</span>' : ""}
            <span class="badge ${sc[r.status] || "b-pending"}">${r.status}</span>
          </div>
        </div>
      </div>`,
          )
          .join("");
      }

      // ── MODAL ────────────────────────────────────────────────
      function openModal(r) {
        const sc = {
          Pending: "b-pending",
          Reviewed: "b-reviewed",
          Resolved: "b-resolved",
        };
        const sev = (r.severity || "").toLowerCase();
        const sc2 = SEV_COLOR[sev] || "#3b82f6";

        document.getElementById("modal-title").innerHTML =
          `${TYPE_ICONS[r.type] || "📝"} ${r.type} <span style="font-size:.75em;color:var(--muted);font-weight:400">${r.id}</span>`;

        // Image section — tries to load from backend /uploads path
        let imgHtml = "";
        if (r.image_path) {
          const clean = r.image_path.replace(/\\/g, "/");
          const src = `${API}/${clean}`;

          imgHtml = `
            <div class="rpt-photo">
              <img src="${src}" alt="Incident photo"
                onerror="this.closest('.rpt-photo').innerHTML='<div class=rpt-photo-err>⚠️ Image could not be loaded — check backend uploads</div>'" />
              <div class="rpt-photo-label">📷 ${clean.split("/").pop()}</div>
            </div>`;
        }

        document.getElementById("modal-body").innerHTML = `
      ${imgHtml}
      <div class="m-row"><span class="m-key">Report ID</span><span class="m-val" style="font-family:'IBM Plex Mono',monospace;font-size:.78rem">${r.id}</span></div>
      <div class="m-row"><span class="m-key">Status</span><span class="m-val"><span class="badge ${sc[r.status] || "b-pending"}">${r.status}</span></span></div>
      <div class="m-row"><span class="m-key">Barangay</span><span class="m-val">${r.barangay || "—"}</span></div>
      <div class="m-row"><span class="m-key">Report Type</span><span class="m-val">${r.type || "—"}</span></div>
      <div class="m-row">
        <span class="m-key">Severity</span>
        <span class="m-val"><span style="background:${sc2}20;border:1px solid ${sc2};color:${sc2};padding:2px 10px;border-radius:20px;font-size:.72rem;font-weight:700">${(r.severity || "—").toUpperCase()}</span></span>
      </div>
      <div class="m-row"><span class="m-key">Submitted</span><span class="m-val">${r.created_at || "—"}</span></div>
      ${r.latitude ? `<div class="m-row"><span class="m-key">Location</span><span class="m-val">${r.latitude}, ${r.longitude}</span></div>` : ""}
      <div class="m-row" style="flex-direction:column;align-items:flex-start;gap:.35rem">
        <span class="m-key">Description</span>
        <div class="desc-box">${r.description || "—"}</div>
      </div>
      <div class="status-strip">
        <label>Update Status:</label>
        <select id="modal-sel">
          <option value="pending"  ${r.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="reviewed" ${r.status === "Reviewed" ? "selected" : ""}>Reviewed</option>
          <option value="resolved" ${r.status === "Resolved" ? "selected" : ""}>Resolved</option>
        </select>
        <button class="upd-btn" onclick="updateStatus('${r.id}')">✅ Update</button>
      </div>`;

        document.getElementById("rptModal").classList.add("open");
      }

      function closeModal() {
        document.getElementById("rptModal").classList.remove("open");
      }

      async function updateStatus(rid) {
        const nv = document.getElementById("modal-sel").value;
        const numId = rid.replace("RPT-", "").replace(/^0+/, "") || "0";
        try {
          const res = await fetch(`${API}/api/reports/${numId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nv }),
          });
          if (res.ok) {
            closeModal();
            loadAllReports();
            loadDashboard();
          }
        } catch (e) {
          console.error(e);
        }
      }

      // ── CHATBOT LOGS ─────────────────────────────────────────
      async function loadChatLogs() {
        const uid = document.getElementById("filter-uid")?.value || "";
        const wrap = document.getElementById("chat-logs-wrap");
        wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;
        const st = await apiFetch("/api/admin/chatbot-stats");
        if (st?.data) {
          document.getElementById("cs-total").textContent =
            st.data.total_conversations;
          document.getElementById("cs-users").textContent =
            st.data.unique_users;
        }
        const res = await apiFetch(
          `/api/admin/chatbot-logs?limit=50${uid ? "&user_id=" + uid : ""}`,
        );
        const logs = res?.data || [];
        if (!logs.length) {
          wrap.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--muted)">Walang chat logs pa.</div>`;
          return;
        }
        wrap.innerHTML = logs
          .map(
            (l) => `
      <div class="cl-item">
        <div class="cl-head">
          <span class="cl-uid">User #${l.user_id}</span>
          <span class="cl-time">${l.created_at ? new Date(l.created_at).toLocaleString("en-PH") : "—"}</span>
        </div>
        <div class="cl-q"><strong>Resident asked:</strong>${esc(l.message)}</div>
        <div class="cl-a">${esc((l.response || "").replace(/<[^>]+>/g, "")).slice(0, 200)}${(l.response?.length || 0) > 200 ? "…" : ""}</div>
      </div>`,
          )
          .join("");
      }
      function esc(s) {
        return (s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      // ── SETTINGS ─────────────────────────────────────────────
      function setSignalLevel(btn) {
        document
          .querySelectorAll(".sig-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("dres_signal_level", btn.dataset.level);
        const el = document.getElementById("signal-saved");
        el.style.display = "block";
        setTimeout(() => (el.style.display = "none"), 2000);
      }
      function loadSignalLevel() {
        document
          .querySelector(
            `.sig-btn[data-level="${localStorage.getItem("dres_signal_level") || "0"}"]`,
          )
          ?.classList.add("active");
      }
      function saveContact() {
        localStorage.setItem(
          "dres_contact",
          JSON.stringify({
            head: document.getElementById("s-head").value,
            contact: document.getElementById("s-contact").value,
            email: document.getElementById("s-email").value,
            hours: document.getElementById("s-hours").value,
          }),
        );
        const el = document.getElementById("contact-saved");
        el.style.display = "block";
        setTimeout(() => (el.style.display = "none"), 2000);
      }
      function loadContactSettings() {
        try {
          const d = JSON.parse(localStorage.getItem("dres_contact") || "{}");
          if (d.head) document.getElementById("s-head").value = d.head;
          if (d.contact) document.getElementById("s-contact").value = d.contact;
          if (d.email) document.getElementById("s-email").value = d.email;
          if (d.hours) document.getElementById("s-hours").value = d.hours;
        } catch (e) {}
      }
      async function loadUsers() {
        const wrap = document.getElementById("users-wrap");
        wrap.innerHTML = `<div class="loading"><div class="spinner"></div>Loading…</div>`;
        const res = await apiFetch("/api/admin/users");
        const users = res?.data || [];
        if (!users.length) {
          wrap.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Walang users pa.</div>`;
          return;
        }
        wrap.innerHTML = users
          .map(
            (u) => `
      <div class="user-row">
        <div><div class="ur-name">${u.name || "—"}</div><div class="ur-email">${u.email} · ${u.barangay || "No barangay"}</div></div>
        <span class="ur-b ${u.role === "mdrrmo" ? "ur-md" : "ur-res"}">${u.role}</span>
      </div>`,
          )
          .join("");
      }

      // ── MAIN LOADERS ─────────────────────────────────────────
      async function loadDashboard() {
        const [sR, mR, yR, fR, rR] = await Promise.all([
          apiFetch("/api/admin/stats"),
          apiFetch("/api/admin/disasters/monthly"),
          apiFetch("/api/admin/disasters/yearly"),
          apiFetch("/api/admin/flood-barangays"),
          apiFetch("/api/admin/reports/recent"),
        ]);
        renderStats(sR?.data || FALLBACK.stats);
        const bm = mR?.data || FALLBACK.byMonth,
          by = yR?.data || FALLBACK.byYear;
        chartData.reports.month = chartData.affected.month = bm;
        chartData.reports.year = chartData.affected.year = by;
        renderBarChart(
          "chart-reports",
          bm,
          "reports",
          "linear-gradient(to top,#1d4ed8,#60a5fa)",
        );
        renderBarChart(
          "chart-affected",
          bm,
          "affected",
          "linear-gradient(to top,#b91c1c,#fca5a5)",
        );
        renderFloodTable(fR?.data || FALLBACK.flood);
        renderRecentReports(rR?.data || FALLBACK.recentReports);
        renderYearTable(by);
      }

      async function loadMapPage() {
        const [mR, aR] = await Promise.all([
          apiFetch("/api/admin/municipal"),
          apiFetch("/api/admin/alert-levels"),
        ]);
        renderMunicipal(mR?.data || FALLBACK.municipal);
        renderAlertLevels(aR?.data || FALLBACK.alertLevels);
      }

      document.addEventListener("DOMContentLoaded", () => {
        loadAdminInfo();
        loadDashboard();
        loadMapPage();
      });

