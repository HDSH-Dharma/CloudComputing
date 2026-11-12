# Contributing

1. Branch from `main`: `feat/<area>-<short-name>`, `fix/...`, `chore/...`.
2. Open a PR; CI must pass (typecheck, tests, Deno check, migration replay, secret scan) and one teammate must approve.
3. Never commit secrets. `.env` files are git-ignored; use `.env.example` to document new variables.
4. Database changes = a **new** migration: `supabase migration new <name>`. Never edit a migration that is already on `main`.
   Every new table needs `enable row level security` + policies in the same migration.
5. Changing `supabase/functions/_shared/contracts.ts` changes the shared interface — mention it in the PR and ping the team.
6. Commit messages: imperative mood, e.g. `Add spool discrepancy view`.
