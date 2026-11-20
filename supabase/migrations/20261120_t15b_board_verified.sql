-- T-15 (part B) — leaderboards prefer verified results and expose 'verified' for the ✓. Requires part A.
-- Status: NOT APPLIED (replaces an existing function → needs explicit approval).
-- Same signature, same JSON keys as before + 'verified' (v2 clients ignore unknown keys). Ordering:
--   rejected rows (verified = false) last · then status (won, lost, playing) · then verified before unverified · then as before.
-- While no row has verified = true/false the order is byte-for-byte the previous one.
-- ROLLBACK = the previous definition, kept verbatim at the bottom of this file.
create or replace function game.board(p_challenge uuid, p_weekly text, p_me uuid, p_daily text default null::text)
returns json language sql stable security definer set search_path = '' as $$
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
$$;

/* ---------------- ROLLBACK (definition live on 2026-11-20 before this migration) ----------------
create or replace function game.board(p_challenge uuid, p_weekly text, p_me uuid, p_daily text default null::text)
returns json language sql stable security definer set search_path to '' as $function$
  select coalesce(json_agg(json_build_object('nickname', nickname, 'status', status, 'months', months,
           'net_worth', net_worth, 'passive', passive, 'expenses', expenses, 'me', me,
           'stars', total_stars, 'pawn', pawn, 'progress', progress) order by o1, o2, o3 desc, o4 desc, o5), '[]'::json)
  from (
    select p.nickname, p.total_stars, p.pawn, r.status, r.months, r.net_worth, r.passive, r.expenses, (r.player_id = p_me) as me,
      (r.stats->>'progress')::numeric as progress,
      case r.status when 'won' then 0 when 'lost' then 1 else 2 end as o1,
      case when r.status = 'won' then r.months::numeric
           else -coalesce((r.stats->>'progress')::numeric, r.passive::numeric / nullif(r.expenses, 0), 0) end as o2,
      coalesce(r.net_worth, 0) as o3, coalesce(r.passive, 0) as o4, coalesce(r.finished_at, r.started_at) as o5
    from game.results r join game.players p on p.id = r.player_id
    where (p_challenge is not null and r.challenge_id = p_challenge)
       or (p_weekly is not null and r.weekly_key = p_weekly)
       or (p_daily is not null and r.daily_key = p_daily)
    order by o1, o2, o3 desc, o4 desc, o5
    limit 100
  ) x
$function$;
*/
