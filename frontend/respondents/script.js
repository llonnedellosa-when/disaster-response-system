      "use strict";
      const RT_API = `${window.location.protocol}//${window.location.hostname}:8000`;
      let _selectedSev = "";
      let _myStats = { assigned: 0, resolved: 0, pending: 0 };
      let _statusBusy = false;
      let _orders = [];

      // ── UTILS ────────────────────────────────────────────────────
      function rtEsc(s) {
        return (s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
      function rtFmtDate(s) {
        if (!s) return "—";
        try {
          return new Date(s).toLocaleString("en-PH", {
            dateStyle: "medium",
            timeStyle: "short",
          });
        } catch {
          return s;
        }
      }
      function rtToast(msg, type = "info") {
        const t = document.getElementById("rt-toast");
        if (!t) return;
        t.textContent = msg;
        t.style.borderColor =
          type === "error"
            ? "rgba(239,68,68,.4)"
            : type === "success"
              ? "rgba(34,197,94,.4)"
              : "";
        t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 2800);
      }
      async function rtFetch(ep, opts = {}) {
        try {
          const r = await fetch(RT_API + ep, {
            headers: {
              Authorization:
                "Bearer " + (sessionStorage.getItem("token") || ""),
              "Content-Type": "application/json",
              ...(opts.headers || {}),
            },
            ...opts,
          });
          if (!r.ok) throw new Error(r.status);
          return await r.json();
        } catch (e) {
          console.warn("[RT]", ep, e.message);
          return null;
        }
      }

      // ── PAGE NAV ─────────────────────────────────────────────────
      function rtSwitchPage(id, btn) {
        document
          .querySelectorAll(".rt-page")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".bn-btn")
          .forEach((b) => b.classList.remove("active"));
        const pg = document.getElementById("rt-page-" + id);
        if (pg) pg.classList.add("active");
        if (btn) btn.classList.add("active");
        document.getElementById("scroll-area").scrollTo(0, 0);
        if (id === "history") loadHistory();
      }

      // ── STATUS TOGGLE ─────────────────────────────────────────────
      function toggleStatus() {
        _statusBusy = !_statusBusy;
        const pill = document.getElementById("status-pill");
        const txt = document.getElementById("status-text");
        if (_statusBusy) {
          pill.classList.add("busy");
          txt.textContent = "On Duty";
        } else {
          pill.classList.remove("busy");
          txt.textContent = "Available";
        }
        rtFetch("/api/team/status", {
          method: "PATCH",
          body: JSON.stringify({ status: _statusBusy ? "busy" : "available" }),
        });
      }

      // ── SEV SELECTOR ──────────────────────────────────────────────
      function setSev(el, val) {
        document
          .querySelectorAll(".sev-opt")
          .forEach((o) => o.classList.remove("active"));
        el.classList.add("active");
        _selectedSev = val;
        document.getElementById("rf-sev").value = val;
      }

      // ── GPS ───────────────────────────────────────────────────────
      function getGPS() {
        if (!navigator.geolocation) {
          rtToast("GPS not available", "error");
          return;
        }
        rtToast("Getting location…");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            document.getElementById("rf-lat").value =
              pos.coords.latitude.toFixed(6);
            document.getElementById("rf-lng").value =
              pos.coords.longitude.toFixed(6);
            rtToast("Location acquired", "success");
          },
          () => rtToast("Could not get GPS — enter manually", "error"),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }

      // ── PHOTO PREVIEW ─────────────────────────────────────────────
      function previewPhoto(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.getElementById("photo-img");
          const preview = document.getElementById("photo-preview");
          img.src = e.target.result;
          preview.style.display = "block";
          document.getElementById("photo-label").innerHTML =
            '<i class="fa-solid fa-check" style="color:var(--green)"></i><span>Photo selected</span>';
        };
        reader.readAsDataURL(file);
      }

      // ── LOAD ORDERS ───────────────────────────────────────────────
      async function loadOrders() {
        const wrap = document.getElementById("orders-list");
        const res = await rtFetch("/api/team/orders");
        _orders = Array.isArray(res) ? res : res?.data || [];

        // Update summary
        let assigned = 0,
          resolved = 0,
          pending = 0;
        _orders.forEach((o) => {
          const s = (o.status || "").toLowerCase();
          if (s === "resolved" || s === "confirmed") resolved++;
          else if (s === "assigned" || s === "enroute") assigned++;
          else pending++;
        });
        document.getElementById("sum-assigned").textContent = assigned;
        document.getElementById("sum-resolved").textContent = resolved;
        document.getElementById("sum-pending").textContent = pending;

        // Badge on home tab
        const newOrders = _orders.filter(
          (o) => (o.status || "").toLowerCase() === "new" || !o.acknowledged,
        );
        const badge = document.getElementById("bn-badge-home");
        badge.textContent = newOrders.length;
        badge.style.display = newOrders.length > 0 ? "flex" : "none";

        if (!_orders.length) {
          wrap.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--text-3);font-size:.78rem">
        <i class="fa-solid fa-check-circle" style="font-size:1.8rem;opacity:.3;display:block;margin-bottom:.6rem"></i>
        No active orders right now.
      </div>`;
          return;
        }

        const SEV_MAP = {
          critical: "sev-critical",
          high: "sev-high",
          moderate: "sev-moderate",
          low: "sev-low",
        };
        const STATUS_COLOR = {
          new: "var(--blue)",
          assigned: "var(--amber)",
          enroute: "var(--orange)",
          resolved: "var(--green)",
          confirmed: "var(--green)",
        };

        wrap.innerHTML = _orders
          .map((o) => {
            const sev = (o.severity || "low").toLowerCase();
            const status = (o.status || "new").toLowerCase();
            const sColor = STATUS_COLOR[status] || "var(--text-2)";
            return `
      <div class="order-card ${sev}" onclick="openOrderModal('${o.id}')">
        <div class="oc-top">
          <div class="oc-left">
            <div class="oc-title">${rtEsc(o.barangay || o.barangay_name || "Unknown Barangay")}</div>
            <div class="oc-loc">
              <i class="fa-solid fa-location-dot" style="font-size:.65rem;color:var(--red)"></i>
              ${rtEsc(o.type || o.report_type || "Incident")}
            </div>
          </div>
          <span class="oc-sev ${SEV_MAP[sev] || "sev-low"}">${sev.toUpperCase()}</span>
        </div>
        <div class="oc-desc">${rtEsc((o.description || o.details || "No details provided.").slice(0, 120))}${(o.description || "").length > 120 ? "…" : ""}</div>
        <div class="oc-meta">
          <span class="oc-time">${rtFmtDate(o.created_at)}</span>
          <span style="font-size:.68rem;font-weight:700;color:${sColor}">${status.toUpperCase()}</span>
        </div>
        <div class="oc-actions" onclick="event.stopPropagation()">
          <button class="oc-btn btn-enroute"  onclick="updateOrderStatus('${o.id}','enroute')">
            <i class="fa-solid fa-truck-fast"></i> En Route
          </button>
          <button class="oc-btn btn-resolve"  onclick="updateOrderStatus('${o.id}','resolved')">
            <i class="fa-solid fa-circle-check"></i> Resolved
          </button>
        </div>
      </div>`;
          })
          .join("");
      }

      // ── UPDATE ORDER STATUS ───────────────────────────────────────
      async function updateOrderStatus(orderId, newStatus) {
        const res = await rtFetch(`/api/team/orders/${orderId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        if (res !== null) {
          rtToast(`Marked as ${newStatus}`, "success");
          loadOrders();
          // Notify admin via postMessage (if embedded) or BC
          const bc = new BroadcastChannel("dres_notif");
          bc.postMessage({
            type: "NOTIF_NEW",
            notif: {
              id: `order_upd_${orderId}_${Date.now()}`,
              type: "update",
              title: `Response Team Update`,
              body: `Order #${orderId} marked as ${newStatus.toUpperCase()}`,
              time: new Date().toISOString(),
              role: "admin",
              meta: { page: "reports", reportId: orderId },
            },
          });
          bc.close();
        } else {
          rtToast("Update failed — check connection", "error");
        }
      }

      // ── ORDER MODAL ───────────────────────────────────────────────
      function openOrderModal(id) {
        const o = _orders.find((x) => String(x.id) === String(id));
        if (!o) return;
        document.getElementById("om-title").textContent =
          `${o.type || "Incident"} — ${o.barangay || "Unknown"}`;
        const sev = (o.severity || "low").toLowerCase();
        const SEV_COL = {
          critical: "var(--red)",
          high: "var(--orange)",
          moderate: "var(--amber)",
          low: "var(--green)",
        };
        document.getElementById("om-body").innerHTML = `
    <table style="width:100%;font-size:.8rem;border-collapse:collapse;margin-bottom:14px">
      ${[
        ["Report ID", o.id || "—"],
        ["Barangay", o.barangay || "—"],
        ["Type", o.type || o.report_type || "—"],
        [
          "Severity",
          `<span style="font-weight:700;color:${SEV_COL[sev]}">${sev.toUpperCase()}</span>`,
        ],
        ["Status", o.status || "—"],
        ["Submitted", rtFmtDate(o.created_at)],
        o.latitude
          ? [
              "GPS",
              `${parseFloat(o.latitude).toFixed(5)}, ${parseFloat(o.longitude).toFixed(5)}`,
            ]
          : null,
      ]
        .filter(Boolean)
        .map(
          ([k, v]) => `
        <tr>
          <td style="color:var(--text-3);padding:5px 0;white-space:nowrap;width:90px">${k}</td>
          <td style="color:var(--text-1);padding:5px 0">${v}</td>
        </tr>`,
        )
        .join("")}
    </table>
    <div style="background:var(--surface-2);border-radius:10px;padding:12px;font-size:.78rem;color:var(--text-2);line-height:1.6;margin-bottom:16px">
      ${rtEsc(o.description || o.details || "No description.")}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="oc-btn btn-enroute"  style="padding:12px" onclick="updateOrderStatus('${o.id}','enroute');closeOrderModal()">
        <i class="fa-solid fa-truck-fast"></i> En Route
      </button>
      <button class="oc-btn btn-resolve"  style="padding:12px" onclick="updateOrderStatus('${o.id}','resolved');closeOrderModal()">
        <i class="fa-solid fa-circle-check"></i> Resolved
      </button>
    </div>`;
        document.getElementById("order-modal").classList.add("open");
      }
      function closeOrderModal() {
        document.getElementById("order-modal").classList.remove("open");
      }
      document
        .getElementById("order-modal")
        .addEventListener("click", function (e) {
          if (e.target === this) closeOrderModal();
        });

      // ── SUBMIT REPORT ─────────────────────────────────────────────
      async function submitReport() {
        const barangay = document.getElementById("rf-barangay").value;
        const type = document.getElementById("rf-type").value;
        const sev = document.getElementById("rf-sev").value;
        const desc = document.getElementById("rf-desc").value.trim();
        const lat = document.getElementById("rf-lat").value;
        const lng = document.getElementById("rf-lng").value;
        const linked = document.getElementById("rf-linked").value.trim();

        if (!barangay || !type || !sev || !desc) {
          rtToast("Please fill in all required fields", "error");
          return;
        }

        const btn = document.getElementById("submit-btn");
        btn.disabled = true;
        btn.innerHTML =
          '<div class="spinner" style="width:16px;height:16px;margin:0"></div> Submitting…';

        // Build FormData to support photo
        const fd = new FormData();
        fd.append("barangay", barangay);
        fd.append("report_type", type);
        fd.append("severity", sev);
        fd.append("description", desc);
        fd.append("submitted_by", "response_team");
        fd.append(
          "team_member",
          sessionStorage.getItem("admin_name") || "Response Team",
        );
        if (lat) fd.append("latitude", lat);
        if (lng) fd.append("longitude", lng);
        if (linked) fd.append("linked_report_id", linked);
        const photo = document.getElementById("rf-photo").files[0];
        if (photo) fd.append("image", photo);

        try {
          const r = await fetch(`${RT_API}/api/reports/`, {
            method: "POST",
            headers: {
              Authorization:
                "Bearer " + (sessionStorage.getItem("token") || ""),
            },
            body: fd,
          });
          if (!r.ok) throw new Error(r.status);
          const data = await r.json();
          rtToast("Report submitted successfully!", "success");

          // Broadcast to admin map
          const newReport = {
            id: data.id || data.report_id || `rt_${Date.now()}`,
            barangay,
            type,
            severity: sev,
            description: desc,
            latitude: lat || null,
            longitude: lng || null,
            status: "Pending",
            created_at: new Date().toISOString(),
          };
          window.parent?.postMessage(
            { type: "NEW_REPORT", report: newReport },
            "*",
          );
          const bc = new BroadcastChannel("dres_notif");
          bc.postMessage({
            type: "NOTIF_NEW",
            notif: {
              id: `rpt_${newReport.id}`,
              type: "report",
              title: `New Field Report — ${barangay}`,
              body: `${type} (${sev.toUpperCase()}) reported by response team`,
              time: new Date().toISOString(),
              role: "admin",
              meta: { page: "reports", reportId: String(newReport.id) },
            },
          });
          bc.close();

          // Also store for residents
          bc.postMessage?.({
            type: "NOTIF_NEW",
            notif: {
              id: `res_${newReport.id}`,
              type: "update",
              title: `Response Team Deployed`,
              body: `A response team has been dispatched to ${barangay} for ${type}`,
              time: new Date().toISOString(),
              role: "resident",
              meta: {},
            },
          });

          // Reset form
          document.getElementById("rf-barangay").value = "";
          document.getElementById("rf-type").value = "";
          document
            .querySelectorAll(".sev-opt")
            .forEach((o) => o.classList.remove("active"));
          document.getElementById("rf-sev").value = "";
          document.getElementById("rf-desc").value = "";
          document.getElementById("rf-lat").value = "";
          document.getElementById("rf-lng").value = "";
          document.getElementById("rf-linked").value = "";
          document.getElementById("rf-photo").value = "";
          document.getElementById("photo-preview").style.display = "none";
          document.getElementById("photo-label").innerHTML =
            '<i class="fa-solid fa-camera"></i><span>Tap to take or choose photo</span>';
          _selectedSev = "";
          rtSwitchPage("home", document.getElementById("bn-home"));
          setTimeout(loadOrders, 500);
        } catch (e) {
          rtToast("Submission failed — check connection", "error");
          console.error("[RT] submit:", e);
        } finally {
          btn.disabled = false;
          btn.innerHTML =
            '<i class="fa-solid fa-paper-plane"></i> Submit Field Report';
        }
      }

      // ── LOAD HISTORY ──────────────────────────────────────────────
      async function loadHistory() {
        const wrap = document.getElementById("history-list");
        wrap.innerHTML = `<div class="loading"><div class="spinner"></div><br>Loading…</div>`;
        const res = await rtFetch(
          "/api/reports/?submitted_by=response_team&limit=50",
        );
        const list = Array.isArray(res) ? res : res?.data || [];
        if (!list.length) {
          wrap.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-3);font-size:.78rem">No reports submitted yet.</div>`;
          return;
        }
        const SEV_COL = {
          critical: "var(--red)",
          high: "var(--orange)",
          moderate: "var(--amber)",
          low: "var(--green)",
          minor: "var(--green)",
        };
        const STATUS_CLASS = {
          pending: "rgba(245,158,11,.15)",
          reviewed: "rgba(59,130,246,.15)",
          resolved: "rgba(34,197,94,.15)",
        };
        wrap.innerHTML = list
          .map((r) => {
            const sev = (r.severity || "low").toLowerCase();
            const status = (r.status || "pending").toLowerCase();
            return `
      <div class="hist-item">
        <div class="hi-icon" style="background:${SEV_COL[sev]}22;color:${SEV_COL[sev]}">
          <i class="fa-solid fa-location-dot"></i>
        </div>
        <div class="hi-body">
          <div class="hi-title">${rtEsc(r.barangay || r.barangay_name || "Unknown")} — ${rtEsc(r.type || r.report_type || "Report")}</div>
          <div class="hi-sub" style="display:flex;gap:6px;align-items:center;margin-top:3px">
            <span style="font-size:.65rem;font-weight:700;color:${SEV_COL[sev]}">${sev.toUpperCase()}</span>
            <span style="background:${STATUS_CLASS[status]};padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600">
              ${status}
            </span>
          </div>
          <div class="hi-time">${rtFmtDate(r.created_at)}</div>
        </div>
      </div>`;
          })
          .join("");
      }

      // ── INIT ──────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        // Load identity
        const name = sessionStorage.getItem("admin_name") || "Responder";
        const initials = name
          .split(" ")
          .map((w) => w[0] || "")
          .join("")
          .toUpperCase()
          .slice(0, 2);
        document.getElementById("team-name").textContent = name;
        document.getElementById("team-avatar").textContent = initials;
        document.getElementById("team-unit").textContent =
          sessionStorage.getItem("team_unit") || "Field Unit";

        // Init notifications (injected into topbar-right)
        if (window.DRES_NOTIF) {
          window.DRES_NOTIF.init("topbar-right", (notif) => {
            const badge = document.getElementById("bn-badge-notif");
            const count = window.DRES_NOTIF.getUnread().length;
            badge.textContent = count;
            badge.style.display = count > 0 ? "flex" : "none";
          });
        }

        loadOrders();
        setInterval(loadOrders, 20000);
      });
