# FilamentIQ

Cloud-based 3D print monitoring and filament management with AI sensor fusion (Cloud Computing, Group 6).

Team: Flabianos Jason Muljono (0706012410019), Hafizd Dharma Saputra Hardiono (0706012410023), Maverick Effenberg (0706012410062).

Live: https://cc.mav.my.id · New here? Start with [docs/onboarding.md](docs/onboarding.md).

## Team & responsibilities

The split follows the three parts of the system. Each person also owns one slice of the AI.

### Dharma: Infrastructure, database & backend logic
Owns the repo and the foundation everyone builds on. Lives in `supabase/`, `packages/shared/`, `.github/`, `ecosystem.config.cjs`, `docs/`.

- [x] GitHub repo: branch protection, PR rules, secret scanning, CI/CD (GitHub Actions)
- [x] Domainesia VPS: CloudPanel site `cc.mav.my.id`, Node 22, PM2, HTTPS, deploy user
- [x] Supabase: project, CLI, schema migrations, RLS policies, Auth, Storage buckets, Edge Function secrets
- [x] G-code upload and parser (filament length/weight, duration, temperatures, layer height): `gcode-parse`
- [x] Filament ledger: spool registration, weigh-ins, discrepancy vs estimate, cost views
- [x] AI Material Usage Assistant backend: Gemini function calling, DB tools, step limit, result reuse, retries: `assistant-chat`
- [ ] Phase 4: hardening, RLS audit, deployment fixes; help with chart queries if Flabianos is overloaded

### Maverick: Printer & monitoring pipeline
Owns the sensor-fusion core, since it depends on his physical printer. Lives in `apps/worker/`.

- [ ] Printer API integration (OctoPrint, Moonraker, or Bambu; start with one)
- [ ] Secure tunnel from the local printer network to the cloud (Cloudflare Tunnel or Tailscale)
- [ ] Polling worker: telemetry + snapshots into Supabase (tables `telemetry`, `snapshots`, bucket `snapshots`)
- [ ] Smart Trigger: pixel-difference / SSIM check that decides when to call Gemini
- [ ] Gemini Vision prompt (T-10 vs now + telemetry) validated with `MonitoringResultSchema`
- [ ] Telegram bot: account linking (`/start CODE`) and warning-only alerts
- [ ] Test data: sample G-code, recorded/induced failures, real spool weigh-ins
- [ ] Hardware setup for the final demo

### Flabianos: Frontend & UX
Owns everything the user sees. Lives in `apps/web/`.

- [x] Next.js app shell, Tailwind, auth pages, supabase-js integration
- [x] Pages: G-code upload, spool inventory, post-print weight entry, printer setup
- [x] Dashboard: job totals, remaining inventory, cost calculator
- [ ] Recharts: temperature telemetry, estimated vs actual consumption, spend per day/project
- [ ] Live monitoring view: latest snapshot, telemetry history, alert log
- [ ] Chat UI for the AI Material Assistant
- [ ] Telegram account linking UI

### Shared interfaces
Agreed contracts live in [`supabase/functions/_shared/contracts.ts`](supabase/functions/_shared/contracts.ts) (imported as `@filamentiq/shared`): table/view/RPC/bucket names, storage paths, the monitoring JSON (`status: normal | warning`, `confidence`, `reason`), G-code metadata, and API request/response schemas. Reference: [docs/backend.md](docs/backend.md). Changes to it are announced in the PR.

### Phases
| Phase | Maverick | Dharma | Flabianos |
|---|---|---|---|
| 1. Foundation | Printer API proof of concept, tunnel | ✅ Repo, CI/CD, VPS, schema, RLS, Auth | App shell, auth pages, mock data |
| 2. Core features | Polling worker, Smart Trigger | ✅ G-code parser, ledger logic | Upload, inventory, weight-entry pages |
| 3. AI & alerts | Gemini Vision, Telegram alerts | ✅ Function-calling assistant | Dashboard charts, monitoring view, chat UI |
| 4. Integration & demo | End-to-end failure tests, demo setup | Hardening, RLS audit, deployment fixes | Polish, responsive fixes, demo flow |

## Architecture

```
Browser (Next.js on Domainesia VPS, PM2) ──supabase-js──► Supabase Postgres (RLS) / Auth / Storage
        │                                                        ▲
        └── POST /functions/v1/gcode-parse ──────────────────────┤  (runs as the user, RLS applies)
        └── POST /functions/v1/assistant-chat ── Gemini ◄─tools──┘
Printer (OctoPrint/Moonraker/Bambu) ──tunnel──► monitoring worker ──service role──► telemetry / snapshots / monitoring_events
                                                        └── Gemini Vision (T-10 vs now) ──► Telegram (warning only)
```

## Repository layout

```
supabase/
  migrations/              schema, RLS + storage policies, ledger RPCs + reporting views
  seed.sql                 local demo data (demo@filamentiq.local / demo-password-123)
  functions/
    _shared/               code shared by every Edge Function (and re-exported to Node via @filamentiq/shared)
      contracts.ts         Zod schemas + table/bucket/RPC names — the team's shared interface
      gcode/parser.ts      streaming G-code metadata parser (Prusa, Orca, Bambu, Cura, raw)
      ledger.ts            filament math, cost, discrepancy, aggregation
      assistant/           Gemini function-calling loop, tools, retry, result cache
    gcode-parse/           Edge Function: parse an uploaded G-code file
    assistant-chat/        Edge Function: AI Material Usage Assistant
packages/shared/           `@filamentiq/shared` — import contracts/parser/ledger from Next.js or the worker
tests/                     vitest unit tests (parser, ledger, assistant loop)
docs/                      backend reference + infrastructure runbook
```

## Getting started

Requirements: Node 22, pnpm 9, Docker (for local Supabase), Supabase CLI, Deno 2 (optional, for `functions:check`).

```bash
pnpm install
pnpm test            # unit tests
pnpm typecheck
supabase start       # local Postgres/Auth/Storage/Edge runtime
supabase db reset    # apply migrations + seed
cp supabase/functions/.env.example supabase/functions/.env   # add GEMINI_API_KEY
pnpm functions:serve
```

- Backend reference for teammates (tables, RPCs, Edge Function contracts): [docs/backend.md](docs/backend.md)
- Infrastructure runbook (Supabase project, VPS/CloudPanel/PM2, GitHub secrets, branch protection): [docs/infrastructure.md](docs/infrastructure.md)
- Team onboarding (setup, PR flow, per-person guide): [docs/onboarding.md](docs/onboarding.md)
- Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md)
