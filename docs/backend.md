# Backend reference

Everything a teammate needs to read/write data. Names are exported as constants from
`@filamentiq/shared` (`TABLES`, `VIEWS`, `RPC`, `BUCKETS`, `EDGE_FUNCTIONS`, `storagePaths`).

## Tables

| Table | Written by | Notes |
|---|---|---|
| `profiles` | trigger on sign-up; user (display name, currency, electricity tariff, timezone) | Telegram fields only via RPCs |
| `printers` | user | `api_type`: octoprint / moonraker / bambu; `power_watts` used for energy cost |
| `printer_credentials` | user via `set_printer_credentials` RPC | **never readable by the browser**; worker reads with service role |
| `spools` | user | `remaining_weight_g` is maintained by weigh-ins; `price_per_gram` is generated |
| `spool_weighins` | `record_weighin` / `finish_print_job` RPCs | append-only ledger, stores gross + tare + net |
| `gcode_files` | `gcode-parse` Edge Function | parsed metadata + `metadata` jsonb with per-field source |
| `print_jobs` | user | estimates auto-copied from the G-code file; `discrepancy_g/pct` generated |
| `telemetry` | worker (service role) | read-only for users |
| `snapshots` | worker (service role) | file in bucket `snapshots`; `diff_score`/`ssim` from the Smart Trigger |
| `monitoring_events` | worker (service role) | Gemini Vision result; users may only set `acknowledged_at` |
| `ai_chat_sessions`, `ai_chat_messages` | `assistant-chat` Edge Function | chat history for the UI |

## Views (use these for the dashboard and charts)

| View | Use |
|---|---|
| `v_print_job_costs` | per job: `used_g` (measured, else estimate), `is_measured`, `is_waste`, `material_cost`, `energy_kwh`, `energy_cost`, `total_cost` |
| `v_spool_inventory` | per spool: `remaining_pct`, `remaining_value`, `jobs_count`, `avg_discrepancy_pct`, `last_weighed_at` |
| `v_daily_spend` | per day (user timezone): jobs, `est_g`, `actual_g`, costs, `wasted_g` — Recharts spend/consumption charts |
| `v_project_spend` | per project: totals and `avg_cost_per_job` |

All views use `security_invoker`, so RLS applies.

## RPCs

```ts
// Post-print weight entry (gross = what the scale shows, spool included)
await supabase.rpc("finish_print_job", { p_job_id, p_gross_weight_after_g: 806.4 /*, p_status: "failed", p_gross_weight_before_g */ });
// Any manual scale reading
await supabase.rpc("record_weighin", { p_spool_id, p_gross_weight_g: 812.3, p_kind: "manual" });
// Printer API key (write-only)
await supabase.rpc("set_printer_credentials", { p_printer_id, p_api_key });
await supabase.rpc("printer_has_credentials", { p_printer_id });
// Telegram linking: show the code, user sends "/start CODE" to the bot
const { data: code } = await supabase.rpc("create_telegram_link_token");
await supabase.rpc("unlink_telegram");
// Bot only (service role):
await admin.rpc("consume_telegram_link_token", { p_token: "CODE", p_chat_id: 123456 });
```

## Storage

| Bucket | Path | Who writes |
|---|---|---|
| `gcode` | `{uid}/{uuid}.gcode` — `storagePaths.gcode(uid, id)` | browser (RLS checks the uid folder) |
| `snapshots` | `{uid}/{printerId}/{yyyy-mm-dd}/{epochMs}.jpg` — `storagePaths.snapshot(...)` | worker (service role); browser reads with signed URLs |

## Edge Functions

Call with `supabase.functions.invoke(name, { body })` (adds the user's JWT automatically).

### `gcode-parse`
1. Upload: `supabase.storage.from("gcode").upload(storagePaths.gcode(uid, crypto.randomUUID()), file)`
2. `invoke("gcode-parse", { body: { storagePath, originalFilename: file.name } })`
3. Response: the `gcode_files` row (`200` parsed, `422` stored with `parse_status = 'failed'` and `parse_error`).

Supabase Edge Functions have a CPU-time limit; very large files (tens of MB) may need to be parsed in the
browser instead — the same parser is exported as `@filamentiq/shared/gcode` (`parseGcodeStream(file.stream())`).

### `assistant-chat`
Request `{ sessionId?, message }` → response `{ sessionId, reply, toolCalls[], steps, stepLimitReached }`
(`AssistantChatResponseSchema`). History is in `ai_chat_messages`; `tool_calls` lets the UI show which data was used.

- Step limit: `ASSISTANT_MAX_STEPS` (default 6) model turns; after that the model must answer without tools.
- Result reuse: identical tool calls (same name + args, any key order) within 60 s reuse the result, scoped per user + session.
- Retries: 429/5xx/network errors from Gemini retried 3× with exponential backoff + jitter.
- Tool errors / invalid args are sent back to the model, not thrown. Rate limit: 10 questions/min/user.
- Tools (read-only, RLS-scoped): `get_spool_inventory`, `get_print_history`, `get_consumption_summary`,
  `get_estimate_accuracy`, `find_gcode_files`, `recommend_spool_for_job`, `estimate_print_cost`, `get_telemetry_summary`.

## Monitoring contract (for the worker)

```ts
import { MonitoringResultSchema, shouldAlert, TelemetrySampleSchema } from "@filamentiq/shared";
const result = MonitoringResultSchema.parse(JSON.parse(geminiText)); // { status: "normal" | "warning", confidence, reason }
if (shouldAlert(result)) { /* insert monitoring_events with alert_sent_at, send Telegram (warning only, never cancel) */ }
```

## Using `@filamentiq/shared` from Next.js

`next.config`: `transpilePackages: ["@filamentiq/shared"]`, `experimental: { externalDir: true }`;
`tsconfig`: `"allowImportingTsExtensions": true`. Add `"@filamentiq/shared": "workspace:*"` to `apps/web/package.json`.
