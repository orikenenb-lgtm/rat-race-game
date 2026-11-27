-- NOT APPLIED — needs owner approval (apply with the Supabase MCP apply_migration, name 20261127_delete_account).
-- Account deletion (Google Play "delete account in the app" + "web link"): docs/full-upgrade/ACCOUNT_DELETION.md.
-- Status: purely ADDITIVE on the live schema (supabase/schema/production_baseline.sql + 20261123_admin.sql +
-- production_supplement.sql): one new table, two new functions, nothing existing is altered or replaced. ONE transaction.
--
-- What it adds
--   * public.rr_delete_account(p_id uuid, p_secret text, p_confirm text) → {deleted:true, groups_transferred:n, groups_deleted:m}
--       game.auth first (unknown id / wrong secret / an already deleted account → 'unauthorized'), then a per-player lock (the
--       players row FOR UPDATE: a concurrent second call waits and then answers 'unauthorized'), refuses the admin
--       ('admin_cannot_delete'), and needs p_confirm = the player's CURRENT nickname (server-side confirmation, 'confirm_mismatch').
--       EXECUTE for anon + authenticated only (like every public.rr_*).
--   * game.delete_player(p_id uuid, p_via text) — the work itself; NOT executable by the API roles. Used by rr_delete_account
--       ('app') and by the owner for e-mail requests from the SQL editor ('manual', docs/full-upgrade/ACCOUNT_DELETION.md §4).
--   * game.account_deletions — a tiny audit: when, how (app / manual) and how many groups were handed over / deleted.
--       NO player id, NO nickname, nothing that points back to the person.
--
-- What game.delete_player does, in this order (one transaction; the players row is locked first)
--   1. every ⚡ gift / referral bonus he SENT to another player stays with the receiver, from_id → null (the inbox shows "a friend"):
--      pending ones are not lost, and the rows keep counting in rr_register2's daily referral cap (5 per referrer per day) —
--      deleting them would let "register with ?ref, delete, repeat" farm ⚡ past the cap. Gifts TO him go with the cascade.
--   2. every group he OWNS (locked FOR UPDATE): ownership passes to the oldest remaining member (joined_at, then player id);
--      with the groups v2 draft applied: the oldest ADMIN first, else the oldest member — the same rule as v2's own leave
--      (game.group_drop) — and the member roles are kept in step (one 'owner' row) + one group_log row 'owner' {auto, why}.
--      A group whose ONLY member is him is deleted (its challenges with it — the same as the live rr_leave_group when the last
--      member leaves; results that former members left on those challenges were already invisible to them).
--   3. live rooms (draft 20261124_rooms.sql; detected at run time, nothing happens without it): a LOBBY seat is freed like
--      rr_room_leave (host → the next seat, an empty lobby is cancelled); in a PLAYING room he forfeits like rr_room_leave and the
--      host passes to the next seat, so the room and the others' games survive (his seat row then goes with the cascade; the
--      Edge tick closes the round — needs_tick); a FINISHED / CANCELLED room he hosted passes to the next seat (the others keep
--      their history); his nickname copy in rooms.results is replaced by 'שחקן לשעבר'. A room where nobody else sits goes.
--   4. delete from game.players → ON DELETE CASCADE removes his results (daily / weekly / challenges, checkpoints, verify data),
--      group memberships, events (friends' feed), energy gifts, admin row (never: refused above) and — when the drafts are
--      applied — his room seats / actions, chat messages, reports, refused-chat rows, ban row, group bans, join throttles;
--      ON DELETE SET NULL: challenges.created_by, players.referred_by (other players' "who invited me"), and the drafts'
--      group_log actor/target, challenges.cancelled_by, bans.by_id. Other players' results, memberships and groups are untouched.
--   5. one game.account_deletions row (no personal data).
-- Retained after deletion (documented in ACCOUNT_DELETION.md): the gift rows he sent (from_id null, see 1.); content he created INSIDE groups that live on (group names of
-- groups handed over, challenge titles) — no longer linked to him; with the moderation draft, game.mod_log keeps the admin's
-- actions about him under the random player id (no nickname; the id matches no account any more; append-only by design).
--
-- FORWARD COMPATIBILITY (every draft may be applied before OR after this file; tests/account_delete_sql.test.mjs runs both orders):
--   groups v2 is detected by the column game.group_members.role, rooms by to_regclass('game.rooms'); all their statements run
--   through EXECUTE so this function compiles and runs on the live schema alone. A LATER migration that adds a table referencing
--   game.players MUST pick: ON DELETE CASCADE (his personal data) or ON DELETE SET NULL (shared content), and if it copies a
--   nickname into a text / json column (like rooms.results) it must extend game.delete_player. The SQL test fails on any foreign
--   key to game.players it does not know (catalog check), so this cannot be forgotten.
--
-- PRE-CHECK (read-only, before applying):
--   select to_regprocedure('public.rr_delete_account(uuid,text,text)') is null as fn_absent,
--          to_regclass('game.account_deletions') is null as table_absent;                           -- both true
--   select conrelid::regclass, conname, confdeltype from pg_constraint where confrelid = 'game.players'::regclass order by 1, 2;
--     -- live: admins a/c, challenges created_by n, energy_gifts from/to c, events c, group_members c, groups owner c, players referred_by n, results c
-- POST-CHECK (read-only, after applying):
--   select p.proname, p.prosecdef, p.proconfig, coalesce(p.proacl::text, '') as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where (n.nspname, p.proname) in (('public', 'rr_delete_account'), ('game', 'delete_player'));
--     -- rr_delete_account: secdef true, search_path="", acl = owner + anon=X + authenticated=X (no PUBLIC); delete_player: no anon/authenticated
--   select count(*) from game.account_deletions;                                                       -- 0
--   select public.rr_delete_account('00000000-0000-0000-0000-000000000000', 'x', 'x');                  -- ERROR: unauthorized
-- ROLLBACK: at the bottom (drops the two functions and the audit table; deleted accounts cannot be restored by a rollback).

begin;

create table game.account_deletions (                     -- audit without personal data: never a player id or a nickname
  id bigserial primary key,
  at timestamptz not null default now(),
  via text not null check (via in ('app', 'manual')),
  groups_transferred int not null default 0 check (groups_transferred >= 0),
  groups_deleted int not null default 0 check (groups_deleted >= 0),
  rooms_handed_over int not null default 0 check (rooms_handed_over >= 0)
);
alter table game.account_deletions enable row level security;

/** Deletes one player and everything of his (see the header). → {deleted, groups_transferred, groups_deleted}.
 *  Raises 'unauthorized' when the player does not exist (also: deleted a moment ago), 'admin_cannot_delete' for an admin. */
create or replace function game.delete_player(p_id uuid, p_via text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_v2 boolean; v_g uuid; v_next uuid; n_tr int := 0; n_del int := 0; n_rooms int := 0;
  v_rm record; v_nx_seat smallint; v_nx_pid uuid;
begin
  if p_via is null or p_via not in ('app', 'manual') then raise exception 'bad_via'; end if;
  perform 1 from game.players where id = p_id for update;                  -- the per-player lock
  if not found then raise exception 'unauthorized' using errcode = '28000'; end if;
  if game.is_admin(p_id) then raise exception 'admin_cannot_delete'; end if;

  -- 1. gifts / referral bonuses he sent stay with their receivers (pending ones, and the referral cap's count)
  update game.energy_gifts set from_id = null where from_id = p_id and to_id <> p_id;

  -- 2. groups he owns
  v_v2 := exists (select 1 from pg_attribute where attrelid = 'game.group_members'::regclass and attname = 'role' and attnum > 0 and not attisdropped);
  for v_g in select id from game.groups where owner_id = p_id order by created_at, id for update loop
    if v_v2 then
      execute 'select player_id from game.group_members where group_id = $1 and player_id <> $2
                order by (role = ''admin'') desc, joined_at, player_id limit 1 for update' into v_next using v_g, p_id;
    else
      select player_id into v_next from game.group_members where group_id = v_g and player_id <> p_id order by joined_at, player_id limit 1
        for update;                                                           -- the next owner cannot leave half-way
    end if;
    if v_next is null then
      delete from game.groups where id = v_g;
      n_del := n_del + 1;
    else
      if v_v2 then                                                            -- one 'owner' row per group (unique index)
        execute 'update game.group_members set role = ''member'' where group_id = $1 and player_id = $2' using v_g, p_id;
        execute 'update game.group_members set role = ''owner'' where group_id = $1 and player_id = $2' using v_g, v_next;
        if to_regclass('game.group_log') is not null then
          execute 'insert into game.group_log (group_id, kind, actor, target, data) values ($1, ''owner'', null, $2, ''{"auto":true,"why":"account_deleted"}''::jsonb)' using v_g, v_next;
        end if;
      end if;
      update game.groups set owner_id = v_next where id = v_g;
      n_tr := n_tr + 1;
    end if;
  end loop;

  -- 3. live rooms (draft): only when the rooms tables exist
  if to_regclass('game.rooms') is not null and to_regclass('game.room_seats') is not null then
    for v_rm in execute 'select r.id, r.status, r.host_id, s.seat from game.rooms r left join game.room_seats s on s.room_id = r.id and s.player_id = $1
                          where r.host_id = $1 or s.player_id = $1 order by r.id for update of r' using p_id loop
      execute 'select seat, player_id from game.room_seats where room_id = $1 and player_id <> $2 order by seat limit 1' into v_nx_seat, v_nx_pid using v_rm.id, p_id;
      if v_rm.status = 'lobby' then
        if v_rm.seat is not null then
          execute 'delete from game.room_seats where room_id = $1 and player_id = $2' using v_rm.id, p_id;
          execute 'select game.room_event($1, ''left'', $2)' using v_rm.id, jsonb_build_object('seat', v_rm.seat);
        end if;
        if v_nx_pid is null then
          execute 'update game.rooms set status = ''cancelled'', end_reason = ''empty'', finished_at = now() where id = $1' using v_rm.id;
        elsif v_rm.host_id = p_id then
          execute 'update game.rooms set host_id = $2 where id = $1' using v_rm.id, v_nx_pid;
          execute 'select game.room_event($1, ''host'', $2)' using v_rm.id, jsonb_build_object('seat', v_nx_seat);
          n_rooms := n_rooms + 1;
        end if;
        execute 'select game.room_touch($1)' using v_rm.id;
      elsif v_rm.status = 'playing' then
        if v_rm.seat is not null then
          execute 'update game.room_seats s set status = ''forfeit'', forfeit_round = r.round from game.rooms r
                    where r.id = s.room_id and s.room_id = $1 and s.player_id = $2 and s.status in (''playing'', ''away'')' using v_rm.id, p_id;
          execute 'update game.rooms set needs_tick = true where id = $1' using v_rm.id;
          execute 'select game.room_event($1, ''forfeit'', $2)' using v_rm.id, jsonb_build_object('seat', v_rm.seat, 'why', 'left');
        end if;
        if v_rm.host_id = p_id and v_nx_pid is not null then
          execute 'update game.rooms set host_id = $2 where id = $1' using v_rm.id, v_nx_pid;
          execute 'select game.room_event($1, ''host'', $2)' using v_rm.id, jsonb_build_object('seat', v_nx_seat);
          n_rooms := n_rooms + 1;
        end if;
        execute 'select game.room_touch($1)' using v_rm.id;
      else                                                                    -- finished / cancelled: keep the others' history
        if v_rm.host_id = p_id and v_nx_pid is not null then
          execute 'update game.rooms set host_id = $2 where id = $1' using v_rm.id, v_nx_pid;
          n_rooms := n_rooms + 1;
        end if;
      end if;
      if v_rm.seat is not null then                                           -- his nickname copy in the final ranking
        execute $q$update game.rooms set results = coalesce((select jsonb_agg(case when x.e->>'seat' = $2::text
                     then jsonb_set(x.e, '{nickname}', to_jsonb('שחקן לשעבר'::text)) else x.e end order by x.o)
                   from jsonb_array_elements(results) with ordinality x(e, o)), '[]'::jsonb)
                  where id = $1 and jsonb_typeof(results) = 'array'$q$ using v_rm.id, v_rm.seat;
      end if;
    end loop;
  end if;

  -- 4. the player row; the foreign keys do the rest
  delete from game.players where id = p_id;

  -- 5. audit (no personal data)
  insert into game.account_deletions (via, groups_transferred, groups_deleted, rooms_handed_over) values (p_via, n_tr, n_del, n_rooms);
  return json_build_object('deleted', true, 'groups_transferred', n_tr, 'groups_deleted', n_del);
end $$;

/** The player deletes his own account from the game or from /delete-account.html. p_confirm = his current nickname. */
create or replace function public.rr_delete_account(p_id uuid, p_secret text, p_confirm text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v_nick text;
begin
  perform game.auth(p_id, p_secret);
  select nickname into v_nick from game.players where id = p_id for update;  -- per-player lock (a parallel call waits here)
  if not found then raise exception 'unauthorized' using errcode = '28000'; end if;
  if game.is_admin(p_id) then raise exception 'admin_cannot_delete'; end if;
  if p_confirm is null or btrim(p_confirm) <> v_nick then raise exception 'confirm_mismatch'; end if;
  return game.delete_player(p_id, 'app');
end $$;

-- ------------------------------------------------------------------ grants: only the public RPC for the API roles
revoke all on function game.delete_player(uuid, text) from public, anon, authenticated;
revoke all on function public.rr_delete_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rr_delete_account(uuid, text, text) to anon, authenticated;
revoke all on table game.account_deletions from public, anon, authenticated;
revoke all on sequence game.account_deletions_id_seq from public, anon, authenticated;

commit;

-- ================================================================== ROLLBACK (run by hand; deleted accounts are NOT restored)
-- begin;
-- drop function if exists public.rr_delete_account(uuid, text, text), game.delete_player(uuid, text);
-- drop table if exists game.account_deletions;
-- commit;
