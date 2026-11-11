-- AZCL: Season 1 State Region Events and their sponsors, editable on the admin page (run once)
create table if not exists public.season_events (
  slot          integer primary key check (slot between 1 and 6),
  status        text not null default 'soon' check (status in ('soon','set')),
  title         text check (char_length(title) <= 80),
  dates_text    text check (char_length(dates_text) <= 80),
  venue         text check (char_length(venue) <= 120),
  city          text check (char_length(city) <= 60),
  blurb         text check (char_length(blurb) <= 500),
  logo_path     text,
  details_url   text check (char_length(details_url) <= 500),
  register_url  text check (char_length(register_url) <= 1000),
  updated_at    timestamptz not null default now()
);

create table if not exists public.season_sponsors (
  id         uuid primary key default gen_random_uuid(),
  slot       integer not null references public.season_events(slot) on delete cascade,
  role       text not null check (role in ('Title sponsor','Presenting sponsor','Venue','Trophy sponsor','Sponsor','Vendor')),
  name       text not null check (char_length(name) between 1 and 80),
  url        text check (char_length(url) <= 300),
  logo_path  text,
  created_at timestamptz not null default now()
);
create index if not exists season_sponsors_slot_idx on public.season_sponsors (slot, created_at);

alter table public.season_events   enable row level security;
alter table public.season_sponsors enable row level security;
create policy "anyone sees season events"   on public.season_events   for select using (true);
create policy "admins edit season events"   on public.season_events   for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "anyone sees season sponsors" on public.season_sponsors for select using (true);
create policy "admins add season sponsors"  on public.season_sponsors for insert to authenticated with check (public.is_admin());
create policy "admins edit season sponsors" on public.season_sponsors for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins remove season sponsors" on public.season_sponsors for delete to authenticated using (public.is_admin());
grant select on public.season_events, public.season_sponsors to anon, authenticated;
grant update on public.season_events to authenticated;
grant insert, update, delete on public.season_sponsors to authenticated;

-- Six slots; Event 1 is the Wild West Shoot Out
insert into public.season_events (slot, status, title, dates_text, venue, city, blurb, logo_path, details_url, register_url) values
  (1, 'set', 'Wild West Shoot Out', 'January 15–17, 2027', 'Dink & Dine Pickle Park', 'Mesa',
   'The inaugural event of the Arizona Cornhole League. Three days of Open and Rec singles and doubles, Crew Cup, Switcholio and invitationals, with something for every skill level.',
   'events/wwso-logo-2027.png', 'https://azwwso.com/',
   'https://app.scoreholio.com/v2/cornhole/player/findtournament?location=disabled&lat=&lng=&customType=Organizer&customId=GkSY6KWPK1WOTzZbW3j2IR5Ioxe2&cache=1794426766'),
  (2, 'soon', null, null, null, null, null, null, null, null),
  (3, 'soon', null, null, null, null, null, null, null, null),
  (4, 'soon', null, null, null, null, null, null, null, null),
  (5, 'soon', null, null, null, null, null, null, null, null),
  (6, 'soon', null, null, null, null, null, null, null, null)
on conflict (slot) do nothing;

insert into public.season_sponsors (slot, role, name, created_at) values
  (1, 'Title sponsor', 'Draggin'' Bags',          now()),
  (1, 'Venue',         'Dink & Dine Pickle Park', now() + interval '1 second'),
  (1, 'Vendor',        'Draggin'' Bags',          now() + interval '2 seconds'),
  (1, 'Vendor',        'Shot Kings Cornhole',     now() + interval '3 seconds'),
  (1, 'Vendor',        'Dominant Sports',         now() + interval '4 seconds'),
  (1, 'Vendor',        'Scooter Bagz (BG rep)',   now() + interval '5 seconds');
