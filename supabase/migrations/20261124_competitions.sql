-- NOT APPLIED — needs owner approval.
-- Competitions (BRIEF §24–§25, design O1 §1.6): extend game.challenges ADDITIVELY (old clients and verify-result keep keying on
-- challenge_id) + a competition board with a shared rank that never uses time. Requires 20261124_groups_v2.sql (roles).
-- Status: DRAFT. Adds columns, swaps one unique index (attempts), replaces rr_begin (same signature, additive keys) → explicit approval.
-- Validated offline by tests/sql_drafts.test.mjs (PGlite); semantics mirrored by tests/fakebackend.py (rr_create_competition …).
--
-- Rules (frozen at creation, never changed afterwards — §24 "אין שינוי כללים בדיעבד"):
--   rules jsonb = {attempts 1–3, metric 'escape'|'networth', tiebreak 'ratio'|'networth', join_policy 'members'|'members_before_start',
--                  late_join_until timestamptz|null, grace_minutes 0–360 (default 120)}
--   engine_rules smallint (the engine's st.rules for the start day: 3 before RULES4_FROM 2026-12-07, else 4) + engine_sha (optional pin)
-- Cases (§24): scheduled start (begin before it → not_started) · late join (join policy / late_join_until → late_join) · unfinished
--   attempt (still playing at the end → shown 'unfinished', never ranked) · finish after the deadline (rr_finish keeps its 6 h hard
--   limit; the board ranks only finished_at ≤ ends_at + grace, later rows show 'late') · disqualified (verified = false → shown last,
--   never ranked) · ties (equal metric tuple → the same rank: rank() over the tuple, no time key) · cancel (creator or owner/admin:
--   cancelled_at; begin → challenge_cancelled; the board is kept, frozen) · version change (the competition keeps engine_rules; a
--   ranked-outcome engine change must be a new st.rules gated by date — RULES4_FROM pattern; never compare two rules on one board).
-- Attempts: attempt k plays seed k (k = 1: challenges.seed as today; k > 1: abs(hashtext(seed || ':' || k))), the SAME for every
--   player; the best attempt counts. results.seed stores the seed handed out.
--   FOLLOW-UP needed in verify-result (not part of this draft, owner approval): ROW must use coalesce(r.seed, c.seed) so that attempt
--   2/3 results verify; until then they stay verified = null ("not verified yet", never flagged false).
-- ROLLBACK: at the bottom.

begin;

alter table game.challenges
  add column if not exists rules jsonb not null default '{}'::jsonb,
  add column if not exists engine_rules smallint,
  add column if not exists engine_sha text,
  add column if not exists kind text not null default 'async',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references game.players(id) on delete set null;
alter table game.challenges add constraint challenges_kind_check check (kind in ('async', 'live'));
alter table game.challenges add constraint challenges_rules_check check (
  jsonb_typeof(rules) = 'object' and octet_length(rules::text) < 1024
  and (rules->'attempts' is null or (jsonb_typeof(rules->'attempts') = 'number' and (rules->>'attempts')::int between 1 and 3))
  and (rules->'metric' is null or rules->>'metric' in ('escape', 'networth'))
  and (rules->'tiebreak' is null or rules->>'tiebreak' in ('ratio', 'networth'))
  and (rules->'join_policy' is null or rules->>'join_policy' in ('members', 'members_before_start'))
  and (rules->'grace_minutes' is null or (jsonb_typeof(rules->'grace_minutes') = 'number' and (rules->>'grace_minutes')::int between 0 and 360)));

alter table game.results
  add column if not exists attempt smallint not null default 1,
  add column if not exists seed bigint;
alter table game.results add constraint results_attempt_check check (attempt between 1 and 3 and (attempt = 1 or challenge_id is not null));
create unique index if not exists results_one_per_challenge_attempt on game.results (player_id, challenge_id, attempt) where challenge_id is not null;
drop index if exists game.results_one_per_challenge;

-- ------------------------------------------------------------------ helpers
create or replace function game.comp_rule(p_c game.challenges, p_key text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(p_c.rules->>p_key, case p_key when 'attempts' then '1' when 'metric' then 'escape' when 'tiebreak' then 'ratio'
    when 'join_policy' then 'members' when 'grace_minutes' then '120' end)
$$;
create or replace function game.attempt_seed(p_seed bigint, p_k int) returns bigint
language sql immutable set search_path = '' as $$
  select case when p_k <= 1 then p_seed else greatest(1, abs(hashtext(p_seed::text || ':' || p_k::text)))::bigint end
$$;
/** a NEW attempt may start: window, cancel, join policy, late join. Raises the §24 codes. */
create or replace function game.comp_gate(p_c game.challenges, p_player uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_joined timestamptz;
begin
  if p_c.cancelled_at is not null then raise exception 'challenge_cancelled'; end if;
  if now() < p_c.starts_at then raise exception 'not_started'; end if;
  if now() >= p_c.ends_at then raise exception 'challenge_closed'; end if;
  if (p_c.rules->>'late_join_until') is not null and now() > (p_c.rules->>'late_join_until')::timestamptz then raise exception 'late_join'; end if;
  if game.comp_rule(p_c, 'join_policy') = 'members_before_start' then
    select joined_at into v_joined from game.group_members where group_id = p_c.group_id and player_id = p_player;
    if v_joined > p_c.starts_at then raise exception 'late_join'; end if;
  end if;
end $$;

/**
 * Competition board (best attempt per player). rank = shared rank over the metric tuple (never a time key); flag ∈ ok · playing ·
 * unfinished · late · disqualified — only 'ok' rows are ranked. Same JSON keys as game.board + rank, flag, attempt, attempts.
 */
create or replace function game.board2(p_challenge uuid, p_me uuid) returns json
language sql stable security definer set search_path = '' as $$
  with c as (select * from game.challenges where id = p_challenge),
  r as (
    select r.*, p.nickname, p.total_stars, p.pawn,
      coalesce((r.stats->>'progress')::numeric, r.passive::numeric / nullif(r.expenses, 0), 0) as prog,
      round(coalesce(r.passive, 0)::numeric / greatest(1, coalesce(r.expenses, 0)), 3) as ratio,
      case when r.verified is false then 'disqualified'
           when r.status = 'playing' then case when now() >= c.ends_at then 'unfinished' else 'playing' end
           when r.finished_at > c.ends_at + make_interval(mins => game.comp_rule(c, 'grace_minutes')::int) then 'late'
           else 'ok' end as flag,
      game.comp_rule(c, 'metric') as metric, game.comp_rule(c, 'tiebreak') as tiebreak
    from game.results r join c on r.challenge_id = c.id join game.players p on p.id = r.player_id),
  k as (
    select r.*,
      case when metric = 'networth' then 0 else case when status = 'won' then 0 else 1 end end as k1,
      case when metric = 'networth' then -coalesce(net_worth, 0)::numeric when status = 'won' then months::numeric else -round(prog, 3) end as k2,
      case when tiebreak = 'networth' then -coalesce(net_worth, 0)::numeric else -ratio end as k3,
      case when tiebreak = 'networth' then -ratio else -coalesce(net_worth, 0)::numeric end as k4,
      case flag when 'ok' then 0 when 'playing' then 1 when 'unfinished' then 2 when 'late' then 3 else 4 end as fo
    from r),
  best as (
    select distinct on (player_id) k.*, (select count(*) from game.results x where x.challenge_id = p_challenge and x.player_id = k.player_id) as n_att
    from k order by player_id, fo, k1, k2, k3, k4, attempt),
  ranked as (
    select b.*, case when fo = 0 then rank() over (partition by (fo = 0) order by k1, k2, k3, k4) end as rnk from best b)
  select coalesce(json_agg(json_build_object('nickname', nickname, 'status', status, 'months', months, 'net_worth', net_worth,
      'passive', passive, 'expenses', expenses, 'me', player_id = p_me, 'stars', total_stars, 'pawn', pawn,
      'progress', case when status = 'playing' then null else round(prog, 3) end, 'verified', verified,
      'rank', rnk, 'flag', flag, 'attempt', attempt, 'attempts', n_att)
    order by fo, k1, k2, k3, k4, nickname), '[]'::json)
  from (select * from ranked order by fo, k1, k2, k3, k4, nickname limit 100) x
$$;

create or replace function game.comp_out(p_c game.challenges, p_me uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('id', p_c.id, 'title', p_c.title, 'profession', p_c.profession, 'world', p_c.world,
    'starts_at', p_c.starts_at, 'ends_at', p_c.ends_at, 'active', now() between p_c.starts_at and p_c.ends_at and p_c.cancelled_at is null,
    'status', case when p_c.cancelled_at is not null then 'cancelled' when now() < p_c.starts_at then 'scheduled' when now() < p_c.ends_at then 'open' else 'closed' end,
    'rules', json_build_object('attempts', game.comp_rule(p_c, 'attempts')::int, 'metric', game.comp_rule(p_c, 'metric'),
       'tiebreak', game.comp_rule(p_c, 'tiebreak'), 'join_policy', game.comp_rule(p_c, 'join_policy'),
       'late_join_until', p_c.rules->>'late_join_until', 'grace_minutes', game.comp_rule(p_c, 'grace_minutes')::int),
    'engine_rules', p_c.engine_rules, 'engine_sha', p_c.engine_sha, 'kind', p_c.kind, 'created_by_me', p_c.created_by = p_me,
    'cancelled_at', p_c.cancelled_at,
    'my_status', (select r.status from game.results r where r.challenge_id = p_c.id and r.player_id = p_me order by attempt desc limit 1),
    'attempts_used', (select count(*) from game.results r where r.challenge_id = p_c.id and r.player_id = p_me),
    'board', game.board2(p_c.id, p_me))
$$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.rr_create_competition(p_id uuid, p_secret text, p_group uuid, p_title text, p_world text, p_char text,
    p_starts_at timestamptz, p_ends_at timestamptz, p_rules jsonb default null) returns json
language plpgsql security definer set search_path = '' as $$
declare v_c game.challenges; v_title text := btrim(p_title); v_start timestamptz := coalesce(p_starts_at, now()); v_rules jsonb := coalesce(p_rules, '{}'::jsonb);
  v_day date;
begin
  perform game.auth(p_id, p_secret);
  if not exists(select 1 from game.group_members where group_id = p_group and player_id = p_id) then raise exception 'not_member'; end if;
  if not (select member_challenges from game.groups where id = p_group) then perform game.group_need(p_group, p_id, array['owner','admin']); end if;
  if v_title is null or char_length(v_title) not between 2 and 50 then raise exception 'bad_title'; end if;
  if p_world not in ('w1','w2','w3','w4') then raise exception 'bad_world'; end if;
  if p_char is null or p_char !~ '^[a-z0-9_]{1,24}$' then raise exception 'bad_profession'; end if;
  if p_ends_at is null or v_start < now() - interval '5 minutes' or p_ends_at <= v_start + interval '1 hour'
     or p_ends_at - v_start > interval '30 days' or v_start - now() > interval '30 days' then raise exception 'bad_window'; end if;
  if jsonb_typeof(v_rules) <> 'object' or exists (select 1 from jsonb_object_keys(v_rules) k
       where k not in ('attempts','metric','tiebreak','join_policy','late_join_until','grace_minutes')) then raise exception 'bad_rules'; end if;
  begin
    if (v_rules->>'late_join_until') is not null and (v_rules->>'late_join_until')::timestamptz not between v_start and p_ends_at then raise exception 'bad_rules'; end if;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'bad_rules';
  end;
  if (select count(*) from game.challenges where group_id = p_group and ends_at > now() and cancelled_at is null) >= 5 then raise exception 'too_many_challenges'; end if;
  v_day := (v_start at time zone 'Asia/Jerusalem')::date;
  begin
    insert into game.challenges(group_id, title, profession, world, seed, starts_at, ends_at, created_by, rules, engine_rules, kind)
    values (p_group, v_title, p_char, p_world, floor(random() * 2147483646)::bigint + 1, v_start, p_ends_at, p_id, v_rules,
            case when v_day < date '2026-12-07' then 3 else 4 end, 'async')     -- = js/systems/rules.js RULES4_FROM (rulesForDay)
    returning * into v_c;
  exception when check_violation then raise exception 'bad_rules';
  end;
  insert into game.group_log (group_id, kind, actor, data) values (p_group, 'competition', p_id, json_build_object('title', v_title)::jsonb);
  return game.comp_out(v_c, p_id);
end $$;

create or replace function public.rr_competition(p_id uuid, p_secret text, p_challenge uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_c game.challenges;
begin
  perform game.auth(p_id, p_secret);
  select * into v_c from game.challenges where id = p_challenge;
  if not found then raise exception 'challenge_not_found'; end if;
  if not exists(select 1 from game.group_members where group_id = v_c.group_id and player_id = p_id) then raise exception 'not_member'; end if;
  return game.comp_out(v_c, p_id);
end $$;

create or replace function public.rr_cancel_competition(p_id uuid, p_secret text, p_challenge uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_c game.challenges;
begin
  perform game.auth(p_id, p_secret);
  select * into v_c from game.challenges where id = p_challenge for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if not exists(select 1 from game.group_members where group_id = v_c.group_id and player_id = p_id) then raise exception 'not_member'; end if;
  if v_c.created_by is distinct from p_id and coalesce(game.group_role(v_c.group_id, p_id), '') not in ('owner', 'admin') then raise exception 'not_allowed'; end if;
  if v_c.cancelled_at is not null then raise exception 'already_cancelled'; end if;
  if now() >= v_c.ends_at then raise exception 'challenge_closed'; end if;
  update game.challenges set cancelled_at = now(), cancelled_by = p_id where id = p_challenge returning * into v_c;
  insert into game.group_log (group_id, kind, actor, data) values (v_c.group_id, 'competition_cancelled', p_id, json_build_object('title', v_c.title)::jsonb);
  return game.comp_out(v_c, p_id);
end $$;

/** rr_begin: same signature + every old key; challenge mode now knows cancel / scheduled start / join policy / attempts. */
create or replace function public.rr_begin(p_id uuid, p_secret text, p_mode text, p_challenge uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_c game.challenges; v_r game.results; j json; v_today date;
begin
  perform game.auth(p_id, p_secret);
  if p_mode = 'challenge' then
    select * into v_c from game.challenges where id = p_challenge;
    if not found then raise exception 'challenge_not_found'; end if;
    if not exists(select 1 from game.group_members where group_id = v_c.group_id and player_id = p_id) then raise exception 'not_member'; end if;
    if v_c.cancelled_at is not null then raise exception 'challenge_cancelled'; end if;
    select * into v_r from game.results where challenge_id = v_c.id and player_id = p_id order by attempt desc limit 1;
    if not found then
      perform game.comp_gate(v_c, p_id);                    -- = the baseline window check + cancel / not_started / late_join
      insert into game.results(player_id, challenge_id, profession, world, attempt, seed) values (p_id, v_c.id, v_c.profession, v_c.world, 1, v_c.seed) returning * into v_r;
    elsif now() not between v_c.starts_at and v_c.ends_at then raise exception 'challenge_closed';   -- baseline behaviour for an existing row
    end if;
    return json_build_object('result_id', v_r.id, 'status', v_r.status, 'seed', coalesce(v_r.seed, v_c.seed), 'world', v_c.world,
      'char', v_c.profession, 'char_index', null, 'max_months', null, 'title', v_c.title, 'group_id', v_c.group_id,
      'checkpoint_turn', v_r.checkpoint_turn, 'checkpoint', v_r.checkpoint,
      'attempt', v_r.attempt, 'attempts', game.comp_rule(v_c, 'attempts')::int, 'rules', v_c.engine_rules);
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
  return json_build_object('result_id', v_r.id, 'status', v_r.status, 'seed', (j->>'seed')::bigint, 'world', v_r.world,
    'char', null, 'char_index', case when v_r.profession like 'idx:%' then substr(v_r.profession, 5)::int else (j->>'char_index')::int end,
    'max_months', (j->>'max_months')::int, 'title', null, 'group_id', null,
    'streak', (select daily_streak from game.players where id = p_id),
    'checkpoint_turn', v_r.checkpoint_turn, 'checkpoint', v_r.checkpoint);
end $$;

create or replace function public.rr_begin_attempt(p_id uuid, p_secret text, p_challenge uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare v_c game.challenges; v_last game.results; v_r game.results; v_k int;
begin
  perform game.auth(p_id, p_secret);
  select * into v_c from game.challenges where id = p_challenge;
  if not found then raise exception 'challenge_not_found'; end if;
  if not exists(select 1 from game.group_members where group_id = v_c.group_id and player_id = p_id) then raise exception 'not_member'; end if;
  select * into v_last from game.results where challenge_id = v_c.id and player_id = p_id order by attempt desc limit 1 for update;
  if found and v_last.status = 'playing' then raise exception 'attempt_open'; end if;
  v_k := coalesce(v_last.attempt, 0) + 1;
  if v_k > game.comp_rule(v_c, 'attempts')::int then raise exception 'attempts_used'; end if;
  perform game.comp_gate(v_c, p_id);
  insert into game.results(player_id, challenge_id, profession, world, attempt, seed)
    values (p_id, v_c.id, v_c.profession, v_c.world, v_k, game.attempt_seed(v_c.seed, v_k)) returning * into v_r;
  return json_build_object('result_id', v_r.id, 'status', v_r.status, 'seed', v_r.seed, 'world', v_c.world, 'char', v_c.profession,
    'char_index', null, 'max_months', null, 'title', v_c.title, 'group_id', v_c.group_id, 'checkpoint_turn', 0, 'checkpoint', null,
    'attempt', v_k, 'attempts', game.comp_rule(v_c, 'attempts')::int, 'rules', v_c.engine_rules);
end $$;

-- rr_my_groups / rr_group: a cancelled competition is not 'active' (same keys as groups v2)
create or replace function game.group_out(p_group uuid, p_me uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'is_owner', g.owner_id = p_me,
    'members', (select count(*) from game.group_members m where m.group_id = g.id),
    'active', (select count(*) from game.challenges c where c.group_id = g.id and now() between c.starts_at and c.ends_at and c.cancelled_at is null),
    'description', g.description, 'my_role', game.group_role(g.id, p_me), 'invite_open', g.invite_open, 'member_challenges', g.member_challenges)
  from game.groups g where g.id = p_group
$$;

-- rr_group: with attempts a player may own several result rows per challenge → my_status = the latest attempt; competitions created
-- with rr_create_competition (rules <> '{}') use board2 (a superset of the board keys: + rank, flag, attempt, attempts).
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
                     'starts_at', c.starts_at, 'ends_at', c.ends_at, 'active', now() between c.starts_at and c.ends_at and c.cancelled_at is null,
                     'my_status', (select r.status from game.results r where r.challenge_id = c.id and r.player_id = p_id order by r.attempt desc limit 1),
                     'status', case when c.cancelled_at is not null then 'cancelled' when now() < c.starts_at then 'scheduled' when now() < c.ends_at then 'open' else 'closed' end,
                     'board', case when c.rules = '{}'::jsonb then game.board(c.id, null, p_id) else game.board2(c.id, p_id) end) order by c.created_at desc), '[]'::json)
                   from (select * from game.challenges where group_id = g.id order by created_at desc limit 20) c))
    from game.groups g where g.id = p_group);
end $$;

revoke all on function game.comp_rule(game.challenges, text), game.attempt_seed(bigint, int), game.comp_gate(game.challenges, uuid),
  game.board2(uuid, uuid), game.comp_out(game.challenges, uuid) from public;
revoke all on function public.rr_create_competition(uuid, text, uuid, text, text, text, timestamptz, timestamptz, jsonb),
  public.rr_competition(uuid, text, uuid), public.rr_cancel_competition(uuid, text, uuid), public.rr_begin_attempt(uuid, text, uuid) from public;
grant execute on function public.rr_create_competition(uuid, text, uuid, text, text, text, timestamptz, timestamptz, jsonb),
  public.rr_competition(uuid, text, uuid), public.rr_cancel_competition(uuid, text, uuid), public.rr_begin_attempt(uuid, text, uuid) to anon, authenticated;

commit;

-- ================================================================== ROLLBACK (run by hand)
-- begin;
-- drop function if exists public.rr_create_competition(uuid, text, uuid, text, text, text, timestamptz, timestamptz, jsonb),
--   public.rr_competition(uuid, text, uuid), public.rr_cancel_competition(uuid, text, uuid), public.rr_begin_attempt(uuid, text, uuid),
--   game.comp_out(game.challenges, uuid), game.board2(uuid, uuid), game.comp_gate(game.challenges, uuid), game.attempt_seed(bigint, int),
--   game.comp_rule(game.challenges, text);
-- -- rr_begin: re-create VERBATIM from supabase/schema/production_baseline.sql; game.group_out + rr_group: the groups_v2 definitions.
-- delete from game.results where attempt > 1;                -- only possible after attempts were used: keep a backup first
-- create unique index results_one_per_challenge on game.results (player_id, challenge_id) where challenge_id is not null;
-- drop index if exists game.results_one_per_challenge_attempt;
-- alter table game.results drop constraint if exists results_attempt_check, drop column if exists seed, drop column if exists attempt;
-- alter table game.challenges drop constraint if exists challenges_rules_check, drop constraint if exists challenges_kind_check,
--   drop column if exists cancelled_by, drop column if exists cancelled_at, drop column if exists kind, drop column if exists engine_sha,
--   drop column if exists engine_rules, drop column if exists rules;
-- commit;
