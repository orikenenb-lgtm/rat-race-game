-- NOT APPLIED — DRAFT, needs owner approval (production schema + a verify-result redeploy together with the site).
-- Worlds wave 0 (docs/full-upgrade/worlds/DESIGN.md §4.6 / §4.8, task I9): the database side of 12 worlds.
--   1. game.worlds — one row per world: ranked?, per-world value bounds (nw_max, passive_max, expenses_max), daily/weekly weight.
--   2. game.results money columns integer → bigint (w12's goal is ₪2 billion; integer stops at ±2,147,483,647).
--   3. game.challenges: the CHECK (world in w1..w4) becomes a foreign key to game.worlds (any released world can host a challenge).
--   4. public.rr_finish2 — like rr_finish, with bigint parameters and the world's own bounds (rr_finish stays for old clients: it keeps its
--      ±₪2B / ±₪100M limits, so an old client can never write a value the old columns could not hold).
--   5. game.day() / game.week() read the rotation from game.world_rotation (seeded with TODAY's exact rotation: w1 w2 w1 w3 w1 w4 w2 by
--      weekday, w1/w2 by week parity) — adding a world to the rotation becomes a row, not a code change.
--   6. rr_create_challenge2 checks game.world_ok(p_world) (ranked worlds) instead of the w1..w4 list. The other hard-coded lists live in
--      NOT-APPLIED drafts (groups v2 rr_create_challenge3, competitions, rooms settings): they should call game.world_ok when applied.
-- Interim until approved: w5+ are ranked = false (free play and private rooms only, stored locally); net.finish never sends them.
-- Validated offline by tests/worlds_db_draft.test.mjs (PGlite = PostgreSQL in WASM) against supabase/schema/production_baseline.sql.
-- ROLLBACK: at the bottom.

begin;

create table game.worlds (
  id text primary key check (id ~ '^w([1-9]|1[0-2])$'),
  ord smallint not null unique,
  ranked boolean not null default false,
  nw_max bigint not null check (nw_max between 1000000 and 1000000000000),            -- |net worth| a finish may report
  passive_max bigint not null check (passive_max between 10000 and 100000000000),     -- |passive| a finish may report
  expenses_max bigint not null check (expenses_max between 10000 and 100000000000),
  min_rules smallint not null default 3,
  released_at date
);
alter table game.worlds enable row level security;  -- deny-all like the other game tables; read through SECURITY DEFINER functions only

-- w1–w4 keep exactly today's limits (rr_finish: |NW| ≤ ₪2B, |passive| ≤ ₪100M, expenses ≤ ₪100M). New worlds: bounds from the design's
-- money scale × 10 headroom (bounds.nwMax in the world config must stay below nw_max — tools/validate-worlds.mjs).
insert into game.worlds (id, ord, ranked, nw_max, passive_max, expenses_max, min_rules, released_at) values
  ('w1', 1, true, 2000000000, 100000000, 100000000, 3, '2026-11-01'),
  ('w2', 2, true, 2000000000, 100000000, 100000000, 3, '2026-11-01'),
  ('w3', 3, true, 2000000000, 100000000, 100000000, 3, '2026-11-01'),
  ('w4', 4, true, 2000000000, 100000000, 100000000, 3, '2026-11-01'),
  ('w5', 5, false, 10000000000, 1000000000, 1000000000, 6, null),
  ('w6', 6, false, 10000000000, 1000000000, 1000000000, 6, null),
  ('w7', 7, false, 10000000000, 1000000000, 1000000000, 6, null),
  ('w8', 8, false, 20000000000, 1000000000, 1000000000, 6, null),
  ('w9', 9, false, 10000000000, 1000000000, 1000000000, 6, null),
  ('w10', 10, false, 10000000000, 1000000000, 1000000000, 7, null);  -- CATALOG-25 A1: market + portfolio, rules 7 (unranked until approved)

create table game.world_rotation (
  kind text not null check (kind in ('daily', 'weekly')),
  slot smallint not null check (slot between 0 and 6),          -- daily: day of week (0 = Sunday, as extract(dow)); weekly: ISO week % n
  world text not null references game.worlds(id),
  primary key (kind, slot)
);
alter table game.world_rotation enable row level security;
insert into game.world_rotation (kind, slot, world) values
  ('daily', 0, 'w1'), ('daily', 1, 'w2'), ('daily', 2, 'w1'), ('daily', 3, 'w3'), ('daily', 4, 'w1'), ('daily', 5, 'w4'), ('daily', 6, 'w2'),
  ('weekly', 0, 'w1'), ('weekly', 1, 'w2');

-- 2. money columns: bigint (exact for every value a JS double holds as an integer up to 9.007e15)
alter table game.results alter column net_worth type bigint, alter column passive type bigint, alter column expenses type bigint;

-- 3. challenges: any registered world (FK) instead of the w1..w4 CHECK
alter table game.challenges drop constraint challenges_world_check;
alter table game.challenges add constraint challenges_world_fkey foreign key (world) references game.worlds(id);

-- 4. rr_finish2: bigint values, the world's own bounds
create or replace function public.rr_finish2(p_id uuid, p_secret text, p_result uuid, p_status text, p_months integer, p_passive bigint, p_expenses bigint, p_net_worth bigint, p_stats jsonb)
 returns json language plpgsql security definer set search_path to ''
as $function$
declare v_r game.results; v_end timestamptz; v_w game.worlds;
begin
  perform game.auth(p_id, p_secret);
  select * into v_r from game.results where id = p_result and player_id = p_id for update;
  if not found then raise exception 'result_not_found'; end if;
  if v_r.status <> 'playing' then raise exception 'already_finished'; end if;
  if p_status not in ('won','lost') then raise exception 'bad_status'; end if;
  if p_months is null or p_months not between 1 and 200 then raise exception 'bad_months'; end if;
  select * into v_w from game.worlds where id = v_r.world;
  if not found or not v_w.ranked then raise exception 'bad_world'; end if;
  if p_passive is null or p_expenses is null or p_net_worth is null
     or abs(p_passive) > v_w.passive_max or p_expenses not between 0 and v_w.expenses_max or abs(p_net_worth) > v_w.nw_max then raise exception 'bad_values'; end if;
  if v_r.challenge_id is not null then
    select ends_at into v_end from game.challenges where id = v_r.challenge_id;
    if now() > v_end + interval '6 hours' then raise exception 'challenge_closed'; end if;
  end if;
  update game.results set status = p_status, months = p_months, passive = p_passive, expenses = p_expenses,
    net_worth = p_net_worth, stats = case when pg_column_size(p_stats) < 16000 then p_stats end, finished_at = now(),
    checkpoint = null
  where id = p_result;
  return json_build_object('ok', true);
end $function$;
revoke all on function public.rr_finish2(uuid, text, uuid, text, integer, bigint, bigint, bigint, jsonb) from public;
grant execute on function public.rr_finish2(uuid, text, uuid, text, integer, bigint, bigint, bigint, jsonb) to anon, authenticated;

-- 5. the rotation from the table (identical output while the table holds today's rotation)
create or replace function game.day()
 returns json language sql stable security definer set search_path to ''
as $function$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date as dt),
       k as (select dt, 'D' || to_char(dt, 'YYYY-MM-DD') as key from d),
       s as (select dt, key, abs(hashtext('ratrace-daily-' || key))::bigint as seed from k)
  select json_build_object('key', key, 'seed', seed, 'date', dt,
    'world', (select r.world from game.world_rotation r where r.kind = 'daily' and r.slot = extract(dow from dt)::int),
    'char_index', (seed % 3)::int,
    'max_months', 24,
    'ends_at', ((dt + 1)::timestamp) at time zone 'Asia/Jerusalem')
  from s
$function$;

create or replace function game.week()
 returns json language sql stable security definer set search_path to ''
as $function$
  with k as (select to_char(now() at time zone 'Asia/Jerusalem', 'IYYY-"W"IW') as key,
                    extract(week from now() at time zone 'Asia/Jerusalem')::int as wk),
       s as (select key, wk, abs(hashtext('ratrace-' || key))::bigint as seed from k),
       n as (select count(*)::int as n from game.world_rotation where kind = 'weekly')
  select json_build_object('key', key, 'seed', seed,
    'world', (select r.world from game.world_rotation r, n where r.kind = 'weekly' and r.slot = wk % n.n),
    'char_index', (seed % 3)::int,
    'profession', (array['teacher','driver','dev','doctor'])[1 + (seed % 4)::int],
    'ends_at', (date_trunc('week', now() at time zone 'Asia/Jerusalem') + interval '7 days') at time zone 'Asia/Jerusalem')
  from s, n
$function$;

-- 6. the baseline's challenge creation: any RANKED world from the table (was: p_world not in ('w1','w2','w3','w4'))
create or replace function game.world_ok(p_world text, p_ranked_only boolean default true)
 returns boolean language sql stable security definer set search_path to ''
as $function$ select exists(select 1 from game.worlds w where w.id = p_world and (w.ranked or not p_ranked_only)) $function$;

create or replace function public.rr_create_challenge2(p_id uuid, p_secret text, p_group uuid, p_title text, p_world text, p_char text, p_days integer)
 returns json language plpgsql security definer set search_path to ''
as $function$
declare v_c game.challenges; v_title text := btrim(p_title);
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  if v_title is null or char_length(v_title) not between 2 and 50 then raise exception 'bad_title'; end if;
  if not game.world_ok(p_world) then raise exception 'bad_world'; end if;
  if p_char is null or p_char !~ '^[a-z0-9_]{1,24}$' then raise exception 'bad_profession'; end if;
  if p_days is null or p_days not between 1 and 30 then raise exception 'bad_days'; end if;
  if (select count(*) from game.challenges where group_id = p_group and ends_at > now()) >= 5 then raise exception 'too_many_challenges'; end if;
  insert into game.challenges(group_id, title, profession, world, seed, ends_at, created_by)
  values (p_group, v_title, p_char, p_world, floor(random() * 2147483646)::bigint + 1, now() + make_interval(days => p_days), p_id)
  returning * into v_c;
  return json_build_object('id', v_c.id);
end $function$;

commit;

-- ROLLBACK (run only if the migration was applied and must be undone; the bigint → integer step fails if a stored value exceeds integer):
-- begin;
--   drop function if exists public.rr_finish2(uuid, text, uuid, text, integer, bigint, bigint, bigint, jsonb);
--   -- restore public.rr_create_challenge2 from supabase/schema/production_baseline.sql (it calls game.world_ok)
--   drop function if exists game.world_ok(text, boolean);
--   alter table game.challenges drop constraint challenges_world_fkey;
--   alter table game.challenges add constraint challenges_world_check CHECK ((world = ANY (ARRAY['w1'::text, 'w2'::text, 'w3'::text, 'w4'::text])));
--   alter table game.results alter column net_worth type integer, alter column passive type integer, alter column expenses type integer;
--   -- restore game.day() / game.week() from supabase/schema/production_baseline.sql
--   drop table game.world_rotation; drop table game.worlds;
-- commit;
