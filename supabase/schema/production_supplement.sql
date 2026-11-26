-- READ-ONLY SNAPSHOT SUPPLEMENT (2026-11-25), taken with pg_get_functiondef from production (project xvqaxphyfqdzkddmoosu).
-- production_baseline.sql was captured before these existed. Apply AFTER production_baseline.sql and
-- supabase/migrations/20261123_admin.sql (which created rr_admin_status / rr_admin_claim / rr_admin_players / rr_admin_give
-- and the admin tables) to reproduce the live public API for local staging. Never apply this file to production.
-- Live public rr_* functions on 2026-11-25: rr_admin_claim, rr_admin_give, rr_admin_players, rr_admin_status, rr_begin,
-- rr_checkpoint, rr_claim_energy, rr_create_challenge, rr_create_challenge2, rr_create_group, rr_daily, rr_finish, rr_group,
-- rr_group_feed, rr_join_group, rr_leave_group, rr_log_event, rr_my_groups, rr_profile, rr_register, rr_register2, rr_rename,
-- rr_send_energy, rr_start, rr_sync_progress, rr_sync_progress2, rr_weekly.
-- Note for verify-result: the live rr_begin / rr_create_challenge2 return no starts_at; the client's rules version must not
-- depend on a starts_at the server never sends.

CREATE OR REPLACE FUNCTION public.rr_sync_progress2(p_id uuid, p_secret text, p_stars jsonb, p_achievements text[], p_pawn text, p_meta jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m jsonb; b jsonb; k text;
begin
  perform public.rr_sync_progress(p_id, p_secret, p_stars, p_achievements, p_pawn);
  if p_meta is not null and jsonb_typeof(p_meta) = 'object' and pg_column_size(p_meta) < 4000 then
    select meta into m from game.players where id = p_id for update;
    m := jsonb_build_object(
      'games', greatest(coalesce((m->>'games')::int, 0), least(coalesce((p_meta->>'games')::int, 0), 100000)),
      'wins', greatest(coalesce((m->>'wins')::int, 0), least(coalesce((p_meta->>'wins')::int, 0), 100000)),
      'best', coalesce(m->'best', '{}'::jsonb));
    if jsonb_typeof(p_meta->'best') = 'object' then
      b := m->'best';
      for k in select jsonb_object_keys(p_meta->'best') loop
        if k in ('w1','w2','w3','w4') and (p_meta->'best'->>k) ~ '^\d{1,3}$' then
          b := jsonb_set(b, array[k], to_jsonb(least(coalesce((b->>k)::int, 999), (p_meta->'best'->>k)::int)));
        end if;
      end loop;
      m := jsonb_set(m, '{best}', b);
    end if;
    update game.players set meta = m where id = p_id;
  end if;
  return public.rr_profile(p_id, p_secret);
end $function$;

CREATE OR REPLACE FUNCTION public.rr_weekly(p_id uuid, p_secret text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w json := game.week();
begin
  perform game.auth(p_id, p_secret);
  return json_build_object('key', w->>'key', 'world', w->>'world', 'char_index', (w->>'char_index')::int,
    'profession', w->>'profession', 'ends_at', w->>'ends_at',
    'my_status', (select status from game.results where weekly_key = w->>'key' and player_id = p_id),
    'board', game.board(null, w->>'key', p_id));
end $function$;
