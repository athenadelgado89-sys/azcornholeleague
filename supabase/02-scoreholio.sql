-- =====================================================================
-- AZCL: Scoreholio import (run once, after setup.sql)
-- Paste into Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- Which Scoreholio organizer account belongs to each club
alter table public.clubs add column if not exists scoreholio_organizer_id text unique;

-- Organizers the importer has found running public tournaments in Arizona
create table if not exists public.scoreholio_organizers (
  id               text primary key,          -- Scoreholio organizer id
  name             text not null,
  ignored          boolean not null default false,
  upcoming_count   integer not null default 0,
  next_event_name  text,
  next_event_date  date,
  next_event_city  text,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now()
);
alter table public.scoreholio_organizers enable row level security;
create policy "admins read organizers"   on public.scoreholio_organizers for select to authenticated using (public.is_admin());
create policy "admins update organizers" on public.scoreholio_organizers for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.scoreholio_organizers to authenticated;

-- Extra fields for events imported from Scoreholio
alter table public.events add column if not exists source          text not null default 'manual' check (source in ('manual','scoreholio'));
alter table public.events add column if not exists scoreholio_id   text unique;
alter table public.events add column if not exists entry_fee       text;
alter table public.events add column if not exists registered_teams integer;
alter table public.events add column if not exists max_teams       integer;
alter table public.events add column if not exists synced_at       timestamptz;

-- Let admins hide an imported event without the importer re-adding it
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('pending','approved','hidden'));

-- The importer (GitHub Actions) uses the Supabase secret key, which acts as service_role.
-- New tables aren't exposed automatically in this project, so grant it access explicitly.
grant select, insert, update, delete on public.scoreholio_organizers to service_role;
grant select, insert, update, delete on public.events to service_role;
grant select on public.clubs to service_role;
