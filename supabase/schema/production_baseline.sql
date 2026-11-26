-- READ-ONLY snapshot of the production schema `game` + public rr_* functions (Supabase project xvqaxphyfqdzkddmoosu),
-- taken 2026-11-23 with catalog queries (pg_get_functiondef / pg_get_constraintdef / pg_indexes). No data, no secrets.
-- Purpose: the baseline that new migrations (groups v2, competitions, rooms) are written and reviewed against, and the
-- source for tests/fakebackend.py parity. Grants: every public rr_* function is EXECUTE for anon+authenticated; game.* is not
-- callable through REST (tests/backend_contract.mjs). All tables have RLS enabled and no policies (access only via SECURITY DEFINER).

create table game.admin_setup (
  id integer not null default 1,
  code_hash bytea not null,
  used_at timestamp with time zone,
  constraint admin_setup_id_check CHECK ((id = 1)),
  constraint admin_setup_pkey PRIMARY KEY (id)
);
alter table game.admin_setup enable row level security;

create table game.admins (
  player_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint admins_pkey PRIMARY KEY (player_id),
  constraint admins_player_id_fkey FOREIGN KEY (player_id) REFERENCES game.players(id) ON DELETE CASCADE
);
alter table game.admins enable row level security;

create table game.challenges (
  id uuid not null default gen_random_uuid(),
  group_id uuid not null,
  title text not null,
  profession text not null,
  seed bigint not null,
  starts_at timestamp with time zone not null default now(),
  ends_at timestamp with time zone not null,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  world text not null default 'w1'::text,
  constraint challenges_char_check CHECK ((profession ~ '^[a-z0-9_:]{1,24}$'::text)),
  constraint challenges_created_by_fkey FOREIGN KEY (created_by) REFERENCES game.players(id) ON DELETE SET NULL,
  constraint challenges_group_id_fkey FOREIGN KEY (group_id) REFERENCES game.groups(id) ON DELETE CASCADE,
  constraint challenges_pkey PRIMARY KEY (id),
  constraint challenges_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 50))),
  constraint challenges_world_check CHECK ((world = ANY (ARRAY['w1'::text, 'w2'::text, 'w3'::text, 'w4'::text])))
);
CREATE INDEX challenges_group_idx ON game.challenges USING btree (group_id);
alter table game.challenges enable row level security;

create table game.energy_gifts (
  id uuid not null default gen_random_uuid(),
  from_id uuid,
  to_id uuid not null,
  kind text not null,
  amount integer not null,
  day date not null default ((now() AT TIME ZONE 'Asia/Jerusalem'::text))::date,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint energy_gifts_amount_check CHECK (((amount >= 1) AND ((amount <= 20) OR ((kind = 'admin'::text) AND (amount <= 99))))),
  constraint energy_gifts_from_id_fkey FOREIGN KEY (from_id) REFERENCES game.players(id) ON DELETE CASCADE,
  constraint energy_gifts_kind_check CHECK ((kind = ANY (ARRAY['gift'::text, 'referral'::text, 'admin'::text]))),
  constraint energy_gifts_pkey PRIMARY KEY (id),
  constraint energy_gifts_to_id_fkey FOREIGN KEY (to_id) REFERENCES game.players(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX energy_gift_once_a_day ON game.energy_gifts USING btree (from_id, to_id, day) WHERE (kind = 'gift'::text);
CREATE INDEX energy_gifts_to_idx ON game.energy_gifts USING btree (to_id) WHERE (claimed_at IS NULL);
alter table game.energy_gifts enable row level security;

create table game.events (
  id bigint not null default nextval('game.events_id_seq'::regclass),
  player_id uuid not null,
  kind text not null,
  data jsonb,
  created_at timestamp with time zone not null default now(),
  constraint events_kind_check CHECK ((kind ~ '^[a-z0-9_]{1,30}$'::text)),
  constraint events_pkey PRIMARY KEY (id),
  constraint events_player_id_fkey FOREIGN KEY (player_id) REFERENCES game.players(id) ON DELETE CASCADE
);
CREATE INDEX events_player_idx ON game.events USING btree (player_id, created_at DESC);
alter table game.events enable row level security;

create table game.group_members (
  group_id uuid not null,
  player_id uuid not null,
  joined_at timestamp with time zone not null default now(),
  constraint group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES game.groups(id) ON DELETE CASCADE,
  constraint group_members_pkey PRIMARY KEY (group_id, player_id),
  constraint group_members_player_id_fkey FOREIGN KEY (player_id) REFERENCES game.players(id) ON DELETE CASCADE
);
CREATE INDEX group_members_player_idx ON game.group_members USING btree (player_id);
alter table game.group_members enable row level security;

create table game.groups (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  owner_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint groups_code_key UNIQUE (code),
  constraint groups_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 40))),
  constraint groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES game.players(id) ON DELETE CASCADE,
  constraint groups_pkey PRIMARY KEY (id)
);
alter table game.groups enable row level security;

create table game.players (
  id uuid not null default gen_random_uuid(),
  nickname text not null,
  secret_hash bytea not null,
  created_at timestamp with time zone not null default now(),
  stars jsonb not null default '{}'::jsonb,
  total_stars integer not null default 0,
  achievements text[] not null default '{}'::text[],
  pawn text not null default 'classic'::text,
  daily_streak integer not null default 0,
  best_streak integer not null default 0,
  last_daily date,
  meta jsonb not null default '{}'::jsonb,
  referred_by uuid,
  constraint players_nickname_check CHECK (((char_length(nickname) >= 2) AND (char_length(nickname) <= 20))),
  constraint players_pkey PRIMARY KEY (id),
  constraint players_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES game.players(id) ON DELETE SET NULL
);
alter table game.players enable row level security;

create table game.results (
  id uuid not null default gen_random_uuid(),
  player_id uuid not null,
  challenge_id uuid,
  weekly_key text,
  profession text not null,
  status text not null default 'playing'::text,
  months integer,
  passive integer,
  expenses integer,
  net_worth integer,
  stats jsonb,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  world text not null default 'w1'::text,
  daily_key text,
  checkpoint jsonb,
  checkpoint_turn integer not null default 0,
  verified boolean,
  verify_error text,
  actions_hash text,
  verified_at timestamp with time zone,
  verify_attempts integer not null default 0,
  verified_result jsonb,
  constraint results_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES game.challenges(id) ON DELETE CASCADE,
  constraint results_one_mode CHECK ((num_nonnulls(challenge_id, weekly_key, daily_key) = 1)),
  constraint results_pkey PRIMARY KEY (id),
  constraint results_player_id_fkey FOREIGN KEY (player_id) REFERENCES game.players(id) ON DELETE CASCADE,
  constraint results_status_check CHECK ((status = ANY (ARRAY['playing'::text, 'won'::text, 'lost'::text])))
);
CREATE UNIQUE INDEX results_one_per_challenge ON game.results USING btree (player_id, challenge_id) WHERE (challenge_id IS NOT NULL);
CREATE UNIQUE INDEX results_one_per_week ON game.results USING btree (player_id, weekly_key) WHERE (weekly_key IS NOT NULL);
CREATE INDEX results_challenge_idx ON game.results USING btree (challenge_id);
CREATE INDEX results_weekly_idx ON game.results USING btree (weekly_key);
CREATE UNIQUE INDEX results_one_per_day ON game.results USING btree (player_id, daily_key) WHERE (daily_key IS NOT NULL);
CREATE INDEX results_daily_idx ON game.results USING btree (daily_key);
alter table game.results enable row level security;

CREATE OR REPLACE FUNCTION game.auth(p_id uuid, p_secret text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  if p_id is null or p_secret is null or not exists(
     select 1 from game.players where id = p_id and secret_hash = extensions.digest(p_secret, 'sha256')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end $function$;

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
    where (p_challenge is not null and r.challenge_id = p_challenge)
       or (p_weekly is not null and r.weekly_key = p_weekly)
       or (p_daily is not null and r.daily_key = p_daily)
    order by o0, o1, ov, o2, o3 desc, o4 desc, o5
    limit 100
  ) x
$function$;

CREATE OR REPLACE FUNCTION game.day()
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date as dt),
       k as (select dt, 'D' || to_char(dt, 'YYYY-MM-DD') as key from d),
       s as (select dt, key, abs(hashtext('ratrace-daily-' || key))::bigint as seed from k)
  select json_build_object('key', key, 'seed', seed, 'date', dt,
    'world', (array['w1','w2','w1','w3','w1','w4','w2'])[1 + extract(dow from dt)::int],
    'char_index', (seed % 3)::int,
    'max_months', 24,
    'ends_at', ((dt + 1)::timestamp) at time zone 'Asia/Jerusalem')
  from s
$function$;

CREATE OR REPLACE FUNCTION game.is_admin(p_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ select exists(select 1 from game.admins where player_id = p_id) $function$;

CREATE OR REPLACE FUNCTION game.new_code()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists(select 1 from game.groups where code = c);
  end loop;
  return c;
end $function$;

CREATE OR REPLACE FUNCTION game.week()
 RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with k as (select to_char(now() at time zone 'Asia/Jerusalem', 'IYYY-"W"IW') as key,
                    extract(week from now() at time zone 'Asia/Jerusalem')::int as wk),
       s as (select key, wk, abs(hashtext('ratrace-' || key))::bigint as seed from k)
  select json_build_object('key', key, 'seed', seed,
    'world', case when wk % 2 = 0 then 'w1' else 'w2' end,
    'char_index', (seed % 3)::int,
    'profession', (array['teacher','driver','dev','doctor'])[1 + (seed % 4)::int],
    'ends_at', (date_trunc('week', now() at time zone 'Asia/Jerusalem') + interval '7 days') at time zone 'Asia/Jerusalem')
  from s
$function$;

-- public.rr_admin_* : see supabase/migrations/20261123_admin.sql (identical bodies).

CREATE OR REPLACE FUNCTION public.rr_begin(p_id uuid, p_secret text, p_mode text, p_challenge uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_c game.challenges; v_r game.results; j json; v_today date;
begin
  perform game.auth(p_id, p_secret);
  if p_mode = 'challenge' then
    select * into v_c from game.challenges where id = p_challenge;
    if not found then raise exception 'challenge_not_found'; end if;
    if not exists(select 1 from game.group_members where group_id = v_c.group_id and player_id = p_id) then raise exception 'not_member'; end if;
    if now() not between v_c.starts_at and v_c.ends_at then raise exception 'challenge_closed'; end if;
    select * into v_r from game.results where challenge_id = v_c.id and player_id = p_id;
    if not found then
      insert into game.results(player_id, challenge_id, profession, world) values (p_id, v_c.id, v_c.profession, v_c.world) returning * into v_r;
    end if;
    return json_build_object('result_id', v_r.id, 'status', v_r.status, 'seed', v_c.seed, 'world', v_c.world,
      'char', v_c.profession, 'char_index', null, 'max_months', null, 'title', v_c.title, 'group_id', v_c.group_id,
      'checkpoint_turn', v_r.checkpoint_turn, 'checkpoint', v_r.checkpoint);
  elsif p_mode = 'weekly' then
    j := game.week();
    select * into v_r from game.results where weekly_key = j->>'key' and player_id = p_id;
    if not found then
      insert into game.results(player_id, weekly_key, profession, world) values (p_id, j->>'key', 'idx:' || (j->>'char_index'), j->>'world') returning * into v_r;
    end if;
  elsif p_mode = 'daily' then
    j := game.day(); v_today := (j->>'date')::date;
    select * into v_r from game.results where daily_key = j->>'key' and player_id = p_id;
    if not found then
      insert into game.results(player_id, daily_key, profession, world) values (p_id, j->>'key', 'idx:' || (j->>'char_index'), j->>'world') returning * into v_r;
      update game.players set
        daily_streak = case when last_daily = v_today - 1 then daily_streak + 1 when last_daily = v_today then daily_streak else 1 end,
        last_daily = v_today
      where id = p_id;
      update game.players set best_streak = greatest(best_streak, daily_streak) where id = p_id;
    end if;
  else
    raise exception 'bad_mode';
  end if;
  -- the world/char of an existing attempt is what was recorded when it started
  return json_build_object('result_id', v_r.id, 'status', v_r.status, 'seed', (j->>'seed')::bigint, 'world', v_r.world,
    'char', null, 'char_index', case when v_r.profession like 'idx:%' then substr(v_r.profession, 5)::int else (j->>'char_index')::int end,
    'max_months', (j->>'max_months')::int, 'title', null, 'group_id', null,
    'streak', (select daily_streak from game.players where id = p_id),
    'checkpoint_turn', v_r.checkpoint_turn, 'checkpoint', v_r.checkpoint);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_checkpoint(p_id uuid, p_secret text, p_result uuid, p_turn integer, p_state jsonb)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_r game.results;
begin
  perform game.auth(p_id, p_secret);
  select * into v_r from game.results where id = p_result and player_id = p_id for update;
  if not found then raise exception 'result_not_found'; end if;
  if v_r.status <> 'playing' then raise exception 'already_finished'; end if;
  if p_turn is null or p_turn < 0 or p_turn > 2000 then raise exception 'bad_turn'; end if;
  if pg_column_size(p_state) > 300000 then raise exception 'state_too_big'; end if;
  if p_turn < v_r.checkpoint_turn then raise exception 'stale_checkpoint'; end if;
  update game.results set checkpoint = p_state, checkpoint_turn = p_turn where id = p_result;
  return json_build_object('ok', true, 'turn', p_turn);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_claim_energy(p_id uuid, p_secret text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_total int; v_from json;
begin
  perform game.auth(p_id, p_secret);
  with c as (update game.energy_gifts set claimed_at = now() where to_id = p_id and claimed_at is null returning from_id, kind, amount)
  select coalesce(sum(amount), 0), coalesce(json_agg(json_build_object('nickname', p.nickname, 'kind', c.kind, 'amount', c.amount)), '[]'::json)
    into v_total, v_from from c left join game.players p on p.id = c.from_id;
  return json_build_object('total', v_total, 'from', v_from);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_create_challenge(p_id uuid, p_secret text, p_group uuid, p_title text, p_profession text, p_days integer)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_c game.challenges; v_title text := btrim(p_title);
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  if v_title is null or char_length(v_title) not between 2 and 50 then raise exception 'bad_title'; end if;
  if p_profession not in ('teacher','driver','dev','doctor') then raise exception 'bad_profession'; end if;
  if p_days is null or p_days not between 1 and 30 then raise exception 'bad_days'; end if;
  if (select count(*) from game.challenges where group_id = p_group and ends_at > now()) >= 5 then raise exception 'too_many_challenges'; end if;
  insert into game.challenges(group_id, title, profession, seed, ends_at, created_by)
  values (p_group, v_title, p_profession, floor(random() * 2147483646)::bigint + 1, now() + make_interval(days => p_days), p_id)
  returning * into v_c;
  return json_build_object('id', v_c.id);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_create_challenge2(p_id uuid, p_secret text, p_group uuid, p_title text, p_world text, p_char text, p_days integer)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_c game.challenges; v_title text := btrim(p_title);
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  if v_title is null or char_length(v_title) not between 2 and 50 then raise exception 'bad_title'; end if;
  if p_world not in ('w1','w2','w3','w4') then raise exception 'bad_world'; end if;
  if p_char is null or p_char !~ '^[a-z0-9_]{1,24}$' then raise exception 'bad_profession'; end if;
  if p_days is null or p_days not between 1 and 30 then raise exception 'bad_days'; end if;
  if (select count(*) from game.challenges where group_id = p_group and ends_at > now()) >= 5 then raise exception 'too_many_challenges'; end if;
  insert into game.challenges(group_id, title, profession, world, seed, ends_at, created_by)
  values (p_group, v_title, p_char, p_world, floor(random() * 2147483646)::bigint + 1, now() + make_interval(days => p_days), p_id)
  returning * into v_c;
  return json_build_object('id', v_c.id);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_create_group(p_id uuid, p_secret text, p_name text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_name text := btrim(p_name); v_g game.groups;
begin
  perform game.auth(p_id, p_secret);
  if v_name is null or char_length(v_name) not between 2 and 40 then raise exception 'bad_name'; end if;
  if (select count(*) from game.groups where owner_id = p_id) >= 20 then raise exception 'too_many_groups'; end if;
  insert into game.groups(code, name, owner_id) values (game.new_code(), v_name, p_id) returning * into v_g;
  insert into game.group_members(group_id, player_id) values (v_g.id, p_id);
  return json_build_object('id', v_g.id, 'code', v_g.code, 'name', v_g.name);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_daily(p_id uuid, p_secret text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare d json := game.day();
begin
  perform game.auth(p_id, p_secret);
  return json_build_object('key', d->>'key', 'world', d->>'world', 'char_index', (d->>'char_index')::int,
    'max_months', (d->>'max_months')::int, 'ends_at', d->>'ends_at',
    'my_status', (select status from game.results where daily_key = d->>'key' and player_id = p_id),
    'streak', (select case when last_daily >= (d->>'date')::date - 1 then daily_streak else 0 end from game.players where id = p_id),
    'board', game.board(null, null, p_id, d->>'key'));
end $function$;

CREATE OR REPLACE FUNCTION public.rr_finish(p_id uuid, p_secret text, p_result uuid, p_status text, p_months integer, p_passive integer, p_expenses integer, p_net_worth integer, p_stats jsonb)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_r game.results; v_end timestamptz;
begin
  perform game.auth(p_id, p_secret);
  select * into v_r from game.results where id = p_result and player_id = p_id for update;
  if not found then raise exception 'result_not_found'; end if;
  if v_r.status <> 'playing' then raise exception 'already_finished'; end if;
  if p_status not in ('won','lost') then raise exception 'bad_status'; end if;
  if p_months is null or p_months not between 1 and 200 then raise exception 'bad_months'; end if;
  if p_passive not between -100000000 and 100000000 or p_expenses not between 0 and 100000000
     or p_net_worth not between -2000000000 and 2000000000 then raise exception 'bad_values'; end if;
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

CREATE OR REPLACE FUNCTION public.rr_group(p_id uuid, p_secret text, p_group uuid)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  return (select json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'is_owner', g.owner_id = p_id,
    'members', (select coalesce(json_agg(json_build_object('nickname', p.nickname, 'owner', p.id = g.owner_id, 'me', p.id = p_id,
                   'stars', p.total_stars, 'pawn', p.pawn) order by m.joined_at), '[]'::json)
                from game.group_members m join game.players p on p.id = m.player_id where m.group_id = g.id),
    'challenges', (select coalesce(json_agg(json_build_object('id', c.id, 'title', c.title, 'profession', c.profession, 'world', c.world,
                     'starts_at', c.starts_at, 'ends_at', c.ends_at, 'active', now() between c.starts_at and c.ends_at,
                     'my_status', (select r.status from game.results r where r.challenge_id = c.id and r.player_id = p_id),
                     'board', game.board(c.id, null, p_id)) order by c.created_at desc), '[]'::json)
                   from (select * from game.challenges where group_id = g.id order by created_at desc limit 20) c))
    from game.groups g where g.id = p_group);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_group_feed(p_id uuid, p_secret text, p_group uuid)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  return json_build_object(
    'feed', (select coalesce(json_agg(x order by x.at desc), '[]'::json) from (
        select p.nickname, e.kind, e.data, e.created_at as at, (p.id = p_id) as me
          from game.events e join game.players p on p.id = e.player_id
          join game.group_members m on m.player_id = e.player_id and m.group_id = p_group
          where e.created_at > now() - interval '14 days'
        union all
        select p.nickname, 'ranked_' || r.status, json_build_object('world', r.world, 'months', r.months,
               'mode', case when r.daily_key is not null then 'daily' when r.weekly_key is not null then 'weekly' else 'challenge' end)::jsonb,
               r.finished_at, (p.id = p_id)
          from game.results r join game.players p on p.id = r.player_id
          join game.group_members m on m.player_id = r.player_id and m.group_id = p_group
          where r.finished_at > now() - interval '14 days'
        order by 4 desc limit 40) x),
    'gifted_today', (select coalesce(json_agg(p.nickname), '[]'::json) from game.energy_gifts g join game.players p on p.id = g.to_id
        where g.from_id = p_id and g.kind = 'gift' and g.day = (now() at time zone 'Asia/Jerusalem')::date));
end $function$;

CREATE OR REPLACE FUNCTION public.rr_join_group(p_id uuid, p_secret text, p_code text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_g game.groups;
begin
  perform game.auth(p_id, p_secret);
  select * into v_g from game.groups where code = upper(btrim(p_code));
  if not found then raise exception 'group_not_found'; end if;
  if not exists(select 1 from game.group_members where group_id = v_g.id and player_id = p_id) then
    if (select count(*) from game.group_members where group_id = v_g.id) >= 50 then raise exception 'group_full'; end if;
    insert into game.group_members(group_id, player_id) values (v_g.id, p_id);
  end if;
  return json_build_object('id', v_g.id, 'code', v_g.code, 'name', v_g.name);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_leave_group(p_id uuid, p_secret text, p_group uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_next uuid;
begin
  perform game.auth(p_id, p_secret);
  delete from game.group_members where group_id = p_group and player_id = p_id;
  if exists(select 1 from game.groups where id = p_group and owner_id = p_id) then
    select player_id into v_next from game.group_members where group_id = p_group order by joined_at limit 1;
    if v_next is null then delete from game.groups where id = p_group;
    else update game.groups set owner_id = v_next where id = p_group; end if;
  end if;
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_log_event(p_id uuid, p_secret text, p_kind text, p_data jsonb)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  perform game.auth(p_id, p_secret);
  if p_kind !~ '^[a-z0-9_]{1,30}$' then raise exception 'bad_kind'; end if;
  if (select count(*) from game.events where player_id = p_id and created_at > now() - interval '1 day') >= 50 then raise exception 'rate_limited'; end if;
  insert into game.events(player_id, kind, data) values (p_id, p_kind, case when pg_column_size(p_data) < 2000 then p_data end);
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_my_groups(p_id uuid, p_secret text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  perform game.auth(p_id, p_secret);
  return (select coalesce(json_agg(json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'is_owner', g.owner_id = p_id,
      'members', (select count(*) from game.group_members m2 where m2.group_id = g.id),
      'active', (select count(*) from game.challenges c where c.group_id = g.id and now() between c.starts_at and c.ends_at))
      order by m.joined_at desc), '[]'::json)
    from game.group_members m join game.groups g on g.id = m.group_id where m.player_id = p_id);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_profile(p_id uuid, p_secret text)
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
begin
  perform game.auth(p_id, p_secret);
  return (select json_build_object('id', id, 'nickname', nickname, 'stars', stars, 'total_stars', total_stars,
    'achievements', achievements, 'pawn', pawn, 'meta', meta, 'daily_streak',
      case when last_daily >= (now() at time zone 'Asia/Jerusalem')::date - 1 then daily_streak else 0 end,
    'best_streak', best_streak, 'last_daily', last_daily) from game.players where id = p_id);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_register(p_nickname text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_secret text := encode(extensions.gen_random_bytes(24), 'hex'); v_id uuid; v_nick text := btrim(p_nickname);
begin
  if v_nick is null or char_length(v_nick) not between 2 and 20 then raise exception 'bad_nickname'; end if;
  insert into game.players(nickname, secret_hash) values (v_nick, extensions.digest(v_secret, 'sha256')) returning id into v_id;
  return json_build_object('id', v_id, 'secret', v_secret, 'nickname', v_nick);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_register2(p_nickname text, p_ref uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare r json;
begin
  r := public.rr_register(p_nickname);
  -- referral bonus: max 5 per referrer per day (prevents farming by mass sign-ups)
  if p_ref is not null and exists(select 1 from game.players where id = p_ref)
     and (select count(*) from game.energy_gifts where to_id = p_ref and kind = 'referral'
          and day = (now() at time zone 'Asia/Jerusalem')::date) < 5 then
    update game.players set referred_by = p_ref where id = (r->>'id')::uuid;
    insert into game.energy_gifts(from_id, to_id, kind, amount) values ((r->>'id')::uuid, p_ref, 'referral', 5);
  end if;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.rr_rename(p_id uuid, p_secret text, p_nickname text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_nick text := btrim(p_nickname);
begin
  perform game.auth(p_id, p_secret);
  if v_nick is null or char_length(v_nick) not between 2 and 20 then raise exception 'bad_nickname'; end if;
  update game.players set nickname = v_nick where id = p_id;
  return json_build_object('nickname', v_nick);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_send_energy(p_id uuid, p_secret text, p_group uuid, p_nickname text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_to uuid;
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  select m.player_id into v_to from game.group_members m join game.players p on p.id = m.player_id
   where m.group_id = p_group and p.nickname = p_nickname and m.player_id <> p_id limit 1;
  if v_to is null then raise exception 'player_not_found'; end if;
  begin
    insert into game.energy_gifts(from_id, to_id, kind, amount) values (p_id, v_to, 'gift', 3);
  exception when unique_violation then raise exception 'already_sent_today';
  end;
  return json_build_object('ok', true);
end $function$;

-- rr_start / rr_sync_progress (legacy v2 entry points, still granted) and rr_sync_progress2 / rr_weekly:
-- bodies identical to the production catalog at the snapshot time; see the catalog query in docs/full-upgrade/research/O1-online-design.md §5
-- (rr_start: challenge or weekly seed + result row; rr_sync_progress: max-merge stars/achievements/pawn; rr_sync_progress2: + meta
-- games/wins max and best months min; rr_weekly: game.week() + my_status + board).
