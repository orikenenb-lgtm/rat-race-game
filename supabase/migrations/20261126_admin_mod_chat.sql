-- NOT APPLIED — needs owner approval.
-- Moderation (owner = the one admin of 20261123_admin.sql) + in-room chat for live rooms. docs/full-upgrade/ADMIN_CHAT.md.
-- Status: DRAFT. Requires the production baseline + 20261123_admin.sql (live) and the rooms draft 20261124_rooms.sql (game.rooms,
-- game.room_seats, game.room_event, game.room_touch, game.ms, game.room_purge). Works with or without the groups v2 draft (detected at
-- run time). ONE transaction; ROLLBACK block at the bottom (restores the two replaced functions byte for byte).
--
-- Server-authoritative: every admin RPC starts with game.need_admin (game.auth + game.is_admin) — nothing from the client is trusted.
-- What it adds:
--   * game.bans (one row per banned player; until null = permanent; unban deletes the row) · game.mod_log (append-only: a trigger refuses
--     UPDATE / DELETE / TRUNCATE; no FKs, so the log outlives deleted players) — every admin action writes one row, also the live
--     rr_admin_claim / rr_admin_give (AFTER INSERT triggers on game.admins / game.energy_gifts kind 'admin'; their bodies are unchanged).
--   * A banned player cannot create / join rooms (BEFORE INSERT trigger on game.room_seats), cannot join or create groups (BEFORE INSERT
--     trigger on game.group_members — the live rr_create_group / rr_join_group and the groups v2 versions alike, bodies unchanged), cannot
--     send chat, and is not on any board built by game.board (daily, weekly, legacy challenges, group pages). Banning also removes the
--     player from every open room (lobby: the seat is freed; playing: forfeit, like leaving — the game goes on with the others).
--   * In-room chat: game.room_chat (≤ 120 chars, members of the same room only, hidden by the admin), game.chat_reports ("דווח"),
--     game.chat_blocked (refused messages: who / when / why — never the text). Server filter game.chat_check: links / domains, phone
--     numbers (7+ digits), e-mails, @handles + social-app names, a Hebrew + English word list; rate limit 5 / 10 s and 60 / hour per
--     player (sent + refused). History: 7 days (game.chat_sweep on every send + game.room_purge). Chat never touches the engine.
-- REPLACED existing functions (same signature, same result for everyone who is not banned):
--   * game.board(uuid, text, uuid, text) — LIVE: the baseline body + one filter "the player has no active ban".
--   * game.room_purge(int) — rooms DRAFT: + deletes chat older than 7 days (and refused-message rows) and reports with them.
-- Validated offline by tests/admin_chat_sql.test.mjs (PGlite) and on the local staging stack (tools/staging, real PostgreSQL 17 +
-- PostgREST + Deno): tests/admin_chat_contract.mjs --live --local.

begin;

-- ------------------------------------------------------------------ tables
create table game.bans (
  player_id uuid primary key references game.players(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 200),
  by_id uuid references game.players(id) on delete set null,
  until timestamptz,                                                    -- null = permanent
  created_at timestamptz not null default now()
);
alter table game.bans enable row level security;

create table game.mod_log (                                             -- append-only (trigger below); no FKs on purpose
  id bigserial primary key,
  admin_id uuid,
  action text not null check (action ~ '^[a-z_]{1,24}$'),
  target_id uuid,
  room_id uuid,
  group_id uuid,
  msg_id bigint,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) < 2048),
  at timestamptz not null default now()
);
alter table game.mod_log enable row level security;

create table game.room_chat (
  id bigserial primary key,
  room_id uuid not null references game.rooms(id) on delete cascade,
  seat smallint not null,
  player_id uuid not null references game.players(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 120),
  hidden boolean not null default false,
  hidden_by uuid,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index room_chat_room on game.room_chat (room_id, id);
create index room_chat_player on game.room_chat (player_id, created_at);
create index room_chat_created on game.room_chat (created_at);
alter table game.room_chat enable row level security;

create table game.chat_reports (
  msg_id bigint not null references game.room_chat(id) on delete cascade,
  reporter_id uuid not null references game.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (msg_id, reporter_id)
);
create index chat_reports_at on game.chat_reports (created_at);
create index chat_reports_reporter on game.chat_reports (reporter_id, created_at);
alter table game.chat_reports enable row level security;

create table game.chat_blocked (                                        -- refused messages: never the text
  player_id uuid not null references game.players(id) on delete cascade,
  room_id uuid references game.rooms(id) on delete cascade,
  reason text not null check (reason ~ '^chat_[a-z_]{1,20}$'),
  at timestamptz not null default now()
);
create index chat_blocked_player on game.chat_blocked (player_id, at);
create index chat_blocked_at on game.chat_blocked (at);
alter table game.chat_blocked enable row level security;

-- ------------------------------------------------------------------ helpers (no EXECUTE for anon / authenticated)
create or replace function game.is_banned(p_player uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists (select 1 from game.bans where player_id = p_player and (until is null or until > now())) $$;

create or replace function game.need_admin(p_id uuid, p_secret text) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  if not game.is_admin(p_id) then raise exception 'not_admin'; end if;
end $$;

create or replace function game.mod(p_admin uuid, p_action text, p_target uuid, p_room uuid, p_group uuid, p_msg bigint, p_data jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into game.mod_log (admin_id, action, target_id, room_id, group_id, msg_id, data) values (p_admin, p_action, p_target, p_room, p_group, p_msg, coalesce(p_data, '{}'::jsonb)) $$;

create or replace function game.mod_log_guard() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'mod_log_append_only'; end $$;
create trigger mod_log_no_change before update or delete on game.mod_log for each row execute function game.mod_log_guard();
create trigger mod_log_no_truncate before truncate on game.mod_log for each statement execute function game.mod_log_guard();

/** BEFORE INSERT on game.room_seats / game.group_members: a banned player never takes a seat or joins a group. */
create or replace function game.ban_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if game.is_banned(new.player_id) then raise exception 'banned'; end if;
  return new;
end $$;
create trigger room_seats_ban_guard before insert on game.room_seats for each row execute function game.ban_guard();
create trigger group_members_ban_guard before insert on game.group_members for each row execute function game.ban_guard();

/** AFTER INSERT: the live admin RPCs are logged without touching their bodies. */
create or replace function game.mod_log_claim() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform game.mod(new.player_id, 'claim', new.player_id, null, null, null, null); return null; end $$;
create trigger admins_mod_log after insert on game.admins for each row execute function game.mod_log_claim();
create or replace function game.mod_log_give() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform game.mod(new.from_id, 'give', new.to_id, null, null, null, jsonb_build_object('amount', new.amount)); return null; end $$;
create trigger energy_gifts_mod_log after insert on game.energy_gifts for each row when (new.kind = 'admin') execute function game.mod_log_give();

-- ------------------------------------------------------------------ chat filter (= supabase/functions/room/chat_rules.js, tests check both)
/** The word lists (folded by game.chat_fold at run time). chat_rules.js LISTS must equal this JSON (tests/chat_rules.test.mjs). */
create or replace function game.chat_lists() returns jsonb language sql immutable set search_path = '' as $$ select
-- CHAT_LISTS_BEGIN
'{"exact":["ass","dick","cock","fag","sex","sexy","kys","stfu","wtf","idiot","stupid","moron","loser","dumb","porn","nude","nudes","זין","זיין","חרא","תמות","טיפש","טיפשה","סתום","סתומה","מניאק","מניאקית","כוסית","זונות"],"part":["fuck","fuk","fck","shit","bitch","cunt","asshole","bastard","slut","whore","nigger","nigga","faggot","retard","dickhead","motherf","pussy","wank","porno","שרמוט","זונה","כוסאמ","כוסעמ","כוסאחת","מזדיינ","לזיינ","זיינת","מטומטמ","דביל","מפגר","אידיוט","תתאבד","בנזונה","חתיכתחרא"],"phrase":["kill yourself","kill urself","go die","shut up","לך תמות","תלך תמות","סתום את הפה","סתום תפה","בן זונה","כוס אמא","כוס אמק","כוס אמך","יא חרא","יא זבל","יא מפגר"],"platform":["instagram","insta","snapchat","snap","tiktok","tik tok","telegram","whatsapp","whats app","discord","facebook","אינסטגרם","אינסטה","סנאפצט","סנאפ","סנפצט","טיקטוק","טלגרם","וואטסאפ","ווטסאפ","וואצאפ","ווצאפ","ווטצאפ","דיסקורד","פייסבוק"]}'::jsonb
-- CHAT_LISTS_END
$$;

/** Unicode clean-up shared by every check: NFKC (full-width / styled letters → plain), no invisible / bidi marks, no Hebrew niqqud,
 *  Arabic-Indic digits → 0-9, control chars → space, ASCII lower case (collation-independent). */
create or replace function game.chat_norm(p text) returns text language sql immutable set search_path = '' as $$
  select translate(regexp_replace(regexp_replace(normalize(coalesce(p, ''), NFKC),
      '[­֑-ׇ​-‏‪-‮⁠-⁩﻿]', '', 'g'), '[\u0001-\u001F\u007F]', ' ', 'g'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'abcdefghijklmnopqrstuvwxyz01234567890123456789') $$;

/** Word view of a normalized text: leet digits → letters, Hebrew final letters → regular, letters only (one space between words),
 *  repeated letters collapsed ("fuuuck" → "fuck", "זיין" → "זין"). */
create or replace function game.chat_fold(p text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(translate(p, '0134578@$!|ךםןףץ', 'oieastbasiiכמנפצ'), '[^a-zא-ת]+', ' ', 'g'),
    '([a-zא-ת])\1+', '\1', 'g')) $$;

/** → null (ok) or the refusal code: chat_empty · chat_too_long · chat_email · chat_link · chat_phone · chat_handle · chat_bad_word. */
create or replace function game.chat_check(p_text text) returns text language plpgsql immutable set search_path = '' as $$
declare
  t text; w text; d text; L jsonb := game.chat_lists(); tok text; run text := ''; x text; toks text[];
  exact text[]; part text[];
begin
  if p_text is null or btrim(p_text) = '' then return 'chat_empty'; end if;
  if char_length(btrim(p_text)) > 120 then return 'chat_too_long'; end if;
  t := game.chat_norm(p_text);
  if btrim(t) = '' then return 'chat_empty'; end if;
  if t ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+' then return 'chat_email'; end if;
  if t ~ '(https?:|www\.|://)' or t ~ '[a-z0-9-]\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*(com|net|org|il|co|io|me|gg|ly|app|xyz|info|biz|tv|ru|us|uk|de|fr|link|site|online|club|top|to|cc|be|ws|live|gl|ai|so|sh)([^a-z0-9]|$)'
    then return 'chat_link'; end if;
  d := regexp_replace(t, '[\s().\-_/+*#]', '', 'g');
  if d ~ '[0-9]{7,}' then return 'chat_phone'; end if;
  if t ~ '@\s*[^\s]' then return 'chat_handle'; end if;
  w := game.chat_fold(t);
  if exists (select 1 from jsonb_array_elements_text(L->'platform') p where position(' ' || game.chat_fold(game.chat_norm(p)) || ' ' in ' ' || w || ' ') > 0
             or (char_length(game.chat_fold(game.chat_norm(p))) >= 5 and position(game.chat_fold(game.chat_norm(p)) in replace(w, ' ', '')) > 0))
    then return 'chat_handle'; end if;
  if exists (select 1 from jsonb_array_elements_text(L->'phrase') p where position(' ' || game.chat_fold(game.chat_norm(p)) || ' ' in ' ' || w || ' ') > 0)
    then return 'chat_bad_word'; end if;
  select array_agg(game.chat_fold(game.chat_norm(e))) into exact from jsonb_array_elements_text(L->'exact') e;
  select array_agg(game.chat_fold(game.chat_norm(e))) into part from jsonb_array_elements_text(L->'part') e;
  toks := case when w = '' then array[]::text[] else string_to_array(w, ' ') end;
  -- single letters typed apart ("f u c k") are read as one word too
  foreach tok in array toks || array['']::text[] loop
    if char_length(tok) = 1 then run := run || tok; continue; end if;
    foreach x in array array[regexp_replace(run, '([a-z\u05D0-\u05EA])\1+', '\1', 'g'), tok] loop
      if x <> '' and (x = any(exact) or exists (select 1 from unnest(part) q where position(q in x) > 0)) then return 'chat_bad_word'; end if;
    end loop;
    run := '';
  end loop;
  return null;
end $$;

/** 7-day chat history without a cron: every send deletes up to 200 expired rows (oldest first). → rows deleted. */
create or replace function game.chat_sweep() returns int language plpgsql volatile security definer set search_path = '' as $$
declare n int; m int;
begin
  with d as (delete from game.room_chat where id in (select id from game.room_chat where created_at < now() - interval '7 days' order by created_at limit 200) returning 1)
  select count(*) into n from d;
  with d as (delete from game.chat_blocked where ctid in (select ctid from game.chat_blocked where at < now() - interval '7 days' limit 200) returning 1)
  select count(*) into m from d;
  return n + m;
end $$;

/** The caller's seat in a room for chat, or raises: room_not_found · not_in_room (also an admin-kicked player). → the room row. */
create or replace function game.chat_member(p_room uuid, p_player uuid) returns game.rooms language plpgsql stable security definer set search_path = '' as $$
declare v_r game.rooms;
begin
  select * into v_r from game.rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if not exists (select 1 from game.room_seats where room_id = p_room and player_id = p_player) or v_r.kicked ? p_player::text then raise exception 'not_in_room'; end if;
  return v_r;
end $$;

/** a refused message is counted (rate limit, admin summary) AND answered like a raise (the game.room_fail pattern of the rooms draft). */
create or replace function game.chat_refuse(p_player uuid, p_room uuid, p_code text) returns json language plpgsql security definer set search_path = '' as $$
begin
  insert into game.chat_blocked (player_id, room_id, reason) values (p_player, p_room, p_code);
  perform set_config('response.status', '400', true);
  return json_build_object('code', 'P0001', 'message', p_code, 'details', null, 'hint', null);
end $$;

/** Takes the player out of one room (admin kick, ban): lobby → the seat is freed (+ kicked: no way back by code; host role moves;
 *  an empty lobby is cancelled); playing → forfeit like leaving (the next Edge tick closes the round; the others play on) + kicked
 *  (no chat). → 'removed' | 'forfeit' | 'none'. Locks the room row like every room writer. */
create or replace function game.admin_seat_out(p_room uuid, p_player uuid, p_why text) returns text language plpgsql security definer set search_path = '' as $$
declare v_r game.rooms; v_s game.room_seats; v_next game.room_seats; v_out text := 'none';
begin
  select * into v_r from game.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into v_s from game.room_seats where room_id = p_room and player_id = p_player for update;
  if not found then return 'none'; end if;
  if v_r.status in ('lobby', 'playing') and not (v_r.kicked ? p_player::text) then
    update game.rooms set kicked = kicked || to_jsonb(p_player::text) where id = p_room;
  end if;
  if v_r.status = 'lobby' then
    delete from game.room_seats where room_id = p_room and seat = v_s.seat;
    perform game.room_event(p_room, 'kicked', json_build_object('seat', v_s.seat, 'by', p_why)::jsonb);
    select * into v_next from game.room_seats where room_id = p_room order by seat limit 1;
    if not found then
      update game.rooms set status = 'cancelled', end_reason = 'empty', finished_at = now() where id = p_room;
      perform game.room_event(p_room, 'cancelled', '{"why":"empty"}');
    elsif v_r.host_id = p_player then
      update game.rooms set host_id = v_next.player_id where id = p_room;
      perform game.room_event(p_room, 'host', json_build_object('seat', v_next.seat)::jsonb);
    end if;
    v_out := 'removed';
  elsif v_r.status = 'playing' and v_s.status in ('playing', 'away') then
    update game.room_seats set status = 'forfeit', forfeit_round = v_r.round where room_id = p_room and seat = v_s.seat;
    update game.rooms set needs_tick = true where id = p_room;
    perform game.room_event(p_room, 'forfeit', json_build_object('seat', v_s.seat, 'why', p_why)::jsonb);
    v_out := 'forfeit';
  end if;
  if v_out <> 'none' then perform game.room_touch(p_room); end if;
  return v_out;
end $$;

-- ------------------------------------------------------------------ the two replaced functions
/** LIVE game.board (production_baseline.sql) + "no active ban" — the same rows, order and keys for every player who is not banned. */
CREATE OR REPLACE FUNCTION game.board(p_challenge uuid, p_weekly text, p_me uuid, p_daily text DEFAULT NULL::text)
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce(json_agg(json_build_object('nickname', nickname, 'status', status, 'months', months,
           'net_worth', net_worth, 'passive', passive, 'expenses', expenses, 'me', me,
           'stars', total_stars, 'pawn', pawn, 'progress', progress, 'verified', verified)
         order by o0, o1, ov, o2, o3 desc, o4 desc, o5), '[]'::json)
  from (
    select p.nickname, p.total_stars, p.pawn, r.status, r.months, r.net_worth, r.passive, r.expenses, (r.player_id = p_me) as me,
      (r.stats->>'progress')::numeric as progress, r.verified,
      case when r.verified is false then 1 else 0 end as o0,
      case r.status when 'won' then 0 when 'lost' then 1 else 2 end as o1,
      case when r.verified is true then 0 else 1 end as ov,
      case when r.status = 'won' then r.months::numeric
           else -coalesce((r.stats->>'progress')::numeric, r.passive::numeric / nullif(r.expenses, 0), 0) end as o2,
      coalesce(r.net_worth, 0) as o3, coalesce(r.passive, 0) as o4, coalesce(r.finished_at, r.started_at) as o5
    from game.results r join game.players p on p.id = r.player_id
    where ((p_challenge is not null and r.challenge_id = p_challenge)
       or (p_weekly is not null and r.weekly_key = p_weekly)
       or (p_daily is not null and r.daily_key = p_daily))
      and not exists (select 1 from game.bans b where b.player_id = r.player_id and (b.until is null or b.until > now()))
    order by o0, o1, ov, o2, o3 desc, o4 desc, o5
    limit 100
  ) x
$function$;

/** rooms draft game.room_purge + chat: messages older than 7 days (reports go with them) and refused-message rows. */
create or replace function game.room_purge(p_days int default 30) returns json language plpgsql volatile set search_path = '' as $$
declare n_rooms int; n_fails int; n_chat int; n_blocked int;
begin
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'bad_days'; end if;
  with d as (delete from game.rooms where status in ('finished', 'cancelled') and coalesce(finished_at, last_activity) < now() - make_interval(days => p_days) returning 1)
  select count(*) into n_rooms from d;
  with d as (delete from game.room_join_fails where at < now() - interval '1 day' returning 1)
  select count(*) into n_fails from d;
  with d as (delete from game.room_chat where created_at < now() - interval '7 days' returning 1)
  select count(*) into n_chat from d;
  with d as (delete from game.chat_blocked where at < now() - interval '7 days' returning 1)
  select count(*) into n_blocked from d;
  return json_build_object('rooms', n_rooms, 'join_fails', n_fails, 'older_than_days', p_days, 'chat', n_chat, 'chat_blocked', n_blocked);
end $$;

-- ------------------------------------------------------------------ player RPCs
/** {banned, until (ms | null), permanent} — the banned player's own status (the reason is for the admin only). */
create or replace function public.rr_ban_status(p_id uuid, p_secret text) returns json language plpgsql stable security definer set search_path = '' as $$
declare v game.bans;
begin
  perform game.auth(p_id, p_secret);
  select * into v from game.bans where player_id = p_id and (until is null or until > now());
  return json_build_object('banned', found, 'until', game.ms(v.until), 'permanent', found and v.until is null);
end $$;

/** → {id, at} · refusals (400, nothing stored but the refusal row): chat_empty chat_too_long chat_email chat_link chat_phone chat_handle
 *  chat_bad_word · raises: banned · room_not_found · not_in_room · chat_closed · rate_limited (5 / 10 s, 60 / hour, sent + refused). */
create or replace function public.rr_room_chat_send(p_id uuid, p_secret text, p_room uuid, p_text text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_r game.rooms; v_seat smallint; v_code text; v_t text := btrim(regexp_replace(coalesce(p_text, ''), '[\u0001-\u001F\u007F]+', ' ', 'g')); v_id bigint; v_at timestamptz;
begin
  perform game.auth(p_id, p_secret);
  if game.is_banned(p_id) then raise exception 'banned'; end if;
  v_r := game.chat_member(p_room, p_id);
  if not (v_r.status in ('lobby', 'playing') or (v_r.status in ('finished', 'cancelled') and v_r.finished_at > now() - interval '30 minutes')) then raise exception 'chat_closed'; end if;
  if (select count(*) from game.room_chat where player_id = p_id and created_at > now() - interval '10 seconds')
     + (select count(*) from game.chat_blocked where player_id = p_id and at > now() - interval '10 seconds') >= 5
  or (select count(*) from game.room_chat where player_id = p_id and created_at > now() - interval '1 hour')
     + (select count(*) from game.chat_blocked where player_id = p_id and at > now() - interval '1 hour') >= 60 then raise exception 'rate_limited'; end if;
  perform game.chat_sweep();
  v_code := game.chat_check(v_t);
  if v_code is not null then return game.chat_refuse(p_id, p_room, v_code); end if;
  select seat into v_seat from game.room_seats where room_id = p_room and player_id = p_id;
  insert into game.room_chat (room_id, seat, player_id, text) values (p_room, v_seat, p_id, v_t) returning id, created_at into v_id, v_at;
  return json_build_object('id', v_id, 'at', game.ms(v_at));
end $$;

/** → {msgs [{id, seat, nickname, text, at, me}] (visible, id > p_since, the last 40), hidden [ids hidden among the last 100], last}. */
create or replace function public.rr_room_chat_list(p_id uuid, p_secret text, p_room uuid, p_since bigint default null) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  perform game.chat_member(p_room, p_id);
  return json_build_object(
    'msgs', (select coalesce(json_agg(json_build_object('id', m.id, 'seat', m.seat, 'nickname', p.nickname, 'text', m.text, 'at', game.ms(m.created_at),
        'me', m.player_id = p_id) order by m.id), '[]'::json)
      from (select * from game.room_chat where room_id = p_room and not hidden and id > coalesce(p_since, 0) order by id desc limit 40) m
      join game.players p on p.id = m.player_id),
    'hidden', (select coalesce(json_agg(x.id order by x.id), '[]'::json) from (select id, hidden from game.room_chat where room_id = p_room order by id desc limit 100) x where x.hidden),
    'last', (select coalesce(max(id), 0) from game.room_chat where room_id = p_room));
end $$;

/** "דווח" on a message of my room (not my own) → {reported: true}; once per message per player; ≤ 20 reports / hour. */
create or replace function public.rr_room_chat_report(p_id uuid, p_secret text, p_msg bigint) returns json
language plpgsql security definer set search_path = '' as $$
declare v_m game.room_chat;
begin
  perform game.auth(p_id, p_secret);
  select * into v_m from game.room_chat where id = p_msg;
  if not found then raise exception 'msg_not_found'; end if;
  perform game.chat_member(v_m.room_id, p_id);
  if v_m.player_id = p_id then raise exception 'cannot_report_self'; end if;
  if exists (select 1 from game.chat_reports where msg_id = p_msg and reporter_id = p_id) then return json_build_object('reported', true); end if;
  if (select count(*) from game.chat_reports where reporter_id = p_id and created_at > now() - interval '1 hour') >= 20 then raise exception 'rate_limited'; end if;
  insert into game.chat_reports (msg_id, reporter_id) values (p_msg, p_id);
  return json_build_object('reported', true);
end $$;

-- ------------------------------------------------------------------ admin RPCs (game.need_admin first, every one)
/** ban (or change a ban): reason 2–200 chars, p_days 1–3650 or null = permanent. Removes the player from every open room. */
create or replace function public.rr_admin_ban(p_id uuid, p_secret text, p_target uuid, p_reason text, p_days int default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_reason text := btrim(coalesce(p_reason, '')); v_until timestamptz; v_rooms int := 0; v_room uuid;
begin
  perform game.need_admin(p_id, p_secret);
  if p_target = p_id then raise exception 'cannot_ban_self'; end if;
  if not exists (select 1 from game.players where id = p_target) then raise exception 'player_not_found'; end if;
  if game.is_admin(p_target) then raise exception 'cannot_ban_self'; end if;
  if char_length(v_reason) not between 2 and 200 or v_reason ~ '[\u0001-\u001F\u007F]' then raise exception 'bad_reason'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'bad_days'; end if;
  v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;
  insert into game.bans (player_id, reason, by_id, until) values (p_target, v_reason, p_id, v_until)
    on conflict (player_id) do update set reason = excluded.reason, by_id = excluded.by_id, until = excluded.until, created_at = now();
  for v_room in select s.room_id from game.room_seats s join game.rooms r on r.id = s.room_id where s.player_id = p_target and r.status in ('lobby', 'playing') loop
    if game.admin_seat_out(v_room, p_target, 'ban') <> 'none' then v_rooms := v_rooms + 1; end if;
  end loop;
  perform game.mod(p_id, 'ban', p_target, null, null, null, jsonb_build_object('reason', v_reason, 'days', p_days, 'rooms', v_rooms));
  return json_build_object('banned', true, 'until', game.ms(v_until), 'rooms', v_rooms);
end $$;

create or replace function public.rr_admin_unban(p_id uuid, p_secret text, p_target uuid) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  delete from game.bans where player_id = p_target;
  if not found then raise exception 'not_banned'; end if;
  perform game.mod(p_id, 'unban', p_target, null, null, null, null);
  return json_build_object('banned', false);
end $$;

/** active bans, newest first (≤ 100) */
create or replace function public.rr_admin_bans(p_id uuid, p_secret text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  return (select coalesce(json_agg(json_build_object('player_id', b.player_id, 'nickname', p.nickname, 'reason', b.reason, 'until', game.ms(b.until),
      'at', game.ms(b.created_at), 'by', a.nickname) order by b.created_at desc), '[]'::json)
    from (select * from game.bans where until is null or until > now() order by created_at desc limit 100) b
    join game.players p on p.id = b.player_id left join game.players a on a.id = b.by_id);
end $$;

/** one player for the admin panel: ban, groups, open rooms, refused messages / reports in the last 24 h */
create or replace function public.rr_admin_player(p_id uuid, p_secret text, p_target uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v game.players;
begin
  perform game.need_admin(p_id, p_secret);
  select * into v from game.players where id = p_target;
  if not found then raise exception 'player_not_found'; end if;
  return json_build_object('id', v.id, 'nickname', v.nickname, 'stars', v.total_stars, 'joined', v.created_at::date, 'admin', game.is_admin(v.id),
    'ban', (select json_build_object('reason', b.reason, 'until', game.ms(b.until), 'at', game.ms(b.created_at)) from game.bans b where b.player_id = v.id and (b.until is null or b.until > now())),
    'groups', (select coalesce(json_agg(json_build_object('id', g.id, 'name', g.name, 'owner', g.owner_id = v.id,
        'members', (select count(*) from game.group_members x where x.group_id = g.id)) order by g.name), '[]'::json)
      from game.group_members m join game.groups g on g.id = m.group_id where m.player_id = v.id),
    'rooms', (select coalesce(json_agg(json_build_object('id', r.id, 'code', r.code, 'status', r.status, 'seat', s.seat, 'seat_status', s.status) order by r.last_activity desc), '[]'::json)
      from game.room_seats s join game.rooms r on r.id = s.room_id where s.player_id = v.id and r.status in ('lobby', 'playing')),
    'blocked_24h', (select count(*) from game.chat_blocked where player_id = v.id and at > now() - interval '1 day'),
    'reported_24h', (select count(*) from game.chat_reports c join game.room_chat m on m.id = c.msg_id where m.player_id = v.id and c.created_at > now() - interval '1 day'));
end $$;

/** open rooms (lobby / playing), most recently active first (≤ 50), with every seat's player */
create or replace function public.rr_admin_rooms(p_id uuid, p_secret text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  return (select coalesce(json_agg(json_build_object('id', r.id, 'code', r.code, 'status', r.status, 'world', r.settings->>'world', 'round', r.round,
      'max_seats', (r.settings->>'max_seats')::int, 'created_at', game.ms(r.created_at), 'last_activity', game.ms(r.last_activity),
      'seats', (select coalesce(json_agg(json_build_object('seat', s.seat, 'player_id', s.player_id, 'nickname', p.nickname, 'status', s.status,
          'host', s.player_id = r.host_id, 'connected', now() - s.last_seen <= interval '45 seconds') order by s.seat), '[]'::json)
        from game.room_seats s join game.players p on p.id = s.player_id where s.room_id = r.id),
      'chat', (select count(*) from game.room_chat c where c.room_id = r.id),
      'reports', (select count(*) from game.chat_reports c join game.room_chat m on m.id = c.msg_id where m.room_id = r.id)) order by r.last_activity desc), '[]'::json)
    from (select * from game.rooms where status in ('lobby', 'playing') order by last_activity desc limit 50) r);
end $$;

/** the chat of any room for the admin (hidden messages included, flagged), with report counts and sender ids */
create or replace function public.rr_admin_room_chat(p_id uuid, p_secret text, p_room uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  if not exists (select 1 from game.rooms where id = p_room) then raise exception 'room_not_found'; end if;
  return (select coalesce(json_agg(json_build_object('id', m.id, 'seat', m.seat, 'player_id', m.player_id, 'nickname', p.nickname, 'text', m.text,
      'at', game.ms(m.created_at), 'hidden', m.hidden, 'reports', (select count(*) from game.chat_reports c where c.msg_id = m.id)) order by m.id), '[]'::json)
    from (select * from game.room_chat where room_id = p_room order by id desc limit 100) m join game.players p on p.id = m.player_id);
end $$;

/** removes a seat from a lobby / playing room (game.admin_seat_out) → {result: removed | forfeit, status, needs_tick} */
create or replace function public.rr_admin_kick_room(p_id uuid, p_secret text, p_room uuid, p_target uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_out text; v_r game.rooms;
begin
  perform game.need_admin(p_id, p_secret);
  if p_target = p_id then raise exception 'cannot_kick_self'; end if;
  select * into v_r from game.rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if v_r.status not in ('lobby', 'playing') then raise exception 'room_not_open'; end if;
  if not exists (select 1 from game.room_seats where room_id = p_room and player_id = p_target) then raise exception 'player_not_in_room'; end if;
  v_out := game.admin_seat_out(p_room, p_target, 'admin');
  if v_out = 'none' then raise exception 'seat_finished'; end if;
  perform game.mod(p_id, 'kick_room', p_target, p_room, null, null, jsonb_build_object('result', v_out, 'code', v_r.code));
  select * into v_r from game.rooms where id = p_room;
  return json_build_object('result', v_out, 'status', v_r.status, 'needs_tick', v_r.needs_tick);
end $$;

/** closes an open room: cancelled, end_reason 'admin', nobody ranked (like a cancel vote) → {status: 'cancelled'} */
create or replace function public.rr_admin_close_room(p_id uuid, p_secret text, p_room uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_r game.rooms;
begin
  perform game.need_admin(p_id, p_secret);
  select * into v_r from game.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_r.status not in ('lobby', 'playing') then raise exception 'room_not_open'; end if;
  update game.rooms set status = 'cancelled', end_reason = 'admin', finished_at = now(), deadline = null, needs_tick = false, cancel_votes = '[]'::jsonb where id = p_room;
  perform game.room_event(p_room, 'cancelled', '{"why":"admin"}');
  perform game.room_touch(p_room);
  perform game.mod(p_id, 'close_room', null, p_room, null, null, jsonb_build_object('code', v_r.code, 'was', v_r.status));
  return json_build_object('status', 'cancelled');
end $$;

/** removes a member from a group (the owner too: the oldest member becomes owner, the last one deletes the group). With the groups v2
 *  draft applied, its own path runs (game.group_drop, a ban until the code rotates, the group log). → {removed, group_deleted} */
create or replace function public.rr_admin_remove_from_group(p_id uuid, p_secret text, p_group uuid, p_target uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_g game.groups; v_next uuid; v_gone boolean;
begin
  perform game.need_admin(p_id, p_secret);
  select * into v_g from game.groups where id = p_group for update;
  if not found then raise exception 'group_not_found'; end if;
  if not exists (select 1 from game.group_members where group_id = p_group and player_id = p_target) then raise exception 'member_not_found'; end if;
  if to_regprocedure('game.group_drop(uuid,uuid)') is not null then                        -- groups v2
    execute 'insert into game.group_bans (group_id, player_id, code) values ($1, $2, $3) on conflict (group_id, player_id) do update set code = excluded.code, created_at = now()' using p_group, p_target, v_g.code;
    execute 'insert into game.group_log (group_id, kind, actor, target, data) values ($1, ''removed'', $2, $3, ''{"by":"admin"}''::jsonb)' using p_group, p_id, p_target;
    execute 'select game.group_drop($1, $2)' using p_group, p_target;
  else                                                                                       -- = the live rr_leave_group
    delete from game.group_members where group_id = p_group and player_id = p_target;
    if v_g.owner_id = p_target then
      select player_id into v_next from game.group_members where group_id = p_group order by joined_at limit 1;
      if v_next is null then delete from game.groups where id = p_group; else update game.groups set owner_id = v_next where id = p_group; end if;
    end if;
  end if;
  v_gone := not exists (select 1 from game.groups where id = p_group);
  perform game.mod(p_id, 'remove_group', p_target, null, p_group, null, jsonb_build_object('name', v_g.name, 'group_deleted', v_gone));
  return json_build_object('removed', true, 'group_deleted', v_gone);
end $$;

/** hides a chat message for everyone (kept for the admin until the 7-day purge) → {hidden: true} */
create or replace function public.rr_admin_delete_chat(p_id uuid, p_secret text, p_msg bigint) returns json
language plpgsql security definer set search_path = '' as $$
declare v_m game.room_chat;
begin
  perform game.need_admin(p_id, p_secret);
  select * into v_m from game.room_chat where id = p_msg for update;
  if not found then raise exception 'msg_not_found'; end if;
  if not v_m.hidden then
    update game.room_chat set hidden = true, hidden_by = p_id, hidden_at = now() where id = p_msg;
    perform game.mod(p_id, 'hide_chat', v_m.player_id, v_m.room_id, null, p_msg, null);
  end if;
  return json_build_object('hidden', true);
end $$;

/** reported messages of the last 7 days (most recently reported first, ≤ 50) + who had refused messages in the last 24 h */
create or replace function public.rr_admin_reports(p_id uuid, p_secret text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  return json_build_object(
    'reports', (select coalesce(json_agg(json_build_object('msg_id', m.id, 'room_id', m.room_id, 'room_code', r.code, 'sender_id', m.player_id,
        'sender', p.nickname, 'text', m.text, 'hidden', m.hidden, 'at', game.ms(m.created_at), 'reports', x.n, 'last_report', game.ms(x.last),
        'banned', game.is_banned(m.player_id)) order by x.last desc), '[]'::json)
      from (select msg_id, count(*) as n, max(created_at) as last from game.chat_reports where created_at > now() - interval '7 days' group by msg_id order by max(created_at) desc limit 50) x
      join game.room_chat m on m.id = x.msg_id join game.rooms r on r.id = m.room_id join game.players p on p.id = m.player_id),
    'blocked', (select coalesce(json_agg(json_build_object('player_id', y.player_id, 'nickname', p.nickname, 'n', y.n, 'reasons', y.reasons,
        'banned', game.is_banned(y.player_id)) order by y.n desc), '[]'::json)
      from (select player_id, count(*) as n, array_agg(distinct reason) as reasons from game.chat_blocked where at > now() - interval '1 day'
            group by player_id order by count(*) desc limit 20) y join game.players p on p.id = y.player_id));
end $$;

/** the moderation log, newest first, 50 per page (p_before = the smallest id of the previous page) */
create or replace function public.rr_admin_mod_log(p_id uuid, p_secret text, p_before bigint default null) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.need_admin(p_id, p_secret);
  return (select json_build_object('log', coalesce(json_agg(json_build_object('id', l.id, 'action', l.action, 'admin', a.nickname, 'target_id', l.target_id,
        'target', t.nickname, 'room_id', l.room_id, 'group_id', l.group_id, 'msg_id', l.msg_id, 'data', l.data, 'at', game.ms(l.at)) order by l.id desc), '[]'::json),
      'next_before', case when count(*) = 50 then min(l.id) end)
    from (select * from game.mod_log where p_before is null or id < p_before order by id desc limit 50) l
    left join game.players a on a.id = l.admin_id left join game.players t on t.id = l.target_id);
end $$;

-- ------------------------------------------------------------------ grants: only the public RPCs for the API roles
revoke all on function game.is_banned(uuid), game.need_admin(uuid, text), game.mod(uuid, text, uuid, uuid, uuid, bigint, jsonb), game.mod_log_guard(),
  game.ban_guard(), game.mod_log_claim(), game.mod_log_give(), game.chat_lists(), game.chat_norm(text), game.chat_fold(text), game.chat_check(text),
  game.chat_sweep(), game.chat_member(uuid, uuid), game.chat_refuse(uuid, uuid, text), game.admin_seat_out(uuid, uuid, text) from public;
revoke all on function public.rr_ban_status(uuid, text), public.rr_room_chat_send(uuid, text, uuid, text), public.rr_room_chat_list(uuid, text, uuid, bigint),
  public.rr_room_chat_report(uuid, text, bigint), public.rr_admin_ban(uuid, text, uuid, text, int), public.rr_admin_unban(uuid, text, uuid),
  public.rr_admin_bans(uuid, text), public.rr_admin_player(uuid, text, uuid), public.rr_admin_rooms(uuid, text), public.rr_admin_room_chat(uuid, text, uuid),
  public.rr_admin_kick_room(uuid, text, uuid, uuid), public.rr_admin_close_room(uuid, text, uuid), public.rr_admin_remove_from_group(uuid, text, uuid, uuid),
  public.rr_admin_delete_chat(uuid, text, bigint), public.rr_admin_reports(uuid, text), public.rr_admin_mod_log(uuid, text, bigint) from public;
grant execute on function public.rr_ban_status(uuid, text), public.rr_room_chat_send(uuid, text, uuid, text), public.rr_room_chat_list(uuid, text, uuid, bigint),
  public.rr_room_chat_report(uuid, text, bigint), public.rr_admin_ban(uuid, text, uuid, text, int), public.rr_admin_unban(uuid, text, uuid),
  public.rr_admin_bans(uuid, text), public.rr_admin_player(uuid, text, uuid), public.rr_admin_rooms(uuid, text), public.rr_admin_room_chat(uuid, text, uuid),
  public.rr_admin_kick_room(uuid, text, uuid, uuid), public.rr_admin_close_room(uuid, text, uuid), public.rr_admin_remove_from_group(uuid, text, uuid, uuid),
  public.rr_admin_delete_chat(uuid, text, bigint), public.rr_admin_reports(uuid, text), public.rr_admin_mod_log(uuid, text, bigint) to anon, authenticated;
revoke all on table game.bans, game.mod_log, game.room_chat, game.chat_reports, game.chat_blocked from anon, authenticated;
revoke all on sequence game.mod_log_id_seq, game.room_chat_id_seq from anon, authenticated;

commit;

-- ================================================================== ROLLBACK (run by hand; drops bans, the moderation log and all chat — export first if needed)
-- begin;
-- drop trigger if exists room_seats_ban_guard on game.room_seats;
-- drop trigger if exists group_members_ban_guard on game.group_members;
-- drop trigger if exists admins_mod_log on game.admins;
-- drop trigger if exists energy_gifts_mod_log on game.energy_gifts;
-- drop function if exists public.rr_admin_mod_log(uuid, text, bigint), public.rr_admin_reports(uuid, text), public.rr_admin_delete_chat(uuid, text, bigint),
--   public.rr_admin_remove_from_group(uuid, text, uuid, uuid), public.rr_admin_close_room(uuid, text, uuid), public.rr_admin_kick_room(uuid, text, uuid, uuid),
--   public.rr_admin_room_chat(uuid, text, uuid), public.rr_admin_rooms(uuid, text), public.rr_admin_player(uuid, text, uuid), public.rr_admin_bans(uuid, text),
--   public.rr_admin_unban(uuid, text, uuid), public.rr_admin_ban(uuid, text, uuid, text, int), public.rr_room_chat_report(uuid, text, bigint),
--   public.rr_room_chat_list(uuid, text, uuid, bigint), public.rr_room_chat_send(uuid, text, uuid, text), public.rr_ban_status(uuid, text),
--   game.admin_seat_out(uuid, uuid, text), game.chat_refuse(uuid, uuid, text), game.chat_member(uuid, uuid), game.chat_sweep(), game.chat_check(text),
--   game.chat_fold(text), game.chat_norm(text), game.chat_lists(), game.mod_log_give(), game.mod_log_claim(), game.ban_guard(), game.mod(uuid, text, uuid, uuid, uuid, bigint, jsonb),
--   game.need_admin(uuid, text);
-- drop table if exists game.chat_blocked, game.chat_reports, game.room_chat, game.mod_log, game.bans;
-- drop function if exists game.mod_log_guard(), game.is_banned(uuid);
-- CREATE OR REPLACE FUNCTION game.board(p_challenge uuid, p_weekly text, p_me uuid, p_daily text DEFAULT NULL::text)
--  RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
-- AS $function$
--   select coalesce(json_agg(json_build_object('nickname', nickname, 'status', status, 'months', months,
--            'net_worth', net_worth, 'passive', passive, 'expenses', expenses, 'me', me,
--            'stars', total_stars, 'pawn', pawn, 'progress', progress, 'verified', verified)
--          order by o0, o1, ov, o2, o3 desc, o4 desc, o5), '[]'::json)
--   from (
--     select p.nickname, p.total_stars, p.pawn, r.status, r.months, r.net_worth, r.passive, r.expenses, (r.player_id = p_me) as me,
--       (r.stats->>'progress')::numeric as progress, r.verified,
--       case when r.verified is false then 1 else 0 end as o0,
--       case r.status when 'won' then 0 when 'lost' then 1 else 2 end as o1,
--       case when r.verified is true then 0 else 1 end as ov,
--       case when r.status = 'won' then r.months::numeric
--            else -coalesce((r.stats->>'progress')::numeric, r.passive::numeric / nullif(r.expenses, 0), 0) end as o2,
--       coalesce(r.net_worth, 0) as o3, coalesce(r.passive, 0) as o4, coalesce(r.finished_at, r.started_at) as o5
--     from game.results r join game.players p on p.id = r.player_id
--     where (p_challenge is not null and r.challenge_id = p_challenge)
--        or (p_weekly is not null and r.weekly_key = p_weekly)
--        or (p_daily is not null and r.daily_key = p_daily)
--     order by o0, o1, ov, o2, o3 desc, o4 desc, o5
--     limit 100
--   ) x
-- $function$;
-- create or replace function game.room_purge(p_days int default 30) returns json language plpgsql volatile set search_path = '' as $$
-- declare n_rooms int; n_fails int;
-- begin
--   if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'bad_days'; end if;
--   with d as (delete from game.rooms where status in ('finished', 'cancelled') and coalesce(finished_at, last_activity) < now() - make_interval(days => p_days) returning 1)
--   select count(*) into n_rooms from d;
--   with d as (delete from game.room_join_fails where at < now() - interval '1 day' returning 1)
--   select count(*) into n_fails from d;
--   return json_build_object('rooms', n_rooms, 'join_fails', n_fails, 'older_than_days', p_days);
-- end $$;
-- revoke all on function game.room_purge(int) from public;
-- commit;
