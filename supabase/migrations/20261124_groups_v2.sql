-- NOT APPLIED — needs owner approval.
-- Groups v2 (BRIEF §20, design docs/full-upgrade/research/O1-online-design.md §1.5) on top of supabase/schema/production_baseline.sql.
-- Status: DRAFT. Alters existing tables and replaces existing functions (same signatures, additive JSON keys) → explicit approval.
-- Order: 20261124_groups_v2.sql → 20261124_competitions.sql → 20261124_rooms.sql. Validated offline by tests/sql_drafts.test.mjs
-- (PGlite = real PostgreSQL in WASM; the fake backend tests/fakebackend.py mirrors the same semantics).
--
-- What changes
--   * roles on the membership: owner / admin / member (exactly one owner per group; groups.owner_id stays in sync for old code).
--   * an opaque per-membership HANDLE (uuid) — members are referenced by handle, never by player id (ids appear in ?ref= links) and
--     never by nickname (not unique).
--   * description (≤ 200 chars, plain text — clients render it with esc()), invite_open (pause joining), member_challenges (may plain
--     members create challenges? default true = today's behaviour).
--   * private by default (unchanged: join only by code, members visible to members only); a removed member cannot rejoin with the
--     same code; rotating the code revokes every old link; a revoked/unknown/closed code answers the same group_not_found (no oracle).
--   * join throttle: ≤ 20 failed codes per player per hour → rate_limited.
--   * history: game.group_log + rr_group_history(p_group, p_before) (paginated challenges + membership/role events).
-- Backward compatibility: rr_create_group / rr_join_group / rr_leave_group / rr_group / rr_my_groups / rr_create_challenge2 keep their
-- signatures and every existing JSON key; new keys are additive (v2 clients ignore unknown keys). Existing clients keep working.
-- ROLLBACK: at the bottom of this file (the baseline definitions + drop of the new objects).

begin;

-- ------------------------------------------------------------------ schema
alter table game.groups
  add column if not exists description text not null default '',
  add column if not exists invite_open boolean not null default true,
  add column if not exists member_challenges boolean not null default true,
  add column if not exists code_rotated_at timestamptz;
alter table game.groups add constraint groups_description_check check (char_length(description) <= 200 and description !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]');

alter table game.group_members
  add column if not exists role text not null default 'member',
  add column if not exists handle uuid not null default gen_random_uuid();
alter table game.group_members add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));
update game.group_members m set role = 'owner' from game.groups g where g.id = m.group_id and g.owner_id = m.player_id;
create unique index if not exists group_members_handle_key on game.group_members (handle);
create unique index if not exists group_members_one_owner on game.group_members (group_id) where role = 'owner';

create table if not exists game.group_bans (          -- removed members: blocked until the code is rotated
  group_id uuid not null references game.groups(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, player_id)
);
alter table game.group_bans enable row level security;

create table if not exists game.group_log (            -- membership / role / settings history (members only)
  id bigserial primary key,
  group_id uuid not null references game.groups(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,24}$'),
  actor uuid references game.players(id) on delete set null,
  target uuid references game.players(id) on delete set null,
  data jsonb check (data is null or octet_length(data::text) < 1024),
  at timestamptz not null default now()
);
create index if not exists group_log_group_idx on game.group_log (group_id, at desc);
alter table game.group_log enable row level security;

create table if not exists game.join_fails (           -- failed invite codes (throttle; rows older than 1 h are irrelevant)
  player_id uuid not null references game.players(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists join_fails_idx on game.join_fails (player_id, at);
alter table game.join_fails enable row level security;

-- ------------------------------------------------------------------ helpers (not exposed: no EXECUTE for anon/authenticated)
create or replace function game.group_role(p_group uuid, p_player uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from game.group_members where group_id = p_group and player_id = p_player
$$;
/**
 * A failed invite code must be COUNTED (throttle) and still answer exactly like the old `raise exception 'group_not_found'`
 * (HTTP 400, body {code:'P0001', message, details, hint}). A raise would roll the throttle row back, so this records the failure,
 * sets PostgREST's response status to 400 and RETURNS the PostgREST error body. [verify live] that PostgREST commits a function that
 * sets response.status ≥ 400; if it rolls back, the throttle is a no-op (never worse than today) and the answer is unchanged.
 */
create or replace function game.fail_committed(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(current_setting('rr.player', true), '')::uuid;
begin
  if v_id is not null then insert into game.join_fails (player_id) values (v_id); end if;
  perform set_config('response.status', '400', true);
  return json_build_object('code', 'P0001', 'message', p_code, 'details', null, 'hint', null);
end $$;
/** raises not_member / not_allowed unless the caller has one of the roles. */
create or replace function game.group_need(p_group uuid, p_player uuid, p_roles text[]) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := game.group_role(p_group, p_player);
begin
  if v_role is null then raise exception 'not_member'; end if;
  if not (v_role = any(p_roles)) then raise exception 'not_allowed'; end if;
  return v_role;
end $$;
create or replace function game.group_out(p_group uuid, p_me uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'is_owner', g.owner_id = p_me,
    'members', (select count(*) from game.group_members m where m.group_id = g.id),
    'active', (select count(*) from game.challenges c where c.group_id = g.id and now() between c.starts_at and c.ends_at),
    'description', g.description, 'my_role', game.group_role(g.id, p_me), 'invite_open', g.invite_open, 'member_challenges', g.member_challenges)
  from game.groups g where g.id = p_group
$$;
create or replace function game.group_member_by_handle(p_group uuid, p_handle uuid) returns game.group_members
language plpgsql stable security definer set search_path = '' as $$
declare v game.group_members;
begin
  select * into v from game.group_members where group_id = p_group and handle = p_handle;
  if not found then raise exception 'member_not_found'; end if;
  return v;
end $$;
/** remove a membership; the owner leaving hands the group to the oldest admin, else the oldest member; the last one deletes it. */
create or replace function game.group_drop(p_group uuid, p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_next uuid;
begin
  delete from game.group_members where group_id = p_group and player_id = p_player returning role into v_role;
  if v_role is null then return; end if;
  if not exists (select 1 from game.group_members where group_id = p_group) then delete from game.groups where id = p_group; return; end if;
  if v_role = 'owner' then
    select player_id into v_next from game.group_members where group_id = p_group
      order by (role = 'admin') desc, joined_at, player_id limit 1;
    update game.group_members set role = 'owner' where group_id = p_group and player_id = v_next;
    update game.groups set owner_id = v_next where id = p_group;
    insert into game.group_log (group_id, kind, actor, target, data) values (p_group, 'owner', p_player, v_next, '{"auto":true}');
  end if;
end $$;

-- ------------------------------------------------------------------ existing RPCs (same signatures, additive keys)
create or replace function public.rr_create_group(p_id uuid, p_secret text, p_name text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(p_name); v_g game.groups;
begin
  perform game.auth(p_id, p_secret);
  if v_name is null or char_length(v_name) not between 2 and 40 then raise exception 'bad_name'; end if;
  if (select count(*) from game.groups where owner_id = p_id) >= 20 then raise exception 'too_many_groups'; end if;
  insert into game.groups(code, name, owner_id) values (game.new_code(), v_name, p_id) returning * into v_g;
  insert into game.group_members(group_id, player_id, role) values (v_g.id, p_id, 'owner');
  insert into game.group_log (group_id, kind, actor) values (v_g.id, 'created', p_id);
  return json_build_object('id', v_g.id, 'code', v_g.code, 'name', v_g.name);
end $$;

create or replace function public.rr_join_group(p_id uuid, p_secret text, p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_g game.groups; v_code text := upper(btrim(left(coalesce(p_code, ''), 32)));
begin
  perform game.auth(p_id, p_secret);
  if (select count(*) from game.join_fails where player_id = p_id and at > now() - interval '1 hour') >= 20 then raise exception 'rate_limited'; end if;
  perform set_config('rr.player', p_id::text, true);
  select * into v_g from game.groups where code = v_code for update;
  if found and exists (select 1 from game.group_members where group_id = v_g.id and player_id = p_id) then
    return json_build_object('id', v_g.id, 'code', v_g.code, 'name', v_g.name);               -- idempotent for members
  end if;
  -- unknown code, rotated (revoked) code, closed invite, or a removed member with the same code: ONE answer (no oracle)
  if not found or not v_g.invite_open or exists (select 1 from game.group_bans b where b.group_id = v_g.id and b.player_id = p_id and b.code = v_g.code) then
    return game.fail_committed('group_not_found');                 -- the throttle row must survive: see game.fail_committed
  end if;
  if (select count(*) from game.group_members where group_id = v_g.id) >= 50 then raise exception 'group_full'; end if;
  insert into game.group_members(group_id, player_id) values (v_g.id, p_id);
  delete from game.group_bans where group_id = v_g.id and player_id = p_id;
  insert into game.group_log (group_id, kind, actor) values (v_g.id, 'joined', p_id);
  return json_build_object('id', v_g.id, 'code', v_g.code, 'name', v_g.name);
end $$;

create or replace function public.rr_leave_group(p_id uuid, p_secret text, p_group uuid) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  if not exists (select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  perform 1 from game.groups where id = p_group for update;
  insert into game.group_log (group_id, kind, actor) values (p_group, 'left', p_id);
  perform game.group_drop(p_group, p_id);
  return json_build_object('ok', true);
end $$;

create or replace function public.rr_my_groups(p_id uuid, p_secret text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  return (select coalesce(json_agg(game.group_out(g.id, p_id) order by m.joined_at desc), '[]'::json)
    from game.group_members m join game.groups g on g.id = m.group_id where m.player_id = p_id);
end $$;

create or replace function public.rr_group(p_id uuid, p_secret text, p_group uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  return (select json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'is_owner', g.owner_id = p_id,
    'description', g.description, 'my_role', game.group_role(g.id, p_id), 'invite_open', g.invite_open, 'member_challenges', g.member_challenges,
    'members', (select coalesce(json_agg(json_build_object('nickname', p.nickname, 'owner', m.role = 'owner', 'me', p.id = p_id,
                   'stars', p.total_stars, 'pawn', p.pawn, 'role', m.role, 'handle', m.handle) order by m.joined_at), '[]'::json)
                from game.group_members m join game.players p on p.id = m.player_id where m.group_id = g.id),
    'challenges', (select coalesce(json_agg(json_build_object('id', c.id, 'title', c.title, 'profession', c.profession, 'world', c.world,
                     'starts_at', c.starts_at, 'ends_at', c.ends_at, 'active', now() between c.starts_at and c.ends_at,
                     'my_status', (select r.status from game.results r where r.challenge_id = c.id and r.player_id = p_id),
                     'board', game.board(c.id, null, p_id)) order by c.created_at desc), '[]'::json)
                   from (select * from game.challenges where group_id = g.id order by created_at desc limit 20) c))
    from game.groups g where g.id = p_group);
end $$;

create or replace function public.rr_create_challenge2(p_id uuid, p_secret text, p_group uuid, p_title text, p_world text, p_char text, p_days integer) returns json
language plpgsql security definer set search_path = '' as $$
declare v_c game.challenges; v_title text := btrim(p_title);
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  if not (select member_challenges from game.groups where id = p_group) then perform game.group_need(p_group, p_id, array['owner','admin']); end if;
  if v_title is null or char_length(v_title) not between 2 and 50 then raise exception 'bad_title'; end if;
  if p_world not in ('w1','w2','w3','w4') then raise exception 'bad_world'; end if;
  if p_char is null or p_char !~ '^[a-z0-9_]{1,24}$' then raise exception 'bad_profession'; end if;
  if p_days is null or p_days not between 1 and 30 then raise exception 'bad_days'; end if;
  if (select count(*) from game.challenges where group_id = p_group and ends_at > now()) >= 5 then raise exception 'too_many_challenges'; end if;
  insert into game.challenges(group_id, title, profession, world, seed, ends_at, created_by)
  values (p_group, v_title, p_char, p_world, floor(random() * 2147483646)::bigint + 1, now() + make_interval(days => p_days), p_id)
  returning * into v_c;
  return json_build_object('id', v_c.id);
end $$;

-- ------------------------------------------------------------------ new RPCs
create or replace function public.rr_group_update(p_id uuid, p_secret text, p_group uuid, p_name text, p_description text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(p_name); v_desc text := btrim(p_description);
begin
  perform game.auth(p_id, p_secret);
  perform game.group_need(p_group, p_id, array['owner','admin']);
  if v_name is null or char_length(v_name) not between 2 and 40 then raise exception 'bad_name'; end if;
  if v_desc is not null and (char_length(v_desc) > 200 or v_desc ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]') then raise exception 'bad_description'; end if;
  update game.groups set name = v_name, description = coalesce(v_desc, description) where id = p_group;
  insert into game.group_log (group_id, kind, actor) values (p_group, 'updated', p_id);
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_set_role(p_id uuid, p_secret text, p_group uuid, p_member uuid, p_role text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_t game.group_members;
begin
  perform game.auth(p_id, p_secret);
  perform game.group_need(p_group, p_id, array['owner']);
  v_t := game.group_member_by_handle(p_group, p_member);
  if p_role not in ('admin', 'member') then raise exception 'bad_role'; end if;
  if v_t.role = 'owner' then raise exception 'not_allowed'; end if;
  update game.group_members set role = p_role where group_id = p_group and player_id = v_t.player_id;
  insert into game.group_log (group_id, kind, actor, target, data) values (p_group, 'role', p_id, v_t.player_id, json_build_object('role', p_role)::jsonb);
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_transfer(p_id uuid, p_secret text, p_group uuid, p_member uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_t game.group_members;
begin
  perform game.auth(p_id, p_secret);
  perform game.group_need(p_group, p_id, array['owner']);
  perform 1 from game.groups where id = p_group for update;
  v_t := game.group_member_by_handle(p_group, p_member);
  if v_t.player_id = p_id then raise exception 'not_allowed'; end if;
  update game.group_members set role = 'admin' where group_id = p_group and player_id = p_id;      -- the old owner stays admin
  update game.group_members set role = 'owner' where group_id = p_group and player_id = v_t.player_id;
  update game.groups set owner_id = v_t.player_id where id = p_group;
  insert into game.group_log (group_id, kind, actor, target) values (p_group, 'owner', p_id, v_t.player_id);
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_remove(p_id uuid, p_secret text, p_group uuid, p_member uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_me text; v_t game.group_members;
begin
  perform game.auth(p_id, p_secret);
  v_me := game.group_need(p_group, p_id, array['owner','admin']);
  v_t := game.group_member_by_handle(p_group, p_member);
  -- owner removes anyone but himself; an admin removes plain members only. Results stay on every board.
  if v_t.player_id = p_id or not (v_me = 'owner' or v_t.role = 'member') then raise exception 'not_allowed'; end if;
  insert into game.group_bans (group_id, player_id, code) select p_group, v_t.player_id, code from game.groups where id = p_group
    on conflict (group_id, player_id) do update set code = excluded.code, created_at = now();
  insert into game.group_log (group_id, kind, actor, target) values (p_group, 'removed', p_id, v_t.player_id);
  perform game.group_drop(p_group, v_t.player_id);
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_rotate_code(p_id uuid, p_secret text, p_group uuid) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  perform game.group_need(p_group, p_id, array['owner','admin']);
  update game.groups set code = game.new_code(), code_rotated_at = now() where id = p_group;
  delete from game.group_bans where group_id = p_group;            -- bans are tied to the old code
  insert into game.group_log (group_id, kind, actor) values (p_group, 'code_rotated', p_id);
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_settings(p_id uuid, p_secret text, p_group uuid, p_invite_open boolean default null, p_member_challenges boolean default null) returns json
language plpgsql security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  perform game.group_need(p_group, p_id, array['owner','admin']);
  update game.groups set invite_open = coalesce(p_invite_open, invite_open), member_challenges = coalesce(p_member_challenges, member_challenges) where id = p_group;
  insert into game.group_log (group_id, kind, actor, data)
    select p_group, 'settings', p_id, json_build_object('invite_open', invite_open, 'member_challenges', member_challenges)::jsonb from game.groups where id = p_group;
  return game.group_out(p_group, p_id);
end $$;

create or replace function public.rr_group_history(p_id uuid, p_secret text, p_group uuid, p_before timestamptz default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_cs json; v_last timestamptz; v_n int;
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  select coalesce(json_agg(json_build_object('id', c.id, 'title', c.title, 'profession', c.profession, 'world', c.world, 'starts_at', c.starts_at,
           'ends_at', c.ends_at, 'created_at', c.created_at, 'board', game.board(c.id, null, p_id)) order by c.created_at desc), '[]'::json),
         min(c.created_at), count(*)
    into v_cs, v_last, v_n
    from (select * from game.challenges where group_id = p_group and (p_before is null or created_at < p_before) order by created_at desc limit 20) c;
  return json_build_object('challenges', v_cs, 'next_before', case when v_n = 20 then v_last end,
    'log', (select coalesce(json_agg(json_build_object('kind', l.kind, 'actor', a.nickname, 'target', t.nickname, 'data', l.data, 'at', l.at) order by l.at desc), '[]'::json)
            from (select * from game.group_log where group_id = p_group and (p_before is null or at < p_before) order by at desc limit 50) l
            left join game.players a on a.id = l.actor left join game.players t on t.id = l.target));
end $$;

-- ------------------------------------------------------------------ grants (the deny-all model: only rr_* are callable)
revoke all on function game.fail_committed(text), game.group_role(uuid, uuid), game.group_need(uuid, uuid, text[]), game.group_out(uuid, uuid),
  game.group_member_by_handle(uuid, uuid), game.group_drop(uuid, uuid) from public;
revoke all on function public.rr_group_update(uuid, text, uuid, text, text), public.rr_group_set_role(uuid, text, uuid, uuid, text),
  public.rr_group_transfer(uuid, text, uuid, uuid), public.rr_group_remove(uuid, text, uuid, uuid), public.rr_group_rotate_code(uuid, text, uuid),
  public.rr_group_settings(uuid, text, uuid, boolean, boolean), public.rr_group_history(uuid, text, uuid, timestamptz) from public;
grant execute on function public.rr_group_update(uuid, text, uuid, text, text), public.rr_group_set_role(uuid, text, uuid, uuid, text),
  public.rr_group_transfer(uuid, text, uuid, uuid), public.rr_group_remove(uuid, text, uuid, uuid), public.rr_group_rotate_code(uuid, text, uuid),
  public.rr_group_settings(uuid, text, uuid, boolean, boolean), public.rr_group_history(uuid, text, uuid, timestamptz) to anon, authenticated;

commit;

-- ================================================================== ROLLBACK (run by hand; restores the baseline behaviour)
-- begin;
-- drop function if exists public.rr_group_update(uuid, text, uuid, text, text), public.rr_group_set_role(uuid, text, uuid, uuid, text),
--   public.rr_group_transfer(uuid, text, uuid, uuid), public.rr_group_remove(uuid, text, uuid, uuid), public.rr_group_rotate_code(uuid, text, uuid),
--   public.rr_group_settings(uuid, text, uuid, boolean, boolean), public.rr_group_history(uuid, text, uuid, timestamptz);
-- -- re-create rr_create_group, rr_join_group, rr_leave_group, rr_my_groups, rr_group, rr_create_challenge2 VERBATIM from
-- -- supabase/schema/production_baseline.sql (their baseline bodies do not reference any v2 column), then:
-- drop function if exists game.fail_committed(text), game.group_drop(uuid, uuid), game.group_member_by_handle(uuid, uuid), game.group_out(uuid, uuid),
--   game.group_need(uuid, uuid, text[]), game.group_role(uuid, uuid);
-- drop table if exists game.join_fails, game.group_log, game.group_bans;
-- drop index if exists game.group_members_one_owner; drop index if exists game.group_members_handle_key;
-- alter table game.group_members drop constraint if exists group_members_role_check, drop column if exists handle, drop column if exists role;
-- alter table game.groups drop constraint if exists groups_description_check, drop column if exists code_rotated_at,
--   drop column if exists member_challenges, drop column if exists invite_open, drop column if exists description;
-- commit;
