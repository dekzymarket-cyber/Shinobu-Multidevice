// server.js
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import { createDeposit, checkDepositStatus, cancelDeposit } from "./lib/digitalpedia.js";
import { listOrders, getOrder, saveOrder, getStats } from "./lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-ganti-ini";
const COOLDOWN_MS = 30_000; // sama kayak cooldown gateway: 30 detik

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ── Helper: signed admin session token (biar ga perlu dependency session store) ──
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
function requireAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return res.status(401).json({ success: false, error: "Belum login" });
  }
  next();
}

// ── Public config buat frontend (aman ditampilkan) ──────────────
app.get("/api/config", (req, res) => {
  res.json({
    storeName: process.env.STORE_NAME || "Shinobu MD",
    tagline: process.env.STORE_TAGLINE || "",
    waChannel: process.env.WA_CHANNEL_LINK || "",
    waGroup: process.env.WA_GROUP_LINK || "",
  });
});

// ── Deposit: create ───────────────────────────────────────────
app.post("/api/deposit/create", async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isInteger(amount) || amount < 500 || amount > 1_000_000) {
      return res.status(400).json({ success: false, error: "Nominal harus antara Rp500 - Rp1.000.000" });
    }

    const { data } = await createDeposit(amount);
    if (!data.success) {
      return res.status(400).json({ success: false, error: data.error || "Gagal membuat deposit" });
    }

    const order = {
      depositId: data.deposit.id,
      amount: data.deposit.amount,
      fee: data.deposit.fee,
      totalPayment: data.deposit.total_payment,
      qrImage: data.deposit.qr_image,
      status: data.deposit.status,
      expiredAt: data.deposit.expired_at,
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
    };
    saveOrder(order);

    res.json({ success: true, deposit: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Deposit: status (dengan cooldown 30 detik, sinkron sama server pusat) ──
app.get("/api/deposit/status/:id", async (req, res) => {
  try {
    const depositId = req.params.id;
    const local = getOrder(depositId);
    if (!local) return res.status(404).json({ success: false, error: "Deposit tidak ditemukan" });

    // Kalau status udah final (success/expired/cancelled), ga perlu tanya lagi ke gateway
    if (["success", "expired", "cancelled"].includes(local.status)) {
      return res.json({ success: true, status: local.status, cached: true });
    }

    const now = Date.now();
    const last = local.lastCheckedAt ? new Date(local.lastCheckedAt).getTime() : 0;
    if (now - last < COOLDOWN_MS) {
      // Masih dalam cooldown — balikin status terakhir yang kita tau, jangan spam gateway
      return res.json({
        success: true,
        status: local.status,
        cached: true,
        retryAfterMs: COOLDOWN_MS - (now - last),
      });
    }

    const { data } = await checkDepositStatus(depositId);
    if (!data.success) {
      return res.status(400).json({ success: false, error: data.error || "Gagal cek status" });
    }

    saveOrder({ ...local, status: data.status, lastCheckedAt: new Date().toISOString() });
    res.json({ success: true, status: data.status, message: data.message, cached: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Deposit: cancel ────────────────────────────────────────────
app.post("/api/deposit/cancel", async (req, res) => {
  try {
    const { deposit_id } = req.body;
    const local = getOrder(deposit_id);
    if (!local) return res.status(404).json({ success: false, error: "Deposit tidak ditemukan" });

    const { data } = await cancelDeposit(deposit_id);
    if (!data.success) {
      return res.status(400).json({ success: false, error: data.error || "Gagal membatalkan" });
    }

    saveOrder({ ...local, status: "cancelled" });
    res.json({ success: true, message: data.message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: login / logout ───────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ success: false, error: "ADMIN_PASSWORD belum diset di .env" });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: "Password salah" });
  }
  const token = signToken({ role: "admin", exp: Date.now() + 1000 * 60 * 60 * 8 }); // 8 jam
  res.cookie("admin_session", token, { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 });
  res.json({ success: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin_session");
  res.json({ success: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ success: true }));

// ── Admin: data order + statistik ───────────────────────────────
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json({ success: true, orders: listOrders() });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  res.json({ success: true, stats: getStats() });
});

app.listen(PORT, () => {
  console.log(`✨ Shinobu Web jalan di http://localhost:${PORT}`);
  console.log(`   Admin dashboard: http://localhost:${PORT}/admin.html`);
});
