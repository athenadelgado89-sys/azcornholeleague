-- =====================================================================
-- AZCL: club pages and club logins (run once)
-- Paste into Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- ---------- Club page fields ----------
alter table public.clubs add column if not exists about            text check (char_length(about) <= 3000);
alter table public.clubs add column if not exists event_types      text[] not null default '{}'
  check (event_types <@ array['Weeknights','Fundraisers','Private','Corporate','Non-profit']::text[]);
alter table public.clubs add column if not exists booking_enabled  boolean not null default false;
alter table public.clubs add column if not exists booking_email    text check (char_length(booking_email) <= 120);
alter table public.clubs add column if not exists potw_name        text check (char_length(potw_name) <= 80);
alter table public.clubs add column if not exists potw_blurb       text check (char_length(potw_blurb) <= 400);
alter table public.clubs add column if not exists potw_photo_path  text;
alter table public.clubs add column if not exists potw_updated_at  timestamptz;

-- ---------- Who manages which club ----------
create table if not exists public.club_managers (
  club_id    uuid not null references public.clubs(id) on delete cascade,
  email      text not null check (email = lower(email) and char_length(email) between 3 and 120),
  created_at timestamptz not null default now(),
  primary key (club_id, email)
);

create or replace function public.is_club_manager(cid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.club_managers
    where club_id = cid and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_club_manager(uuid) to anon, authenticated;

alter table public.club_managers enable row level security;
create policy "managers see own links" on public.club_managers for select to authenticated
  using (public.is_admin() or email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "admins add managers"    on public.club_managers for insert to authenticated with check (public.is_admin());
create policy "admins remove managers" on public.club_managers for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.club_managers to authenticated;

-- ---------- Managers edit their own club (but not its approval status or Scoreholio link) ----------
create policy "managers update own club" on public.clubs for update to authenticated
  using (status = 'approved' and public.is_club_manager(id))
  with check (status = 'approved' and public.is_club_manager(id));

create or replace function public.protect_club_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.replaces := old.replaces;
    new.scoreholio_organizer_id := old.scoreholio_organizer_id;
    new.name := old.name;          -- name and city changes still go through approval
    new.city := old.city;
  end if;
  if not new.booking_enabled then new.booking_email := null; end if;
  return new;
end;
$$;
drop trigger if exists protect_club_fields on public.clubs;
create trigger protect_club_fields before update on public.clubs
  for each row execute function public.protect_club_fields();

-- ---------- Photos ----------
create table if not exists public.club_photos (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  path       text not null,
  caption    text check (char_length(caption) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists club_photos_club_idx on public.club_photos (club_id, created_at desc);
alter table public.club_photos enable row level security;
create policy "anyone sees club photos" on public.club_photos for select using (true);
create policy "managers add photos"    on public.club_photos for insert to authenticated with check (public.is_club_manager(club_id));
create policy "managers edit photos"   on public.club_photos for update to authenticated using (public.is_club_manager(club_id)) with check (public.is_club_manager(club_id));
create policy "managers remove photos" on public.club_photos for delete to authenticated using (public.is_club_manager(club_id));
grant select on public.club_photos to anon, authenticated;
grant insert, update, delete on public.club_photos to authenticated;

-- ---------- Sponsors ----------
create table if not exists public.club_sponsors (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  logo_path  text,
  url        text check (char_length(url) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists club_sponsors_club_idx on public.club_sponsors (club_id, created_at);
alter table public.club_sponsors enable row level security;
create policy "anyone sees sponsors"     on public.club_sponsors for select using (true);
create policy "managers add sponsors"    on public.club_sponsors for insert to authenticated with check (public.is_club_manager(club_id));
create policy "managers edit sponsors"   on public.club_sponsors for update to authenticated using (public.is_club_manager(club_id)) with check (public.is_club_manager(club_id));
create policy "managers remove sponsors" on public.club_sponsors for delete to authenticated using (public.is_club_manager(club_id));
grant select on public.club_sponsors to anon, authenticated;
grant insert, update, delete on public.club_sponsors to authenticated;

-- ---------- Uploads: allow the club page folders ----------
drop policy if exists "anyone uploads logos and flyers" on storage.objects;
create policy "anyone uploads logos and flyers" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] in ('clubs','vendors','events','club-photos','sponsors','potw'));
