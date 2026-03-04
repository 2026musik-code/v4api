# Cloudflare Workers API Gateway + R2 (`dataapi`)

Gateway system berbasis **Hono.js** + **Cloudflare Workers** dengan penyimpanan konfigurasi di **R2 bucket `dataapi`**.

## Fitur

- `GET /api/gateway/:key` untuk high-speed proxy ke `target_url` yang tersimpan di R2.
- Query string user diteruskan ke API tujuan.
- Dashboard mewah di `/admin` (dark mode, glassmorphism, neon cyan/violet).
- Management API gateway: list, tambah, edit, hapus.
- Data disimpan sebagai object JSON per key (`<key>.json`) via `R2.put()`.
- Search/filter key dan tombol copy link gateway.
- Halaman 404 custom jika key tidak ditemukan.

## Struktur Object R2

Setiap key disimpan sebagai JSON:

```json
{
  "key": "gk_premium",
  "target_url": "https://api.example.com/endpoint",
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z"
}
```

Nama object mengikuti format: `gk_premium.json`.

## Deploy

1. Install dependency:
   ```bash
   npm install
   ```
2. Login Wrangler:
   ```bash
   npx wrangler login
   ```
3. Pastikan bucket R2 `dataapi` sudah ada pada akun Cloudflare.
4. Deploy worker:
   ```bash
   npm run deploy
   ```

## Optional Security

Tambahkan secret admin token agar endpoint `/api/admin/*` tidak terbuka:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Kemudian kirim header `x-admin-token` atau `Authorization: Bearer <token>` ke API admin.
