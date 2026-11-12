-- AZCL: contact form messages (run once)
create table if not exists public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  topic         text not null check (topic in ('Add my club to the directory','Become a sponsor','Find a league','Hire a director','Other')),
  name          text not null check (char_length(name) between 1 and 80),
  email         text not null check (char_length(email) between 3 and 120),
  phone         text check (char_length(phone) <= 30),
  organization  text check (char_length(organization) <= 120),
  city          text check (char_length(city) <= 60),
  message       text not null check (char_length(message) between 1 and 3000),
  handled       boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
create policy "anyone sends a message" on public.contact_messages for insert to anon, authenticated with check (handled = false);
create policy "admins read messages"   on public.contact_messages for select to authenticated using (public.is_admin());
create policy "admins update messages" on public.contact_messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete messages" on public.contact_messages for delete to authenticated using (public.is_admin());
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
