// public/js/admin.js
const $ = (sel) => document.querySelector(sel);
let allOrders = [];

function formatRupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// ── Cek sesi login saat pertama buka ────────────────────────
async function checkSession() {
  try {
    const res = await fetch("/api/admin/me");
    if (res.ok) {
      showDashboard();
      return;
    }
  } catch {}
  showLogin();
}

function showLogin() {
  $("#loginView").style.display = "flex";
  $("#dashView").style.display = "none";
}
function showDashboard() {
  $("#loginView").style.display = "none";
  $("#dashView").style.display = "block";
  loadStats();
  loadOrders();
}

// ── Login ─────────────────────────────────────────────────────
$("#loginBtn").addEventListener("click", async () => {
  const password = $("#password").value;
  const errEl = $("#loginError");
  errEl.style.display = "none";

  $("#loginBtn").disabled = true;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
      showDashboard();
    } else {
      errEl.textContent = data.error || "Login gagal";
      errEl.style.display = "block";
    }
  } catch {
    errEl.textContent = "Gagal menghubungi server";
    errEl.style.display = "block";
  } finally {
    $("#loginBtn").disabled = false;
  }
});
$("#password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#loginBtn").click();
});

// ── Logout ────────────────────────────────────────────────────
$("#logoutBtn").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  showLogin();
});

// ── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch("/api/admin/stats");
    const data = await res.json();
    if (!data.success) return;
    $("#statRevenue").textContent = formatRupiah(data.stats.totalRevenue);
    $("#statSuccess").textContent = data.stats.successCount;
    $("#statPending").textContent = data.stats.pendingCount;
    $("#statTotal").textContent = data.stats.totalOrders;
  } catch {}
}

// ── Orders table ─────────────────────────────────────────────
async function loadOrders() {
  try {
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    if (!data.success) return;
    allOrders = data.orders;
    renderOrders(allOrders);
  } catch {}
}

function renderOrders(orders) {
  const tbody = $("#ordersBody");
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">Belum ada order</td></tr>`;
    return;
  }
  tbody.innerHTML = orders
    .map(
      (o) => `
    <tr>
      <td class="mono">${o.depositId}</td>
      <td class="mono">${formatRupiah(o.totalPayment ?? o.amount)}</td>
      <td><span class="status-pill status-${o.status}">${o.status}</span></td>
      <td>${formatDate(o.createdAt)}</td>
      <td>${formatDate(o.lastCheckedAt)}</td>
    </tr>`
    )
    .join("");
}

$("#refreshBtn").addEventListener("click", () => {
  loadStats();
  loadOrders();
});

$("#searchInput").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return renderOrders(allOrders);
  renderOrders(allOrders.filter((o) => o.depositId.toLowerCase().includes(q)));
});

// Auto-refresh tiap 15 detik selama dashboard kebuka
setInterval(() => {
  if ($("#dashView").style.display !== "none") {
    loadStats();
    loadOrders();
  }
}, 15000);

checkSession();
      
