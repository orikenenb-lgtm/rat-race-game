# T6 server drafts — NOT APPLIED — AWAITING OWNER APPROVAL

Nothing in this folder has been applied to Supabase or deployed. These are review packages for the owner (spec
`docs/next-level/specs/T6-rivals-summary.md` §8.2–8.3, review M5). TASK_BOARD: no writes to Supabase in this wave.

| file | what | where it would go after approval |
|---|---|---|
| `t6_append_only.sql` | Ranked checkpoint log becomes append-only: 2 new tables (`game.t6_settings`, `game.checkpoint_audit`), 1 trigger function, 1 `BEFORE UPDATE OF checkpoint` trigger. Strictly additive: no `rr_*` signature or body change, no column change. Mode `log` → `enforce` → `off` (kill switch). | `supabase/migrations/<YYYYMMDD>_t6_append_only_checkpoint.sql` |
| `t6_append_only.test_out.txt` | Output of the 9 local cases (PostgreSQL 16 mock, research-t6): append, resend, branch at the stored end, diverged branch in `log` (audit row) and `enforce` (`diverged_checkpoint`), shorter log, missing `actions`. | evidence only |
| `verify-prefix-check.diff` | verify-result: `ck_actions` (the stored checkpoint's log) must be a prefix of the submitted final log, else `rewind:checkpoint_prefix` → `verified = false`. `verify_core.js` is not part of the engine pin (no re-pin). | `git apply`, then deploy the Edge Function |

## Rollout (only with the owner's explicit approval, step by step)
1. Apply the migration in `log` mode. Watch `game.checkpoint_audit` for one week; honest clients only append, so it should stay empty except for real multi-device divergence.
2. If clean: `update game.t6_settings set v = 'enforce' where k = 'append_only';`. The client already handles `diverged_checkpoint` (`js/net.js` text, `js/game.js` returns to the lobby; the next resume prefers the server state, V3).
3. Apply the verify diff, add its tests to `tests/verify.test.mjs` (prefix pass; diverged → `rewind:checkpoint_prefix`; missing `ck_actions` → pass; shorter final log → fail), deploy verify-result.
4. Kill switch: `update game.t6_settings set v = 'off' where k = 'append_only';` Rollback statements are at the end of the SQL file.

## Residual (not fixable client-side, spec §8.4)
Offline look-ahead in ranked: the seed plus the public engine allow simulating an open daily. Optional later: audit large log jumps for review, never auto-reject.

`tests/t6_client.test.mjs` asserts that both drafts still carry the `NOT APPLIED` header (AC-31) and that no file under `supabase/migrations/` contains the T6 trigger.
