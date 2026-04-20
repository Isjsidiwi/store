# DigiStore — Toko Digital Key Otomatis

Platform toko digital dengan pembayaran QRIS otomatis, stok key, dan admin panel.

## Stack
- **Backend**: Express.js + EJS
- **Database**: Turso (libSQL)
- **Styling**: Tailwind CSS (CDN)
- **Payment**: QRIS via OrderKuota

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Buat database di Turso
```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Buat database
turso db create digitalstore

# Ambil URL & token
turso db show digitalstore --url
turso db tokens create digitalstore
```

### 3. Konfigurasi .env
```bash
cp .env.example .env
# Edit .env dengan nilai yang sesuai
```

Isi `.env`:
```env
TURSO_URL=libsql://digitalstore-xxxxx.turso.io
TURSO_AUTH_TOKEN=eyJhbGc...

PORT=3000
SESSION_SECRET=buat_random_string_panjang_di_sini

ADMIN_USERNAME=admin
ADMIN_PASSWORD=password_aman_kamu

STORE_NAME=NamaToko
STORE_TAGLINE=Tagline toko kamu

OK_AUTH_USERNAME=Shannz
OK_AUTH_TOKEN=2460961:XLEzPCV857MhmBrnQwFjdtkUvi10uslJ
OK_PHONE_UUID=eaAxVAUUR3mL01mAZA6OY-
OK_APP_REG_ID=eaAxVAUUR3mL01mAZA6OY-:APA91b...
OK_ACCOUNT_ID=2460961
```

### 4. Jalankan
```bash
# Development
npm run dev

# Production
npm start
```

Buka: http://localhost:3000  
Admin: http://localhost:3000/admin

---

## Cara Pakai

### Tambah Produk
1. Login ke `/admin`
2. Klik **Kelola Produk** → **Tambah Produk**
3. Isi nama, harga, logo URL, kategori, deskripsi

### Tambah Stock/Keys
1. Di halaman produk, klik **Keys**
2. Masukkan key satu per baris (lisensi, serial, akun, kode akses, dll.)
3. Setiap baris = 1 stok

### Alur Pembayaran
1. User pilih produk → isi nama & email → klik beli
2. Sistem buat QRIS dengan **nominal unik** (harga + 3 digit random)
   - Contoh: harga Rp 50.000 → bayar Rp 50.247
3. User scan QRIS, bayar dengan nominal **tepat**
4. Frontend polling `/api/order/:id/status` tiap 5 detik
5. Backend cek mutasi kredit di OrderKuota → cocokkan nominal unik
6. Jika cocok → key otomatis dikirim ke halaman order
7. Order kadaluarsa setelah 30 menit

---

## Struktur File
```
digitalstore/
├── server.js           # Entry point
├── db/index.js         # Turso connection + schema init
├── services/payment.js # QRIS create + payment verification
├── middleware/auth.js  # Admin session guard
├── routes/
│   ├── index.js        # Public routes (home, produk, checkout, order)
│   ├── admin.js        # Admin CRUD routes
│   └── api.js          # Polling endpoint
└── views/
    ├── partials/
    │   ├── header.ejs
    │   └── footer.ejs
    ├── index.ejs       # Halaman beranda
    ├── product.ejs     # Detail produk
    ├── checkout.ejs    # Form checkout
    ├── order.ejs       # Status order + QRIS + key display
    └── admin/
        ├── login.ejs
        ├── dashboard.ejs
        ├── products.ejs
        ├── product-edit.ejs
        ├── keys.ejs
        └── orders.ejs
```

## Deploy ke VPS/Railway/Render
Pastikan environment variables sudah diset di platform deploy kamu.
