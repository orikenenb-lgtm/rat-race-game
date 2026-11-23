-- Admin (owner) powers — additive only. One admin, claimed ONCE with a one-time code whose SHA-256 is stored here
-- (the code itself never touches the repo or the DB). The admin can: see the player list (nickname, stars, joined),
-- give ⚡ to any player (delivered through the existing energy_gifts inbox → rr_claim_energy), and the client unlocks
-- every world for the admin's own free / learning play. Ranked games are untouched (daily/weekly/challenge rules unchanged).
create table if not exists game.admins (player_id uuid primary key references game.players(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists game.admin_setup (id int primary key default 1 check (id = 1), code_hash bytea not null, used_at timestamptz);
alter table game.admins enable row level security;
alter table game.admin_setup enable row level security;
revoke all on game.admins, game.admin_setup from public, anon, authenticated;
insert into game.admin_setup(id, code_hash) values (1, decode('2468be918840e09423cd30294f8732f07ba5f61cb06888cd22a892afdf50fec0', 'hex')) on conflict (id) do nothing;

-- energy_gifts: an 'admin' kind with amounts up to 99 (gift/referral stay as they were: max 20)
alter table game.energy_gifts drop constraint if exists energy_gifts_kind_check;
alter table game.energy_gifts drop constraint if exists energy_gifts_amount_check;
alter table game.energy_gifts add constraint energy_gifts_kind_check check (kind = any (array['gift','referral','admin']));
alter table game.energy_gifts add constraint energy_gifts_amount_check check (amount >= 1 and (amount <= 20 or (kind = 'admin' and amount <= 99)));

create or replace function game.is_admin(p_id uuid) returns boolean language sql stable security definer set search_path = '' as
$$ select exists(select 1 from game.admins where player_id = p_id) $$;
revoke all on function game.is_admin(uuid) from public, anon, authenticated;

create or replace function public.rr_admin_status(p_id uuid, p_secret text) returns json language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  return json_build_object('admin', game.is_admin(p_id));
end $$;

create or replace function public.rr_admin_claim(p_id uuid, p_secret text, p_code text) returns json language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  perform game.auth(p_id, p_secret);
  if game.is_admin(p_id) then return json_build_object('admin', true); end if;
  update game.admin_setup set used_at = now()
   where id = 1 and used_at is null and code_hash = extensions.digest(upper(trim(coalesce(p_code, ''))), 'sha256')
     and not exists (select 1 from game.admins)
  returning true into v_ok;
  if v_ok is not true then
    perform pg_sleep(1);                                  -- slows guessing
    raise exception 'bad_code';
  end if;
  insert into game.admins(player_id) values (p_id);
  return json_build_object('admin', true);
end $$;

create or replace function public.rr_admin_players(p_id uuid, p_secret text, p_q text) returns json language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  if not game.is_admin(p_id) then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(x) from (
    select p.id, p.nickname, p.total_stars as stars, p.created_at::date as joined
      from game.players p
     where coalesce(p_q, '') = '' or p.nickname ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%'
     order by p.created_at desc limit 60) x), '[]'::json);
end $$;

create or replace function public.rr_admin_give(p_id uuid, p_secret text, p_to uuid, p_amount int) returns json language plpgsql security definer set search_path = '' as $$
begin
  perform game.auth(p_id, p_secret);
  if not game.is_admin(p_id) then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 99 then raise exception 'bad_amount'; end if;
  if not exists (select 1 from game.players where id = p_to) then raise exception 'player_not_found'; end if;
  insert into game.energy_gifts(from_id, to_id, kind, amount) values (p_id, p_to, 'admin', p_amount);
  return json_build_object('ok', true);
end $$;

revoke all on function public.rr_admin_status(uuid, text), public.rr_admin_claim(uuid, text, text),
  public.rr_admin_players(uuid, text, text), public.rr_admin_give(uuid, text, uuid, int) from public;
grant execute on function public.rr_admin_status(uuid, text), public.rr_admin_claim(uuid, text, text),
  public.rr_admin_players(uuid, text, text), public.rr_admin_give(uuid, text, uuid, int) to anon, authenticated;
