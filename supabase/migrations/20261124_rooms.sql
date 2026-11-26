-- NOT APPLIED — needs owner approval.
-- Live rooms (BRIEF §21–§23, design O1 §3–§4): tables + the cheap lobby/poll RPCs rr_room_*. Engine work (start / act / tick) is the
-- Edge Function supabase/functions/room (not deployed), which locks game.rooms FOR UPDATE and writes through room_store.js.
-- Status: DRAFT, purely ADDITIVE (new tables, new functions; nothing existing changes). Requires 20261124_groups_v2.sql only for
-- group-private rooms (membership check uses game.group_members, which exists in the baseline already).
-- Validated offline by tests/sql_drafts.test.mjs (PGlite = PostgreSQL 18 in WASM): the same lobby scenarios as room_core.js, plus the
-- Edge write path (room_store.js) round-trip. Semantics are 1:1 with room_core.js join / setReady / leave / kick / cancel / heartbeat /
-- react / snapshot (the fake backend runs room_core for these).
-- Model: RLS on, NO policies, NO grants on tables (deny-all like the 7 existing game tables); only public.rr_room_* are executable.
-- The seed and the full engine state never leave the server through these RPCs: rr_room_state returns the caller's redacted view
-- (written by the Edge Function), opponents' public progress, and the seed only after the room ended.
-- Lifecycle without a cron (ONLINE_RELEASE.md S1/S2/S5/S6): stale lobbies are expired by game.room_sweep() at the start of
-- rr_room_create / rr_room_join / rr_my_rooms; the open-rooms cap counts lobbies + playing rooms active in the last 2 h; a playing room
-- left behind by an engine-pin change is closed by the Edge Function (pin_mismatch_at, room_core pinGate); polls write last_seen at most
-- every 15 s and take no lock otherwise; game.room_purge(days) deletes ended rooms (retention: owner-run, never scheduled here).
-- Verified on real PostgreSQL 17 + PostgREST + Deno too: tools/staging (local stack), tests/online_local.test.mjs.
-- ROLLBACK: at the bottom.

begin;

create table game.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references game.players(id) on delete cascade,
  group_id uuid references game.groups(id) on delete set null,
  competition_id uuid references game.challenges(id) on delete set null,      -- a "live competition" = a scheduled room (later)
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  end_reason text check (end_reason ~ '^[a-z_]{1,24}$'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) < 1024),
  rules smallint,
  engine_sha text check (engine_sha ~ '^[0-9a-f]{64}$'),
  seed bigint not null check (seed between 1 and 2147483646),                 -- NEVER returned while the room runs
  date_key text check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  round int not null default 0,
  round_started timestamptz,
  deadline timestamptz,
  version bigint not null default 1,
  needs_tick boolean not null default false,
  cancel_votes jsonb not null default '[]'::jsonb,
  kicked jsonb not null default '[]'::jsonb,
  signal_topic text not null check (signal_topic ~ '^[0-9a-f]{32}$'),        -- Realtime doorbell topic (phase 2)
  results jsonb,
  next_event bigint not null default 1,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_activity timestamptz not null default now(),
  pin_mismatch_at timestamptz                                                    -- S1: first seen by a server with another engine pin
);
create unique index rooms_code_open on game.rooms (code) where status in ('lobby', 'playing');
create index rooms_status_activity on game.rooms (status, last_activity);
create index rooms_host_created on game.rooms (host_id, created_at);
alter table game.rooms enable row level security;

create table game.room_seats (
  room_id uuid not null references game.rooms(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  player_id uuid not null references game.players(id) on delete cascade,
  status text not null default 'joined' check (status in ('joined', 'ready', 'playing', 'away', 'finished', 'forfeit', 'left')),
  char_id text check (char_id ~ '^[a-z0-9_]{1,24}$'),
  -- json, NOT jsonb: jsonb re-orders object keys, and the engine's results depend on key order (measured: 8 of 40 games diverge after a
  -- jsonb round trip — tests/sql_drafts.test.mjs checks E.replay(actions) === the stored text). json keeps the text byte for byte.
  state json check (state is null or octet_length(state::text) < 400000),      -- FULL engine state (rng inside): Edge Function only
  view json,                                                                     -- redacted state + server event: this seat only
  pub jsonb,                                                                     -- public progress (last closed round)
  pub_round int not null default 0,
  state_version bigint not null default 0,
  rolled_round int not null default 0,
  missed smallint not null default 0,
  acted_round int not null default 0,
  finished_round int,
  forfeit_round int,
  last_seen timestamptz not null default now(),
  conn_id text check (conn_id ~ '^[A-Za-z0-9:_-]{8,64}$'),
  conns jsonb not null default '{}'::jsonb,
  result jsonb,
  seq bigint not null default 0,
  last_react timestamptz,
  st_over boolean not null default false,                                       -- derived by the Edge Function (no jsonb reads when polling)
  st_phase text,
  st_pending boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, player_id)
);
create index room_seats_player on game.room_seats (player_id);
alter table game.room_seats enable row level security;

create table game.room_actions (
  room_id uuid not null,
  seat smallint not null,
  seq bigint not null,
  action_id text not null check (action_id ~ '^[A-Za-z0-9:_-]{8,64}$'),
  a jsonb not null check (jsonb_typeof(a) = 'array' and octet_length(a::text) < 256),
  by text not null check (by in ('player', 'timeout')),
  from_version bigint not null,
  response jsonb not null check (octet_length(response::text) < 32000),        -- stored for idempotent replays
  at timestamptz not null default now(),
  primary key (room_id, seat, seq),
  unique (room_id, seat, action_id),
  foreign key (room_id, seat) references game.room_seats (room_id, seat) on delete cascade
);
create index room_actions_rate on game.room_actions (room_id, seat, at);
alter table game.room_actions enable row level security;

create table game.room_events (
  room_id uuid not null references game.rooms(id) on delete cascade,
  seq bigint not null,
  round int,
  kind text not null check (kind ~ '^[a-z_]{1,24}$'),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) < 1024),
  at timestamptz not null default now(),
  primary key (room_id, seq)
);
alter table game.room_events enable row level security;

create table game.room_join_fails (                     -- failed room codes (throttle: ≤ 20 per player per hour)
  player_id uuid not null references game.players(id) on delete cascade,
  at timestamptz not null default now()
);
create index room_join_fails_idx on game.room_join_fails (player_id, at);
alter table game.room_join_fails enable row level security;

-- ------------------------------------------------------------------ helpers (no EXECUTE for anon/authenticated)
create or replace function game.ms(t timestamptz) returns bigint language sql immutable set search_path = '' as $$
  select (extract(epoch from t) * 1000)::bigint $$;
/** = room_core.js WORLDS × engine characters (tests/room_core.test.mjs checks these lists against the engine). */
create or replace function game.room_chars(p_world text) returns text[] language sql immutable set search_path = '' as $$
  select case p_world
    when 'w1' then array['teacher', 'driver', 'dev', 'doctor']
    when 'w2' then array['lawyer', 'chef', 'pm']
    when 'w3' then array['importer', 'exporter', 'captain']
    when 'w4' then array['founder', 'engineer', 'social'] end $$;
/** = room_core.normalizeSettings(): unknown keys / bad values → bad_settings; defaults filled; ranked help is fixed to 'hint'. */
create or replace function game.room_settings(p jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_world text; v_mode text; v_pol text; v_char text; v_help text; v_chars text[]; v_max int; v_min int; v_turn int; v_rounds int;
  v_disc text; v_end text; v_priv text; k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad_settings'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('world','mode','char_policy','char','help','turn_secs','disconnect','end','max_rounds','privacy','max_seats','min_seats') then raise exception 'bad_settings'; end if;
  end loop;
  -- strings: must be JSON strings when present; ints: JSON integers
  if exists (select 1 from jsonb_each(p) e where e.key in ('world','mode','char_policy','char','help','disconnect','end','privacy')
             and jsonb_typeof(e.value) not in ('string', 'null')) then raise exception 'bad_settings'; end if;
  if exists (select 1 from jsonb_each(p) e where e.key in ('turn_secs','max_rounds','max_seats','min_seats')
             and (jsonb_typeof(e.value) <> 'number' or (e.value)::text !~ '^\d+$')) then raise exception 'bad_settings'; end if;
  v_world := coalesce(p->>'world', 'w1'); if v_world not in ('w1','w2','w3','w4') then raise exception 'bad_settings'; end if;
  v_chars := game.room_chars(v_world);
  v_mode := coalesce(p->>'mode', 'ranked'); if v_mode not in ('ranked','casual') then raise exception 'bad_settings'; end if;
  v_pol := coalesce(p->>'char_policy', 'same'); if v_pol not in ('same','choose') then raise exception 'bad_settings'; end if;
  if v_pol = 'same' then v_char := coalesce(p->>'char', v_chars[1]); if not (v_char = any(v_chars)) then raise exception 'bad_settings'; end if;
  else v_char := p->>'char'; if v_char is not null and not (v_char = any(v_chars)) then raise exception 'bad_settings'; end if; end if;
  v_help := coalesce(p->>'help', 'hint');
  if (v_mode = 'ranked' and v_help <> 'hint') or v_help not in ('guide','hint','pro') then raise exception 'bad_settings'; end if;
  v_max := coalesce((p->>'max_seats')::int, 4); if v_max not between 2 and 4 then raise exception 'bad_settings'; end if;
  v_min := coalesce((p->>'min_seats')::int, 2); if v_min not between 2 and v_max then raise exception 'bad_settings'; end if;
  v_turn := coalesce((p->>'turn_secs')::int, 90); if v_turn not between 60 and 300 then raise exception 'bad_settings'; end if;
  v_rounds := coalesce((p->>'max_rounds')::int, 80); if v_rounds not between 10 and 120 then raise exception 'bad_settings'; end if;
  v_disc := coalesce(p->>'disconnect', 'autopilot'); if v_disc not in ('autopilot','strict') then raise exception 'bad_settings'; end if;
  v_end := coalesce(p->>'end', 'first_win'); if v_end not in ('first_win','all') then raise exception 'bad_settings'; end if;
  v_priv := coalesce(p->>'privacy', 'code'); if v_priv not in ('code','group') then raise exception 'bad_settings'; end if;
  return jsonb_build_object('world', v_world, 'mode', v_mode, 'char_policy', v_pol, 'char', v_char, 'help', v_help, 'turn_secs', v_turn,
    'disconnect', v_disc, 'end', v_end, 'max_rounds', v_rounds, 'privacy', v_priv, 'max_seats', v_max, 'min_seats', v_min);
end $$;
create or replace function game.room_new_code() returns text language plpgsql volatile security definer set search_path = '' as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b := extensions.gen_random_bytes(6); c := '';
    for i in 0..5 loop c := c || substr(a, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from game.rooms where code = c and status in ('lobby', 'playing'));
  end loop;
  return c;
end $$;
create or replace function game.room_event(p_room uuid, p_kind text, p_data jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_seq bigint; v_round int;
begin
  update game.rooms set next_event = next_event + 1 where id = p_room returning next_event - 1, round into v_seq, v_round;
  insert into game.room_events (room_id, seq, round, kind, data) values (p_room, v_seq, v_round, p_kind, coalesce(p_data, '{}'::jsonb));
end $$;
create or replace function game.room_touch(p_room uuid) returns void language sql security definer set search_path = '' as $$
  update game.rooms set version = version + 1, last_activity = now() where id = p_room $$;
/** the caller's seat (locks the room row first: every writer — RPCs and the Edge Function — serialises on it). */
create or replace function game.room_lock(p_room uuid, p_player uuid) returns game.room_seats language plpgsql security definer set search_path = '' as $$
declare v game.room_seats;
begin
  perform 1 from game.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into v from game.room_seats where room_id = p_room and player_id = p_player for update;
  if not found then raise exception 'not_in_room'; end if;
  return v;
end $$;
/** = room_core needsTick() */
create or replace function game.room_needs_tick(r game.rooms) returns boolean language sql stable set search_path = '' as $$
  select case r.status
    when 'lobby' then now() - r.last_activity > interval '2 hours'
    when 'playing' then r.needs_tick or (r.deadline is not null and now() >= r.deadline) or now() - r.last_activity > interval '2 hours'
    else false end $$;
/** = room_core back(): an away player who shows up again plays again from the next round on. */
create or replace function game.room_back(p_room uuid, p_seat smallint) returns void language plpgsql security definer set search_path = '' as $$
begin
  update game.room_seats s set status = 'playing', missed = 0 from game.rooms r
   where r.id = p_room and r.status = 'playing' and s.room_id = p_room and s.seat = p_seat and s.status = 'away';
  if found then perform game.room_event(p_room, 'back', json_build_object('seat', p_seat)::jsonb); perform game.room_touch(p_room); end if;
end $$;
/** S2 = room_core expireLobby(): lobbies idle > 2 h are cancelled ('expired') without an Edge tick. Called at the start of
 *  rr_room_create / rr_room_join / rr_my_rooms (no cron). At most 50 rows per call and SKIP LOCKED: it never waits for, or deadlocks
 *  with, a room another transaction holds (that room is swept by a later call). → number of lobbies expired. */
create or replace function game.room_sweep() returns int language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  with x as (select id from game.rooms where status = 'lobby' and last_activity < now() - interval '2 hours'
             order by last_activity limit 50 for update skip locked),
  u as (update game.rooms r set status = 'cancelled', end_reason = 'expired', finished_at = now(), version = r.version + 1, next_event = r.next_event + 1
          from x where r.id = x.id returning r.id, r.next_event - 1 as seq, r.round),
  e as (insert into game.room_events (room_id, seq, round, kind, data) select u.id, u.seq, u.round, 'cancelled', '{"why":"expired"}'::jsonb from u returning 1)
  select count(*) into n from e;
  return n;
end $$;
/** S6 — retention, run by the owner (SQL editor / psql as postgres), never scheduled here and never granted to the API roles:
 *  deletes rooms that ENDED (finished / cancelled) more than p_days days ago — seats, actions and events go with them (cascade) —
 *  and failed-join rows older than a day. Playing and lobby rooms are never touched. → {rooms, join_fails, older_than_days}. */
create or replace function game.room_purge(p_days int default 30) returns json language plpgsql volatile set search_path = '' as $$
declare n_rooms int; n_fails int;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'bad_days'; end if;
  with d as (delete from game.rooms where status in ('finished', 'cancelled') and coalesce(finished_at, last_activity) < now() - make_interval(days => p_days) returning 1)
  select count(*) into n_rooms from d;
  with d as (delete from game.room_join_fails where at < now() - interval '1 day' returning 1)
  select count(*) into n_fails from d;
  return json_build_object('rooms', n_rooms, 'join_fails', n_fails, 'older_than_days', p_days);
end $$;
/** a failed code is counted AND answered like the old raise (see game.fail_committed in the groups v2 draft; same caveat). */
create or replace function game.room_fail(p_player uuid, p_code text) returns json language plpgsql security definer set search_path = '' as $$
begin
  insert into game.room_join_fails (player_id) values (p_player);
  perform set_config('response.status', '400', true);
  return json_build_object('code', 'P0001', 'message', p_code, 'details', null, 'hint', null);
end $$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.rr_room_create(p_id uuid, p_secret text, p_settings jsonb, p_group uuid default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_s jsonb; v_r game.rooms; v_seed bigint;
begin
  perform game.auth(p_id, p_secret);
  perform game.room_sweep();
  v_s := game.room_settings(coalesce(p_settings, '{}'::jsonb));
  if v_s->>'privacy' = 'group' then
    if p_group is null then raise exception 'bad_settings'; end if;
    if not exists (select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  end if;
  if (select count(*) from game.rooms where host_id = p_id and created_at > now() - interval '1 day') >= 10 then raise exception 'rate_limited'; end if;
  if (select count(*) from game.room_seats s join game.rooms r on r.id = s.room_id
      where s.player_id = p_id and s.status not in ('left', 'forfeit', 'finished')
        and (r.status = 'lobby' or (r.status = 'playing' and r.last_activity > now() - interval '2 hours'))) >= 3 then raise exception 'too_many_rooms'; end if;
  v_seed := 1 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 2147483646);    -- crypto random, never random()
  insert into game.rooms (code, host_id, group_id, settings, seed, signal_topic)
    values (game.room_new_code(), p_id, case when v_s->>'privacy' = 'group' then p_group end, v_s, v_seed, encode(extensions.gen_random_bytes(16), 'hex'))
    returning * into v_r;
  insert into game.room_seats (room_id, seat, player_id) values (v_r.id, 0, p_id);
  perform game.room_event(v_r.id, 'created', '{"by":0}');
  return json_build_object('room_id', v_r.id, 'code', v_r.code);
end $$;

create or replace function public.rr_room_join(p_id uuid, p_secret text, p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(btrim(left(coalesce(p_code, ''), 16))); v_r game.rooms; v_seat smallint; v_me game.room_seats;
begin
  perform game.auth(p_id, p_secret);
  perform game.room_sweep();
  if (select count(*) from game.room_join_fails where player_id = p_id and at > now() - interval '1 hour') >= 20 then raise exception 'rate_limited'; end if;
  select r.* into v_r from game.rooms r where r.code = v_code and v_code ~ '^[A-Z2-9]{6}$'
     and (r.status = 'lobby' or exists (select 1 from game.room_seats s where s.room_id = r.id and s.player_id = p_id))
   order by r.created_at desc limit 1 for update;
  if not found then return game.room_fail(p_id, 'room_not_found'); end if;
  select * into v_me from game.room_seats where room_id = v_r.id and player_id = p_id;
  if found then                                                   -- reconnect by code = the same seat
    update game.room_seats set last_seen = now() where room_id = v_r.id and seat = v_me.seat;
    return json_build_object('room_id', v_r.id, 'seat', v_me.seat, 'rejoined', true);
  end if;
  if v_r.status <> 'lobby' or v_r.kicked ? p_id::text then return game.room_fail(p_id, 'room_not_found'); end if;
  if v_r.group_id is not null and not exists (select 1 from game.group_members where group_id = v_r.group_id and player_id = p_id) then raise exception 'not_member'; end if;
  if (select count(*) from game.room_seats s join game.rooms r on r.id = s.room_id
      where s.player_id = p_id and s.status not in ('left', 'forfeit', 'finished')
        and (r.status = 'lobby' or (r.status = 'playing' and r.last_activity > now() - interval '2 hours'))) >= 3 then raise exception 'too_many_rooms'; end if;
  if (select count(*) from game.room_seats where room_id = v_r.id) >= (v_r.settings->>'max_seats')::int then raise exception 'room_full'; end if;
  select min(n) into v_seat from generate_series(0, 3) n where not exists (select 1 from game.room_seats where room_id = v_r.id and seat = n);
  insert into game.room_seats (room_id, seat, player_id) values (v_r.id, v_seat, p_id);
  perform game.room_touch(v_r.id);
  perform game.room_event(v_r.id, 'joined', json_build_object('seat', v_seat)::jsonb);
  return json_build_object('room_id', v_r.id, 'seat', v_seat, 'rejoined', false);
end $$;

create or replace function public.rr_room_ready(p_id uuid, p_secret text, p_room uuid, p_ready boolean, p_char text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats; v_r game.rooms; v_c text;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.room_lock(p_room, p_id);
  select * into v_r from game.rooms where id = p_room;
  if v_r.status <> 'lobby' then raise exception 'room_started'; end if;
  if coalesce(p_ready, false) then
    if v_r.settings->>'char_policy' = 'choose' then
      v_c := coalesce(p_char, v_me.char_id);
      if v_c is null or not (v_c = any(game.room_chars(v_r.settings->>'world'))) then raise exception 'bad_char'; end if;
    else
      if p_char is not null and p_char <> v_r.settings->>'char' then raise exception 'bad_char'; end if;
      v_c := v_r.settings->>'char';
    end if;
    update game.room_seats set char_id = v_c where room_id = p_room and seat = v_me.seat;
  end if;
  update game.room_seats set status = case when coalesce(p_ready, false) then 'ready' else 'joined' end, last_seen = now() where room_id = p_room and seat = v_me.seat;
  perform game.room_touch(p_room);
  perform game.room_event(p_room, case when coalesce(p_ready, false) then 'ready' else 'unready' end, json_build_object('seat', v_me.seat)::jsonb);
  return json_build_object('version', (select version from game.rooms where id = p_room));
end $$;

create or replace function public.rr_room_leave(p_id uuid, p_secret text, p_room uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats; v_r game.rooms; v_next game.room_seats;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.room_lock(p_room, p_id);
  select * into v_r from game.rooms where id = p_room;
  if v_r.status = 'lobby' then
    delete from game.room_seats where room_id = p_room and seat = v_me.seat;
    perform game.room_event(p_room, 'left', json_build_object('seat', v_me.seat)::jsonb);
    select * into v_next from game.room_seats where room_id = p_room order by seat limit 1;
    if not found then update game.rooms set status = 'cancelled', end_reason = 'empty', finished_at = now() where id = p_room;
    elsif v_r.host_id = p_id then
      update game.rooms set host_id = v_next.player_id where id = p_room;
      perform game.room_event(p_room, 'host', json_build_object('seat', v_next.seat)::jsonb);
    end if;
    perform game.room_touch(p_room);
    return json_build_object('left', true, 'status', (select status from game.rooms where id = p_room));
  end if;
  if v_r.status = 'playing' and v_me.status in ('playing', 'away') then
    update game.room_seats set status = 'forfeit', forfeit_round = v_r.round where room_id = p_room and seat = v_me.seat;
    update game.rooms set needs_tick = true where id = p_room;                -- the next Edge tick closes the round / ends the room
    perform game.room_event(p_room, 'forfeit', json_build_object('seat', v_me.seat, 'why', 'left')::jsonb);
    perform game.room_touch(p_room);
    return json_build_object('left', true, 'forfeit', true, 'status', v_r.status);
  end if;
  return json_build_object('left', true, 'status', v_r.status);
end $$;

create or replace function public.rr_room_kick(p_id uuid, p_secret text, p_room uuid, p_seat smallint) returns json
language plpgsql security definer set search_path = '' as $$
declare v_r game.rooms; v_t game.room_seats;
begin
  perform game.auth(p_id, p_secret);
  perform game.room_lock(p_room, p_id);
  select * into v_r from game.rooms where id = p_room;
  if v_r.host_id <> p_id then raise exception 'not_host'; end if;
  if v_r.status <> 'lobby' then raise exception 'room_started'; end if;
  select * into v_t from game.room_seats where room_id = p_room and seat = p_seat;
  if not found or v_t.player_id = p_id then raise exception 'bad_seat'; end if;
  delete from game.room_seats where room_id = p_room and seat = p_seat;
  update game.rooms set kicked = kicked || to_jsonb(v_t.player_id::text) where id = p_room;
  perform game.room_event(p_room, 'kicked', json_build_object('seat', p_seat)::jsonb);
  perform game.room_touch(p_room);
  return json_build_object('version', (select version from game.rooms where id = p_room));
end $$;

create or replace function public.rr_room_cancel(p_id uuid, p_secret text, p_room uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats; v_r game.rooms; v_votes int; v_of int;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.room_lock(p_room, p_id);
  select * into v_r from game.rooms where id = p_room;
  if v_r.status = 'lobby' then
    if v_r.host_id <> p_id then raise exception 'not_host'; end if;
    update game.rooms set status = 'cancelled', end_reason = 'host', finished_at = now() where id = p_room;
    perform game.room_event(p_room, 'cancelled', '{"why":"host"}');
    perform game.room_touch(p_room);
    return json_build_object('status', 'cancelled');
  end if;
  if v_r.status <> 'playing' then raise exception 'room_not_playing'; end if;
  if v_me.status not in ('playing', 'away') then raise exception 'seat_finished'; end if;
  if not (v_r.cancel_votes @> to_jsonb(v_me.seat)) then update game.rooms set cancel_votes = cancel_votes || to_jsonb(v_me.seat) where id = p_room returning * into v_r; end if;
  select count(*) filter (where v_r.cancel_votes @> to_jsonb(seat)), count(*) into v_votes, v_of
    from game.room_seats where room_id = p_room and status in ('playing', 'away');
  if v_votes * 2 > v_of then
    update game.rooms set status = 'cancelled', end_reason = 'vote', finished_at = now(), deadline = null where id = p_room;
    perform game.room_event(p_room, 'cancelled', '{"why":"vote"}');
  else
    perform game.room_event(p_room, 'cancel_vote', json_build_object('seat', v_me.seat, 'votes', v_votes, 'of', v_of)::jsonb);
  end if;
  perform game.room_touch(p_room);
  return json_build_object('status', (select status from game.rooms where id = p_room), 'votes', v_votes, 'of', v_of);
end $$;

create or replace function public.rr_room_heartbeat(p_id uuid, p_secret text, p_room uuid, p_conn text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats; v_r game.rooms; v_c text := case when p_conn ~ '^[A-Za-z0-9:_-]{8,64}$' then p_conn end; v_off boolean;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.room_lock(p_room, p_id);
  v_off := now() - v_me.last_seen > interval '45 seconds';
  update game.room_seats set last_seen = now(),
      conn_id = case when v_c is not null and not (conns ? v_c) then v_c else conn_id end,
      conns = case when v_c is null then conns else
        (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(conns || jsonb_build_object(v_c, game.ms(now()))) e(k, v)
          where (v)::text::bigint > game.ms(now()) - 600000) end
    where room_id = p_room and seat = v_me.seat returning * into v_me;
  if v_off then update game.rooms set version = version + 1 where id = p_room; end if;
  perform game.room_back(p_room, v_me.seat);
  select * into v_r from game.rooms where id = p_room;
  return json_build_object('ok', true, 'version', v_r.version, 'state_version', v_me.state_version, 'deadline', game.ms(v_r.deadline), 'now', game.ms(now()),
    'status', v_r.status, 'needs_tick', game.room_needs_tick(v_r), 'primary', v_c is null or v_c = v_me.conn_id);
end $$;

create or replace function public.rr_room_react(p_id uuid, p_secret text, p_room uuid, p_kind text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.room_lock(p_room, p_id);
  if p_kind is null or p_kind not in ('clap', 'wow', 'lol', 'strong', 'bravo', 'again') then raise exception 'bad_reaction'; end if;   -- = room_core REACTIONS
  if v_me.last_react is not null and now() - v_me.last_react < interval '3 seconds' then raise exception 'rate_limited'; end if;
  update game.room_seats set last_react = now() where room_id = p_room and seat = v_me.seat;
  perform game.room_event(p_room, 'react', json_build_object('seat', v_me.seat, 'kind', p_kind)::jsonb);
  perform game.room_touch(p_room);
  return json_build_object('version', (select version from game.rooms where id = p_room));
end $$;

/** = room_core snapshot(): the caller's view only; opponents' public progress as of the last closed round; the seed only when over.
 *  S5: a poll takes no lock and writes nothing unless the seat is away (it comes back) or its last_seen is older than 15 s. */
create or replace function public.rr_room_state(p_id uuid, p_secret text, p_room uuid, p_since bigint default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me game.room_seats; v_r game.rooms; v_host smallint;
begin
  perform game.auth(p_id, p_secret);
  select * into v_me from game.room_seats where room_id = p_room and player_id = p_id;
  if not found or v_me.status = 'away' or now() - v_me.last_seen > interval '15 seconds' then
    v_me := game.room_lock(p_room, p_id);                                    -- raises room_not_found / not_in_room
    update game.room_seats set last_seen = greatest(last_seen, now()) where room_id = p_room and seat = v_me.seat;
    perform game.room_back(p_room, v_me.seat);
  end if;
  select * into v_r from game.rooms where id = p_room;
  select * into v_me from game.room_seats where room_id = p_room and seat = v_me.seat and player_id = p_id;
  if not found then raise exception 'not_in_room'; end if;                 -- left in another tab between the two reads
  if p_since is not null and p_since >= v_r.version then
    return json_build_object('unchanged', true, 'version', v_r.version, 'state_version', v_me.state_version, 'now', game.ms(now()));
  end if;
  select seat into v_host from game.room_seats where room_id = p_room and player_id = v_r.host_id;
  return json_build_object(
    'room', json_build_object('id', v_r.id, 'code', v_r.code, 'status', v_r.status, 'settings', v_r.settings, 'round', v_r.round,
      'deadline', game.ms(v_r.deadline), 'version', v_r.version, 'now', game.ms(now()), 'host_seat', v_host, 'rules', v_r.rules,
      'engine_sha', v_r.engine_sha, 'signal_topic', v_r.signal_topic, 'end_reason', v_r.end_reason, 'started_at', game.ms(v_r.started_at),
      'finished_at', game.ms(v_r.finished_at), 'results', v_r.results,
      'seed', case when v_r.status in ('finished', 'cancelled') and v_r.started_at is not null then v_r.seed end,
      'needs_tick', game.room_needs_tick(v_r)),
    'seats', (select coalesce(json_agg(json_build_object('seat', s.seat, 'nickname', p.nickname, 'pawn', p.pawn, 'status', s.status, 'char', s.char_id,
        'me', s.player_id = p_id, 'connected', now() - s.last_seen <= interval '45 seconds',
        'done', case when v_r.status = 'playing' then (s.status in ('finished', 'forfeit', 'left') or s.state is null or s.st_over
                  or (s.rolled_round >= v_r.round and s.st_phase = 'roll' and not s.st_pending)) end,
        'pub', s.pub, 'pub_round', s.pub_round, 'result', case when v_r.status = 'finished' then s.result end) order by s.seat), '[]'::json)
      from game.room_seats s join game.players p on p.id = s.player_id where s.room_id = p_room),
    'me', json_build_object('seat', v_me.seat, 'state_version', v_me.state_version, 'view', v_me.view,
      'done', case when v_r.status = 'playing' then (v_me.status in ('finished', 'forfeit', 'left') or v_me.state is null or v_me.st_over
                or (v_me.rolled_round >= v_r.round and v_me.st_phase = 'roll' and not v_me.st_pending)) end,
      'rolled', v_me.rolled_round >= v_r.round and v_r.round > 0),
    'events', (select coalesce(json_agg(json_build_object('id', e.seq, 'round', e.round, 'kind', e.kind, 'data', e.data, 'at', game.ms(e.at)) order by e.seq), '[]'::json)
      from (select * from game.room_events where room_id = p_room order by seq desc limit 30) e));
end $$;

create or replace function public.rr_my_rooms(p_id uuid, p_secret text) returns json
language plpgsql volatile security definer set search_path = '' as $$             -- volatile: it sweeps stale lobbies (S2)
begin
  perform game.auth(p_id, p_secret);
  perform game.room_sweep();
  return (select coalesce(json_agg(json_build_object('id', r.id, 'code', r.code, 'status', r.status, 'world', r.settings->>'world',
      'seats', (select count(*) from game.room_seats x where x.room_id = r.id), 'max_seats', (r.settings->>'max_seats')::int,
      'round', r.round, 'host', r.host_id = p_id, 'seat', r.my_seat) order by r.last_activity desc), '[]'::json)
    from (select r.*, s.seat as my_seat from game.rooms r join game.room_seats s on s.room_id = r.id and s.player_id = p_id
          where r.status in ('lobby', 'playing') or r.finished_at > now() - interval '1 day' order by r.last_activity desc limit 20) r);
end $$;

-- ------------------------------------------------------------------ grants: only rr_room_* / rr_my_rooms for the API roles
revoke all on function game.ms(timestamptz), game.room_chars(text), game.room_settings(jsonb), game.room_new_code(), game.room_event(uuid, text, jsonb),
  game.room_touch(uuid), game.room_lock(uuid, uuid), game.room_needs_tick(game.rooms), game.room_back(uuid, smallint), game.room_fail(uuid, text),
  game.room_sweep(), game.room_purge(int) from public;
revoke all on function public.rr_room_create(uuid, text, jsonb, uuid), public.rr_room_join(uuid, text, text), public.rr_room_ready(uuid, text, uuid, boolean, text),
  public.rr_room_leave(uuid, text, uuid), public.rr_room_kick(uuid, text, uuid, smallint), public.rr_room_cancel(uuid, text, uuid),
  public.rr_room_heartbeat(uuid, text, uuid, text), public.rr_room_react(uuid, text, uuid, text), public.rr_room_state(uuid, text, uuid, bigint),
  public.rr_my_rooms(uuid, text) from public;
grant execute on function public.rr_room_create(uuid, text, jsonb, uuid), public.rr_room_join(uuid, text, text), public.rr_room_ready(uuid, text, uuid, boolean, text),
  public.rr_room_leave(uuid, text, uuid), public.rr_room_kick(uuid, text, uuid, smallint), public.rr_room_cancel(uuid, text, uuid),
  public.rr_room_heartbeat(uuid, text, uuid, text), public.rr_room_react(uuid, text, uuid, text), public.rr_room_state(uuid, text, uuid, bigint),
  public.rr_my_rooms(uuid, text) to anon, authenticated;
-- tables: no grants at all (the Edge Function connects with SUPABASE_DB_URL, the owner role; RLS stays deny-all for the API roles);
-- explicit revoke in case schema `game` ever gets default privileges for the API roles (N4)
revoke all on table game.rooms, game.room_seats, game.room_actions, game.room_events, game.room_join_fails from anon, authenticated;

commit;

-- ================================================================== ROLLBACK (run by hand; drops every room — export first if needed)
-- begin;
-- drop function if exists public.rr_my_rooms(uuid, text), public.rr_room_state(uuid, text, uuid, bigint), public.rr_room_react(uuid, text, uuid, text),
--   public.rr_room_heartbeat(uuid, text, uuid, text), public.rr_room_cancel(uuid, text, uuid), public.rr_room_kick(uuid, text, uuid, smallint),
--   public.rr_room_leave(uuid, text, uuid), public.rr_room_ready(uuid, text, uuid, boolean, text), public.rr_room_join(uuid, text, text),
--   public.rr_room_create(uuid, text, jsonb, uuid), game.room_purge(int), game.room_sweep(), game.room_fail(uuid, text), game.room_back(uuid, smallint), game.room_needs_tick(game.rooms),
--   game.room_lock(uuid, uuid), game.room_touch(uuid), game.room_event(uuid, text, jsonb), game.room_new_code(), game.room_settings(jsonb),
--   game.room_chars(text), game.ms(timestamptz);
-- drop table if exists game.room_join_fails, game.room_events, game.room_actions, game.room_seats, game.rooms;
-- commit;
