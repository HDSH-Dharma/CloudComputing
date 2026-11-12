# FilamentIQ

Cloud-based 3D print monitoring and filament management with AI sensor fusion (Cloud Computing, Group 6).

| Area | Owner | Where |
|---|---|---|
| Printer integration, monitoring worker, Gemini Vision, Telegram alerts | Maverick | `apps/worker` or `supabase/functions/monitor-*` (to be added) |
| Infrastructure, database, G-code parser, filament ledger, AI Material Assistant | Dharma | `supabase/`, `.github/`, `packages/shared`, `ecosystem.config.cjs` |
| Next.js frontend, dashboard, charts, chat UI | Flabianos | `apps/web` (to be added) |

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
- Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md)
