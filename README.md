# Shinobu Web — Landing + Admin Dashboard

Website topup saldo QRIS buat bot WhatsApp **Shinobu MD**, terhubung ke payment
gateway **DigitalPedia**. Ada dua halaman:

- `/` — landing page publik: info bot + form top up (bikin QRIS, cek status otomatis)
- `/admin.html` — dashboard admin (login password): statistik + riwayat semua order

## 1. Install

```bash
npm install
```

## 2. Konfigurasi

Copy `.env.example` jadi `.env`, lalu isi:

```bash
cp .env.example .env
```

| Variabel | Keterangan |
|---|---|
| `DP_API_KEY` | API key dari dashboard [pay.digitalpedia.web.id](https://pay.digitalpedia.web.id) |
| `ADMIN_PASSWORD` | Password buat login ke `/admin.html` — **wajib diganti**, jangan pakai default |
| `SESSION_SECRET` | String acak panjang buat sign session admin. Generate: `openssl rand -hex 32` |
| `STORE_NAME`, `STORE_TAGLINE` | Ditampilkan di landing page |
| `WA_CHANNEL_LINK`, `WA_GROUP_LINK` | Link channel/grup WA bot lu |

## 3. Jalanin

```bash
npm start
```

Buka `http://localhost:3000` (landing) dan `http://localhost:3000/admin.html` (admin).

## Struktur

```
server.js              → Express app + semua route API
lib/digitalpedia.js     → wrapper API DigitalPedia (create/status/cancel deposit)
lib/db.js               → penyimpanan order (file JSON di data/orders.json)
public/index.html       → landing page + widget topup
public/admin.html       → dashboard admin
public/js/app.js        → logic landing (create deposit, polling status, cancel)
public/js/admin.js      → logic admin (login, stats, tabel order)
public/css/style.css    → styling (tema wisteria/ungu, nyambung nama "Shinobu")
```

## Cara kerja topup

1. User isi nominal → frontend POST ke `/api/deposit/create` (server yang manggil
   DigitalPedia, API key aman di backend, ga pernah kekirim ke browser).
2. QR ditampilin, frontend polling `/api/deposit/status/:id` tiap 5 detik.
3. Server yang jaga cooldown 30 detik ke gateway (sesuai limit di dokumentasi
   DigitalPedia) — jadi biarpun frontend polling sering, gateway ga di-spam.
4. Begitu status `success`, tampilan otomatis update. Order kesimpen otomatis di
   `data/orders.json` dan langsung muncul di dashboard admin.

## Menghubungkan ke bot WhatsApp (Shinobu MD)

Website ini berdiri sendiri (server Node terpisah dari proses bot Baileys).
Cara paling gampang buat "nyambungin" saldo hasil topup ke saldo di bot:

- **Opsi simpel:** bikin plugin di bot yang baca file `data/orders.json` milik
  website ini (kalau bot & website jalan di server yang sama), lalu tambahin
  saldo user di database bot begitu ada order baru berstatus `success` yang
  belum diproses (tandai pakai field tambahan misal `creditedToBot: true`).
- **Opsi lebih rapi:** tambahin endpoint baru di `server.js`, misal
  `POST /api/internal/consume-success-orders`, yang dipanggil bot secara
  berkala (pakai secret key khusus, bukan `DP_API_KEY`) buat ambil daftar order
  sukses yang belum "dikreditkan", lalu bot yang update saldo user di database-nya
  sendiri dan konfirmasi balik.

Ini sengaja dipisah (bukan langsung ditulis ke DB bot dari sini) karena struktur
database internal Shinobu MD bisa beda-beda tergantung konfigurasi tiap
instalasi — jadi bagian "kreditkan saldo ke user" tetap tanggung jawab kode bot.

## Catatan keamanan

- Jangan commit `.env` ke git (`.gitignore` udah nge-exclude).
- Ganti `ADMIN_PASSWORD` & `SESSION_SECRET` dari default sebelum deploy.
- Kalau deploy ke publik, pasang HTTPS (lewat reverse proxy nginx/Caddy atau
  platform yang udah nyediain otomatis).
