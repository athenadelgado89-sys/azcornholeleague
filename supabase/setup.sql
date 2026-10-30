-- =====================================================================
-- AZCL website database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a new project.
-- =====================================================================

-- ---------- Admins: who can approve, edit and remove listings ----------
create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values ('athena.delgado89@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins enable row level security;
create policy "admins read admins" on public.admins
  for select to authenticated using (public.is_admin());

-- ---------- Clubs ----------
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending','approved')),
  replaces    uuid references public.clubs(id) on delete cascade,  -- set when this row is a proposed update to a live club
  name        text not null check (char_length(name) between 1 and 80),
  city        text not null check (char_length(city) between 1 and 60),
  logo_path   text,
  website     text, facebook text, instagram text, tiktok text, youtube text,
  scoreholio  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Vendors ----------
create table if not exists public.vendors (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending','approved')),
  replaces    uuid references public.vendors(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  category    text check (category in ('Bags','Boards','Bags & Boards','Apparel & Custom Design','Events & Rentals','Other')),
  city        text check (char_length(city) <= 60),
  blurb       text check (char_length(blurb) <= 140),
  logo_path   text,
  website     text, shop text, facebook text, instagram text, tiktok text, youtube text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Events ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending','approved')),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  event_date  date not null,
  start_time  time,
  format      text check (format in ('Singles','Doubles','Blind Draw / SWAP','Other')),
  location    text not null check (char_length(location) between 1 and 120),
  scoreholio  text not null,
  details     text check (char_length(details) <= 1500),
  flyer_path  text,
  flyer_type  text,
  created_at  timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (event_date);

-- ---------- Submitter contact info (private: only admins can read) ----------
create table if not exists public.submission_contacts (
  id          uuid primary key default gen_random_uuid(),
  item_type   text not null check (item_type in ('club','vendor','event')),
  item_id     uuid not null,
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null check (char_length(email) between 3 and 120),
  phone       text check (char_length(phone) <= 30),
  created_at  timestamptz not null default now()
);
create index if not exists contacts_item_idx on public.submission_contacts (item_id);

-- ---------- Row level security ----------
alter table public.clubs   enable row level security;
alter table public.vendors enable row level security;
alter table public.events  enable row level security;
alter table public.submission_contacts enable row level security;

-- Everyone sees approved listings; admins see everything.
create policy "read approved clubs"   on public.clubs   for select using (status = 'approved' or public.is_admin());
create policy "read approved vendors" on public.vendors for select using (status = 'approved' or public.is_admin());
create policy "read approved events"  on public.events  for select using (status = 'approved' or public.is_admin());

-- Anyone can submit, but only as pending.
create policy "submit clubs"   on public.clubs   for insert with check (status = 'pending' or public.is_admin());
create policy "submit vendors" on public.vendors for insert with check (status = 'pending' or public.is_admin());
create policy "submit events"  on public.events  for insert with check (status = 'pending' or public.is_admin());

-- Only admins approve, edit or remove.
create policy "admins update clubs"   on public.clubs   for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins update vendors" on public.vendors for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins update events"  on public.events  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete clubs"   on public.clubs   for delete to authenticated using (public.is_admin());
create policy "admins delete vendors" on public.vendors for delete to authenticated using (public.is_admin());
create policy "admins delete events"  on public.events  for delete to authenticated using (public.is_admin());

-- Contacts: anyone can attach one to a submission; only admins read or delete.
create policy "submit contact"  on public.submission_contacts for insert with check (true);
create policy "admins read contacts"   on public.submission_contacts for select to authenticated using (public.is_admin());
create policy "admins delete contacts" on public.submission_contacts for delete to authenticated using (public.is_admin());

grant select, insert on public.clubs, public.vendors, public.events to anon, authenticated;
grant update, delete on public.clubs, public.vendors, public.events to authenticated;
grant insert on public.submission_contacts to anon, authenticated;
grant select, delete on public.submission_contacts to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- File uploads (logos and flyers), max 5 MB ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 5242880,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "anyone uploads logos and flyers" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] in ('clubs','vendors','events'));
create policy "admins remove uploads" on storage.objects
  for delete to authenticated using (bucket_id = 'uploads' and public.is_admin());

-- ---------- Starting listings from the AZCL planning doc ----------
insert into public.clubs (status, name, city) values
  ('approved','Arizona Cornhole Connection','Sahuarita'),
  ('approved','Triple Play Cornhole','Green Valley'),
  ('approved','Gigi''s Cornhole','Mesa'),
  ('approved','Mandeezy Cornhole','Phoenix'),
  ('approved','Kingman Cornhole','Kingman'),
  ('approved','K-Town Baggers','Kingman'),
  ('approved','Valley Baggers','Mesa'),
  ('approved','Cornhole in the Pines','Munds Park'),
  ('approved','Cornhole Therapy','Mesa'),
  ('approved','Shot Kings Cornhole','Maricopa'),
  ('approved','Marana Baggers','Marana'),
  ('approved','Route 66 Baggers','Winslow'),
  ('approved','Sunset Sliders','Phoenix');

insert into public.vendors (status, name, category, city, blurb) values
  ('approved','Draggin'' Bags','Bags',null,'Premier cornhole bags'),
  ('approved','AZbagz','Bags & Boards',null,'Cornhole boards and events'),
  ('approved','Team "Mexi-can & Mexi-can''t"',null,null,null),
  ('approved','Desert SawTooth Design',null,null,null),
  ('approved','Scooter Bagz','Bags',null,null),
  ('approved','Shot Kings Cornhole',null,'Maricopa',null),
  ('approved','Little 6 Designs',null,null,null),
  ('approved','Original Cornhole Company',null,null,null);
