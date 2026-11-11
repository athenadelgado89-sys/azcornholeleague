-- AZCL: requests from clubs to host a State Region Event (run once)
create table if not exists public.host_requests (
  id              uuid primary key default gen_random_uuid(),
  slot            integer check (slot between 1 and 6),
  club_id         uuid references public.clubs(id) on delete set null,
  venue           text not null check (char_length(venue) between 1 and 120),
  city            text not null check (char_length(city) between 1 and 60),
  preferred_dates text not null check (char_length(preferred_dates) between 1 and 120),
  boards          integer check (boards between 1 and 500),
  notes           text check (char_length(notes) <= 1500),
  contact_name    text not null check (char_length(contact_name) between 1 and 80),
  contact_email   text not null check (char_length(contact_email) between 3 and 120),
  contact_phone   text check (char_length(contact_phone) <= 30),
  handled         boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.host_requests enable row level security;
create policy "anyone requests to host" on public.host_requests for insert to anon, authenticated with check (handled = false);
create policy "admins read host requests" on public.host_requests for select to authenticated using (public.is_admin());
create policy "admins update host requests" on public.host_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete host requests" on public.host_requests for delete to authenticated using (public.is_admin());
grant insert on public.host_requests to anon, authenticated;
grant select, update, delete on public.host_requests to authenticated;
