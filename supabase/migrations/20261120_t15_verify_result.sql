-- T-15 (part A) — verification state for ranked results. STRICTLY ADDITIVE: six new nullable/defaulted columns, nothing else.
-- Status: NOT APPLIED — apply_migration needs an explicit approval in this session (auto-cancelled). Apply with:
--   Supabase MCP apply_migration(name: 't15_verify_result_columns', query: <this file>)   or   supabase db push
-- Until it is applied, the verify-result function runs in DRY-RUN mode (verifies and answers, stores nothing).
-- The Edge Function writes these columns over its own Postgres connection (SUPABASE_DB_URL); nothing new is exposed to anon.
alter table game.results add column if not exists verified boolean;              -- null = not checked · true = replay matched · false = rejected (flagged)
alter table game.results add column if not exists verify_error text;             -- why it was rejected: replay:… / claim_mismatch:…
alter table game.results add column if not exists actions_hash text;             -- sha256 of the submitted action log
alter table game.results add column if not exists verified_at timestamptz;
alter table game.results add column if not exists verify_attempts integer not null default 0;   -- ≤ 5 per result
alter table game.results add column if not exists verified_result jsonb;         -- server numbers, diff, engine hash, timing (audit)
