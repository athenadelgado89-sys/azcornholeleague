-- =====================================================================
-- AZCL: player profiles (run once, in two parts if the paste gets cut off)
-- =====================================================================

-- ---------- PART 1: profiles ----------
create table if not exists public.players (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete cascade,
  display_name          text not null check (char_length(display_name) between 2 and 80),
  city                  text check (char_length(city) <= 60),
  home_club_id          uuid references public.clubs(id) on delete set null,
  about                 text check (char_length(about) <= 1500),
  photo_path            text,
  website text, facebook text, instagram text, tiktok text, youtube text,
  scoreholio_player_id  text,               -- set by an admin to link season stats
  hidden                boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create or replace function public.is_player_owner(pid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.players where id = pid and user_id = auth.uid()); $$;
grant execute on function public.is_player_owner(uuid) to anon, authenticated;

alter table public.players enable row level security;
create policy "anyone sees visible players" on public.players for select
  using (not hidden or user_id = auth.uid() or public.is_admin());
create policy "players create own profile" on public.players for insert to authenticated
  with check (user_id = auth.uid() and not hidden and scoreholio_player_id is null);
create policy "players edit own profile" on public.players for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "players delete own profile" on public.players for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select on public.players to anon, authenticated;
grant insert, update, delete on public.players to authenticated;

-- Players can't un-hide themselves or set their own Scoreholio link
create or replace function public.protect_player_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.hidden := old.hidden;
    new.scoreholio_player_id := old.scoreholio_player_id;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_player_fields on public.players;
create trigger protect_player_fields before update on public.players
  for each row execute function public.protect_player_fields();

-- ---------- PART 2: photos, sponsors, results, season stats ----------
create table if not exists public.player_photos (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  path text not null,
  caption text check (char_length(caption) <= 140),
  created_at timestamptz not null default now()
);
create or replace function public.limit_player_photos()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.player_photos where player_id = new.player_id) >= 10 then
    raise exception 'Players can have up to 10 podium photos';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_player_photos on public.player_photos;
create trigger limit_player_photos before insert on public.player_photos
  for each row execute function public.limit_player_photos();

create table if not exists public.player_sponsors (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  url text check (char_length(url) <= 300),
  logo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.player_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 1 and 120),
  event_date date not null,
  finish text not null check (char_length(finish) between 1 and 30),
  division text check (char_length(division) <= 60),
  partner text check (char_length(partner) <= 80),
  created_at timestamptz not null default now()
);

alter table public.player_photos   enable row level security;
alter table public.player_sponsors enable row level security;
alter table public.player_results  enable row level security;
create policy "anyone sees player photos"   on public.player_photos   for select using (true);
create policy "anyone sees player sponsors" on public.player_sponsors for select using (true);
create policy "anyone sees player results"  on public.player_results  for select using (true);
create policy "owner adds photos"     on public.player_photos   for insert to authenticated with check (public.is_player_owner(player_id) or public.is_admin());
create policy "owner removes photos"  on public.player_photos   for delete to authenticated using (public.is_player_owner(player_id) or public.is_admin());
create policy "owner adds sponsors"   on public.player_sponsors for insert to authenticated with check (public.is_player_owner(player_id) or public.is_admin());
create policy "owner removes sponsors" on public.player_sponsors for delete to authenticated using (public.is_player_owner(player_id) or public.is_admin());
create policy "owner adds results"    on public.player_results  for insert to authenticated with check (public.is_player_owner(player_id) or public.is_admin());
create policy "owner removes results" on public.player_results  for delete to authenticated using (public.is_player_owner(player_id) or public.is_admin());
grant select on public.player_photos, public.player_sponsors, public.player_results to anon, authenticated;
grant insert, delete on public.player_photos, public.player_sponsors, public.player_results to authenticated;

-- Season rankings imported from AZCL's Scoreholio Season (written by the hourly import)
create table if not exists public.season_player_stats (
  season_id            text not null,
  season_name          text,
  division             text not null,
  scoreholio_player_id text not null,
  player_name          text not null,
  club_name            text,
  rank                 integer,
  points               numeric,
  played               integer,
  first                integer,
  second               integer,
  third                integer,
  podium               integer,
  best                 integer,
  updated_at           timestamptz not null default now(),
  primary key (season_id, division, scoreholio_player_id)
);
alter table public.season_player_stats enable row level security;
create policy "anyone sees season stats" on public.season_player_stats for select using (true);
grant select on public.season_player_stats to anon, authenticated;
grant select, insert, update, delete on public.season_player_stats to service_role;

-- Upload folders for players
drop policy if exists "anyone uploads logos and flyers" on storage.objects;
create policy "anyone uploads logos and flyers" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] in ('clubs','vendors','events','club-photos','sponsors','potw','players','player-photos'));
