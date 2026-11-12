# Onboarding tim FilamentIQ

Panduan mulai kerja untuk Maverick dan Flabianos. Fondasi (database, Edge Functions, CI/CD, VPS) sudah jalan di production. Kalian tinggal membangun bagian masing-masing di atasnya.

Baca juga: [backend.md](backend.md) untuk daftar tabel, view, RPC, dan Edge Function yang bisa dipakai.

---

## 1. Setup awal (semua)

Yang dibutuhkan: Node 22, pnpm 9 (`corepack enable`), Git, VS Code.

```bash
git clone https://github.com/HDSH-Dharma/CloudComputing.git
cd CloudComputing
pnpm install
pnpm test        # harus lolos semua
```

Project Supabase sudah ada di production (`yduxqxrmfeimhygpmxsw`, region Singapore). Minta Dharma mengundang email kalian ke organisasi Supabase kalau perlu melihat dashboard.

## 2. Aturan kerja di repo

`main` diproteksi: **tidak bisa push langsung** dan **tidak bisa force push**.

1. Buat branch dari `main` terbaru: `feat/web-dashboard`, `feat/worker-octoprint`, `fix/...`
2. Commit, lalu push branch-nya: `git push -u origin feat/web-dashboard`
3. Buka Pull Request ke `main` di GitHub.
4. Tunggu 4 check CI hijau: `Typecheck, test, build`, `Deno check Edge Functions`, `Validate Supabase migrations`, `Secret scan`.
5. Merge. **Setiap merge ke `main` otomatis deploy** ke Supabase dan VPS (`https://cc.mav.my.id`).

Aturan lain:
- **Jangan commit secret** (`.env`, service role key, token bot, API key). File `.env*` sudah di-ignore, kecuali `.env.example`. CI juga menjalankan secret scan.
- **Kalau menambah dependency**, commit juga `pnpm-lock.yaml`. CI memakai `--frozen-lockfile`, jadi lockfile yang tidak sinkron akan gagal.
- **Perlu tabel atau kolom baru?** Bilang ke Dharma, atau buat migrasi baru (`supabase migration new <nama>`). Jangan mengedit migrasi yang sudah ada di `main`. Setiap tabel baru wajib RLS + policy di migrasi yang sama.
- **Mengubah `supabase/functions/_shared/contracts.ts`** berarti mengubah kontrak bersama. Sebutkan di PR dan kabari tim.

## 3. Kontrak bersama (`@filamentiq/shared`)

Semua nama tabel, bucket, RPC, dan skema Zod ada di satu tempat:

```ts
import {
  TABLES, VIEWS, RPC, BUCKETS, EDGE_FUNCTIONS, storagePaths,
  MonitoringResultSchema, shouldAlert, TelemetrySampleSchema,
  SpoolInputSchema, FinishPrintJobInputSchema, AssistantChatResponseSchema,
} from "@filamentiq/shared";
import { parseGcodeStream } from "@filamentiq/shared/gcode";
import { computeCost, filamentMmToGrams } from "@filamentiq/shared/ledger";
```

Tambahkan ke `package.json` app kalian: `"@filamentiq/shared": "workspace:*"`.

---

## 4. Flabianos: Frontend & UX (`apps/web`)

### 4.1 Membuat app

```bash
pnpm create next-app@15 apps/web --ts --tailwind --app --eslint --src-dir --use-pnpm --no-turbopack
cd apps/web
pnpm add @supabase/supabase-js @supabase/ssr recharts zod@3.24.1 "@filamentiq/shared@workspace:*"
```

Pastikan `apps/web/package.json` punya `"name": "web"` dan script `"build": "next build"`.

`apps/web/next.config.ts`:
```ts
const nextConfig = {
  transpilePackages: ["@filamentiq/shared"],
  experimental: { externalDir: true },
};
export default nextConfig;
```

`apps/web/tsconfig.json`: tambahkan `"allowImportingTsExtensions": true` di `compilerOptions`.

`apps/web/.env.local` (tidak di-commit):
```
NEXT_PUBLIC_SUPABASE_URL=https://yduxqxrmfeimhygpmxsw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<minta ke Dharma: anon key, aman untuk browser>
```

Jalankan: `pnpm --filter web dev`, lalu buka http://localhost:3000.

**Jangan pernah** memakai service role key di frontend. Cukup anon key + login user. RLS yang membatasi data per user.

### 4.2 Auth
- Pakai `@supabase/ssr` (server + browser client) dan halaman `/login`, `/signup`, serta `/auth/callback`.
- Redirect URL `http://localhost:3000/**` dan `https://cc.mav.my.id/**` sudah terdaftar di Supabase.
- Profil otomatis dibuat saat sign-up (tabel `profiles`).

### 4.3 Halaman & sumber datanya

| Halaman | Baca | Tulis |
|---|---|---|
| Upload G-code | `gcode_files` | 1) `storage.from("gcode").upload(storagePaths.gcode(user.id, crypto.randomUUID()), file)` 2) `functions.invoke("gcode-parse", { body: { storagePath, originalFilename } })` → mengembalikan baris `gcode_files` |
| Inventaris spool | `v_spool_inventory` | insert `spools` (validasi dengan `SpoolInputSchema`) |
| Mulai print / job | `print_jobs`, `gcode_files`, `spools`, `printers` | insert `print_jobs` (`name`, `project`, `spool_id`, `gcode_file_id`, `printer_id`, `status: "printing"`, `started_at`). Estimasi filamen terisi otomatis dari G-code |
| Input berat setelah print | `print_jobs` | `rpc("finish_print_job", { p_job_id, p_gross_weight_after_g, p_status })`. Berat **gross** = angka di timbangan (spool + filamen) |
| Setup printer | `printers` | insert `printers`, lalu `rpc("set_printer_credentials", { p_printer_id, p_api_key })`. API key tidak bisa dibaca balik. Status: `rpc("printer_has_credentials", ...)` |
| Dashboard | `v_print_job_costs`, `v_spool_inventory`, `v_daily_spend`, `v_project_spend` | – |
| Kalkulator biaya | `spools`, `printers`, `profiles` | – (pakai `computeCost` dari `@filamentiq/shared/ledger`) |
| Live monitoring | `telemetry` (terbaru per printer), `snapshots` (gambar via `storage.from("snapshots").createSignedUrl(path, 60)`), `monitoring_events` | update `monitoring_events.acknowledged_at` |
| Chat AI | `ai_chat_sessions`, `ai_chat_messages` | `functions.invoke("assistant-chat", { body: { sessionId?, message } })` → `{ sessionId, reply, toolCalls, steps, stepLimitReached }` |
| Link Telegram | `profiles.telegram_chat_id` | `rpc("create_telegram_link_token")` → tampilkan "kirim `/start KODE` ke @<bot>". Putus: `rpc("unlink_telegram")` |

Grafik Recharts:
- Suhu: `telemetry.nozzle_temp_c` / `bed_temp_c` (+ target) terhadap `captured_at`
- Estimasi vs aktual: `v_daily_spend.est_g` vs `actual_g`, atau per job dari `v_print_job_costs`
- Pengeluaran per hari / proyek: `v_daily_spend.total_cost`, `v_project_spend.total_cost`

### 4.4 Data untuk development
- Cara cepat: daftar akun di app lokal kalian (terhubung ke Supabase production), lalu isi data lewat UI atau Table Editor.
- Kalau punya Docker: `supabase start && supabase db reset` memberi database lokal berisi data demo (`demo@filamentiq.local` / `demo-password-123`), termasuk telemetry, event monitoring, dan job yang gagal.

### 4.5 Deploy
Begitu `apps/web` di-merge ke `main`, GitHub Actions otomatis menjalankan build di VPS dan PM2 menjalankan `next start -p 3010` di `https://cc.mav.my.id`. Kalian tidak perlu SSH.

---

## 5. Maverick: Printer & Monitoring (`apps/worker`)

### 5.1 Arsitektur yang disarankan
```
Printer (OctoPrint/Moonraker/Bambu) ──Tailscale / Cloudflare Tunnel──► worker (Node, PM2 di VPS)
worker ──service role──► Supabase: telemetry, snapshots (Storage + tabel), monitoring_events
worker ──► Gemini Vision (frame T-10 menit vs sekarang + telemetry) ──► Telegram (warning only)
```
- Buat `apps/worker` (TypeScript, Node 22) dengan `"build"` script yang menghasilkan `dist/index.js`. Entry PM2 sudah disiapkan (di-comment) di `ecosystem.config.cjs`.
- Mulai dari **satu** jenis printer yang kamu punya.
- `printers.base_url` = URL tunnel yang bisa dijangkau dari VPS.

### 5.2 Kredensial (hanya di server, tidak pernah di repo)
| Variabel | Untuk |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | worker menulis telemetry/snapshot/event (melewati RLS) |
| `GEMINI_API_KEY` | Gemini Vision |
| `TELEGRAM_BOT_TOKEN` | kirim alert. **Kirim juga ke Dharma** supaya masuk GitHub secrets |

Di VPS, variabel ini ditambahkan ke `~/filamentiq.env` milik user `cc-deploy` (koordinasi dengan Dharma). Untuk lokal, pakai `apps/worker/.env` (di-ignore).

### 5.3 Alur per siklus polling
1. Ambil printer aktif: `printers` where `is_active = true`. API key: `printer_credentials` (hanya bisa dibaca service role).
2. Cari job yang sedang jalan: `print_jobs` where `printer_id = ? and status = 'printing'`.
3. Normalisasi telemetry → validasi dengan `TelemetrySampleSchema` → insert `telemetry`. **Isi `owner_id` sendiri** (= `printers.owner_id`), karena service role tidak punya `auth.uid()`.
4. Ambil snapshot kamera → upload ke bucket `snapshots` di `storagePaths.snapshot(ownerId, printerId, capturedAt)` → insert `snapshots` (`diff_score`, `ssim`).
5. **Smart Trigger**: hanya kalau perbedaan visual melewati ambang, panggil Gemini.
6. Frame referensi T-10: `snapshots` where `printer_id = ?` and `captured_at <= now() - 10 min`, urut terbaru, ambil 1.
7. Validasi respons Gemini: `MonitoringResultSchema.parse(...)` → `{ status: "normal" | "warning", confidence, reason }`. Insert `monitoring_events` (`snapshot_id`, `reference_snapshot_id`, `model`, `telemetry`), set `snapshots.analyzed = true`.
8. Kalau `shouldAlert(result)` dan `profiles.telegram_chat_id` ada: kirim pesan Telegram, lalu set `monitoring_events.alert_sent_at`. **Hanya warning, jangan pernah membatalkan print.**

### 5.4 Bot Telegram
- `/start KODE` → `admin.rpc("consume_telegram_link_token", { p_token: KODE, p_chat_id: chat.id })`. Hasilnya `user_id` kalau berhasil, `null` kalau kode salah atau kedaluwarsa (15 menit).
- Kabari Flabianos username bot-nya untuk ditampilkan di halaman link Telegram.

### 5.5 Data uji
- Simpan G-code sampel kecil (header + beberapa baris) di `tests/fixtures/`. Jangan file ratusan MB.
- Catat penimbangan spool sungguhan (berat sebelum dan sesudah print) untuk demo selisih estimasi vs aktual.
- Rekam atau picu kegagalan (spaghetti, layer shift) untuk menguji prompt Gemini dan ambang Smart Trigger.

---

## 6. Butuh sesuatu dari Dharma?
- Tabel/kolom/RPC baru, perubahan RLS, atau secret baru di GitHub/Supabase/VPS
- Akses ke dashboard Supabase atau SSH ke VPS
- Query chart yang berat (Dharma bisa membuatkan view baru)
