-- T6 §8.2 — NOT APPLIED — AWAITING OWNER APPROVAL. Do not run apply_migration, psql or a deploy with this file.
-- Draft only (from research-t6, tested on a local PostgreSQL 16 mock: 9 cases). After approval it becomes
-- supabase/migrations/<YYYYMMDD>_t6_append_only_checkpoint.sql; rollout log (1 week, watch game.checkpoint_audit) → enforce.

-- T6 (PROPOSAL, NOT APPLIED) — ranked action log becomes append-only on the server. STRICTLY ADDITIVE:
-- 2 new tables, 1 new trigger function, 1 new trigger. No rr_* signature or body changes, no column changes.
-- Rollout: mode 'log' (observe only) → 'enforce' after a clean week → 'off' is the kill switch (no redeploy).
create table if not exists game.t6_settings (k text primary key, v text not null);
insert into game.t6_settings (k, v) values ('append_only', 'log') on conflict (k) do nothing;
create table if not exists game.checkpoint_audit (
  id bigserial primary key, result_id uuid not null, at timestamptz not null default now(),
  kind text not null, old_len int, new_len int, old_turn int, new_turn int);
revoke all on game.t6_settings, game.checkpoint_audit from public;

create or replace function game.tg_checkpoint_append_only() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o jsonb; n jsonb; ol int; nl int; m text; ok boolean;
begin
  if new.checkpoint is not distinct from old.checkpoint then return new; end if;
  select v into m from game.t6_settings where k = 'append_only';
  if m is null or m = 'off' then return new; end if;
  o := case when jsonb_typeof(old.checkpoint -> 'actions') = 'array' then old.checkpoint -> 'actions' end;
  if o is null or jsonb_array_length(o) = 0 then return new; end if;          -- first checkpoint / legacy state without a log
  ol := jsonb_array_length(o);
  n := case when jsonb_typeof(new.checkpoint -> 'actions') = 'array' then new.checkpoint -> 'actions' end;
  nl := coalesce(jsonb_array_length(n), -1);
  ok := nl >= ol and jsonb_path_query_array(n, ('$[0 to ' || (ol - 1) || ']')::jsonpath) = o;
  if ok then return new; end if;
  if m = 'enforce' then raise exception 'diverged_checkpoint'; end if;
  insert into game.checkpoint_audit (result_id, kind, old_len, new_len, old_turn, new_turn)
    values (new.id, 'diverged', ol, nl, old.checkpoint_turn, new.checkpoint_turn);
  return new;
end $$;

drop trigger if exists t6_checkpoint_append_only on game.results;
create trigger t6_checkpoint_append_only before update of checkpoint on game.results
  for each row execute function game.tg_checkpoint_append_only();
-- ROLLBACK: drop trigger t6_checkpoint_append_only on game.results; drop function game.tg_checkpoint_append_only();
--           drop table game.checkpoint_audit; drop table game.t6_settings;
-- SWITCH TO ENFORCE (separate statement, after one clean week of game.checkpoint_audit; owner approval again):
--   update game.t6_settings set v = 'enforce' where k = 'append_only';
-- KILL SWITCH (no redeploy): update game.t6_settings set v = 'off' where k = 'append_only';
