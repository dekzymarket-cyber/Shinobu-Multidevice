// public/js/app.js
const $ = (sel) => document.querySelector(sel);

let currentDepositId = null;
let pollTimer = null;

// ── Load store config (nama, tagline, link WA) ──────────────
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    if (cfg.storeName) {
      $("#brandName").textContent = cfg.storeName;
      document.title = `${cfg.storeName} — Bot WhatsApp All-in-One`;
    }
    if (cfg.tagline) $("#tagline").textContent = cfg.tagline;
    if (cfg.waChannel) $("#waChannelLink").href = cfg.waChannel;
    if (cfg.waGroup) $("#waGroupLink").href = cfg.waGroup;
  })
  .catch(() => {});

function formatRupiah(n) {
  return "Rp" + Number(n).toLocaleString("id-ID");
}

function showError(msg) {
  const el = $("#formError");
  el.textContent = msg;
  el.style.display = "block";
}
function clearError() {
  $("#formError").style.display = "none";
}

// Quick amount buttons
document.querySelectorAll(".quick-amount").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("#amount").value = btn.dataset.amt;
  });
});

// ── Create deposit ───────────────────────────────────────────
$("#createBtn").addEventListener("click", async () => {
  clearError();
  const amount = Number($("#amount").value);

  if (!Number.isInteger(amount) || amount < 500 || amount > 1000000) {
    showError("Nominal harus antara Rp500 - Rp1.000.000");
    return;
  }

  $("#createBtn").disabled = true;
  $("#createBtn").textContent = "Membuat...";

  try {
    const res = await fetch("/api/deposit/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();

    if (!data.success) {
      showError(data.error || "Gagal membuat deposit");
      return;
    }

    currentDepositId = data.deposit.depositId;
    $("#qrImage").src = data.deposit.qrImage;
    $("#qrAmount").textContent = formatRupiah(data.deposit.totalPayment);
    $("#qrId").textContent = data.deposit.depositId;
    setStatusPill("pending");

    $("#formStep").style.display = "none";
    $("#qrStep").style.display = "block";
    $("#newBtn").style.display = "none";
    $("#cancelBtn").style.display = "inline-flex";

    startPolling();
  } catch (err) {
    showError("Gagal menghubungi server. Coba lagi.");
  } finally {
    $("#createBtn").disabled = false;
    $("#createBtn").textContent = "Buat QRIS";
  }
});

function setStatusPill(status) {
  const pill = $("#statusPill");
  pill.className = `status-pill status-${status}`;
  const map = {
    pending: "⏳ Menunggu pembayaran",
    success: "✅ Pembayaran diterima",
    expired: "⌛ Kadaluarsa",
    cancelled: "✕ Dibatalkan",
  };
  pill.textContent = map[status] || status;
}

// ── Poll status (backend yang atur cooldown 30 detik) ────────
function startPolling() {
  stopPolling();
  pollTimer = setInterval(checkStatus, 5000);
  checkStatus();
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function checkStatus() {
  if (!currentDepositId) return;
  try {
    const res = await fetch(`/api/deposit/status/${currentDepositId}`);
    const data = await res.json();
    if (!data.success) return;

    setStatusPill(data.status);

    if (["success", "expired", "cancelled"].includes(data.status)) {
      stopPolling();
      $("#cancelBtn").style.display = "none";
      $("#newBtn").style.display = "inline-flex";
    }
  } catch {
    // diem aja, coba lagi di interval berikutnya
  }
}

// ── Cancel ────────────────────────────────────────────────────
$("#cancelBtn").addEventListener("click", async () => {
  if (!currentDepositId) return;
  $("#cancelBtn").disabled = true;
  try {
    const res = await fetch("/api/deposit/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deposit_id: currentDepositId }),
    });
    const data = await res.json();
    if (data.success) {
      setStatusPill("cancelled");
      stopPolling();
      $("#cancelBtn").style.display = "none";
      $("#newBtn").style.display = "inline-flex";
    }
  } finally {
    $("#cancelBtn").disabled = false;
  }
});

// ── Reset ke form ─────────────────────────────────────────────
$("#newBtn").addEventListener("click", () => {
  currentDepositId = null;
  stopPolling();
  $("#amount").value = "";
  $("#qrStep").style.display = "none";
  $("#formStep").style.display = "block";
});
      
