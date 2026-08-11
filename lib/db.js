// lib/db.js
// Penyimpanan sederhana berbasis file JSON — cukup buat skala kecil/menengah.
// Kalau traffic udah gede, tinggal ganti isi fungsi-fungsi ini ke query DB
// beneran (SQLite/Postgres) tanpa perlu ubah kode di server.js.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "..", "data", "orders.json");

function ensureFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify({ orders: [] }, null, 2));
  }
}

function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { orders: [] };
  }
}

function writeAll(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

export function listOrders() {
  return readAll().orders.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export function getOrder(depositId) {
  return readAll().orders.find((o) => o.depositId === depositId) || null;
}

export function saveOrder(order) {
  const data = readAll();
  const idx = data.orders.findIndex((o) => o.depositId === order.depositId);
  if (idx === -1) {
    data.orders.push(order);
  } else {
    data.orders[idx] = { ...data.orders[idx], ...order };
  }
  writeAll(data);
  return order;
}

export function getStats() {
  const orders = readAll().orders;
  const success = orders.filter((o) => o.status === "success");
  const pending = orders.filter((o) => o.status === "pending");
  const expired = orders.filter((o) => o.status === "expired");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  return {
    totalOrders: orders.length,
    totalRevenue: success.reduce((sum, o) => sum + (o.amount || 0), 0),
    successCount: success.length,
    pendingCount: pending.length,
    expiredCount: expired.length,
    cancelledCount: cancelled.length,
  };
      }
