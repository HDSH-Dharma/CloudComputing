# Infrastructure runbook

Steps that need account access and cannot be done from the repo. Do them once, in order.

## 1. Supabase project
1. Create a project (region: Singapore `ap-southeast-1`). Save the DB password in a password manager.
2. Authentication → Providers → Email: enabled. URL configuration → Site URL `https://<your-domain>`, redirect `https://<your-domain>/auth/callback`.
3. Locally: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push --remote` (applies `supabase/migrations`, **not** the seed).
4. Secrets: `supabase secrets set --env-file supabase/functions/.env` (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, CORS_ORIGINS, GEMINI_MODEL).
5. `supabase functions deploy`.
6. Generate DB types when the schema changes: `pnpm db:types` (local) or `supabase gen types typescript --linked`.

## 2. Domainesia VPS (CloudPanel)
1. CloudPanel → Add Site → **Node.js** site, domain `<your-domain>`, Node 22, app port `3010` (3000 is taken on our VPS; must match `ecosystem.config.cjs`). This creates a site user and the Nginx reverse proxy.
2. SSL/TLS → Let's Encrypt certificate (after the domain's A record points to the VPS IP in Domainesia DNS).
3. **Dedicated SSH user for deploys** (do not use the site user for CI):
   CloudPanel → Sites → `<your-domain>` → **SSH/FTP** → **Add SSH User**, e.g. `cc-deploy`, with a generated password.
   Create the deploy key on your laptop and add the **public** key to that user (CloudPanel SSH Keys, or its `~/.ssh/authorized_keys`):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/filamentiq_deploy -N "" -C "github-actions-deploy"
   ssh -i ~/.ssh/filamentiq_deploy cc-deploy@<vps-ip>
   ```
   The **private** key (`~/.ssh/filamentiq_deploy`) goes only into the GitHub secret `VPS_SSH_KEY`.
4. As the deploy user, check Node is on PATH, then set up the app (PM2 runs under this user):
   ```bash
   node -v && npm -v          # if missing: install nvm + `nvm install 22` for this user
   git clone https://github.com/HDSH-Dharma/CloudComputing.git <app-dir>
   npm i -g pm2 && corepack enable
   nano ~/filamentiq.env      # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)
   chmod 600 ~/filamentiq.env
   cd <app-dir> && pnpm install --frozen-lockfile && pnpm build
   # only once apps/web exists:
   pm2 startOrReload ecosystem.config.cjs --env production && pm2 save && pm2 startup
   ```
   `<app-dir>` must be writable by the deploy user (e.g. inside its home, or the site's `htdocs/<your-domain>/app`); put the same path in `VPS_APP_DIR`.

## 3. GitHub
**Environment `production`** (Settings → Environments) with these secrets:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access tokens |
| `SUPABASE_DB_PASSWORD` | project DB password |
| `SUPABASE_PROJECT_REF` | project ref |
| `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN` | API keys (synced to Edge Function secrets on deploy) |
| `VPS_HOST` | VPS IP address (works before DNS is ready) |
| `VPS_USER` | the dedicated SSH user, e.g. `cc-deploy` (not the site user) |
| `VPS_PORT` | SSH port, usually `22` |
| `VPS_SSH_KEY` | private key `~/.ssh/filamentiq_deploy` |
| `VPS_APP_DIR` | absolute path of `<app-dir>` |

Variables: `CORS_ORIGINS` (e.g. `https://<your-domain>,http://localhost:3000`), optional `GEMINI_MODEL`.

**Branch protection** for `main` (Settings → Rules → Rulesets, or `gh` CLI):
- Require a pull request, 1 approval, dismiss stale approvals, require review from Code Owners
- Require status checks: `Typecheck, test, build`, `Deno check Edge Functions`, `Validate Supabase migrations`, `Secret scan`
- Block force pushes and deletions
- Settings → Code security: enable secret scanning + push protection, Dependabot alerts

```bash
gh api -X PUT repos/HDSH-Dharma/CloudComputing/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Typecheck, test, build", "Deno check Edge Functions", "Validate Supabase migrations", "Secret scan"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true, "require_code_owner_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Secrets hygiene
- Browser only ever gets the **anon** key. Service role key: monitoring worker / Telegram bot only.
- Gemini and Telegram keys live only in Supabase Edge Function secrets and GitHub `production` environment.
- If a key leaks: rotate it at the provider first, then update GitHub + `supabase secrets set`.
