-- AZCL: months for State Region Events 2–6, the 2027 State Championships card,
-- and sponsor logos/links filled in from the club and vendor directories (run once)

-- Allow a 7th card for the State Championships
alter table public.season_events drop constraint if exists season_events_slot_check;
alter table public.season_events add constraint season_events_slot_check check (slot between 1 and 7);
alter table public.season_events add column if not exists kind text not null default 'region' check (kind in ('region','championship'));

-- Months for events 2–6
update public.season_events set dates_text = 'February 2027' where slot = 2 and dates_text is null;
update public.season_events set dates_text = 'March 2027'    where slot = 3 and dates_text is null;
update public.season_events set dates_text = 'April 2027'    where slot = 4 and dates_text is null;
update public.season_events set dates_text = 'May 2027'      where slot = 5 and dates_text is null;
update public.season_events set dates_text = 'June 2027'     where slot = 6 and dates_text is null;

-- 2027 Arizona State Cornhole Championships (black and gold)
insert into public.season_events (slot, kind, status, title, dates_text, logo_path, theme_bg, theme_text, theme_accent, theme_highlight, theme_font)
values (7, 'championship', 'soon', '2027 Arizona State Cornhole Championships', 'Summer 2027',
        'assets/state-champs-2027.png', '#0B0B0B', '#F3E5B5', '#D4AF37', '#D4AF37', 'default')
on conflict (slot) do nothing;

-- Fill in logos and websites for existing event sponsors from the directories (only where blank)
update public.season_sponsors s
   set logo_path = coalesce(s.logo_path, v.logo_path),
       url       = coalesce(s.url, v.website, v.shop, v.facebook, v.instagram)
  from public.vendors v
 where v.status = 'approved' and lower(s.name) like lower(v.name) || '%';
update public.season_sponsors s
   set logo_path = coalesce(s.logo_path, c.logo_path),
       url       = coalesce(s.url, c.website, c.facebook, c.instagram, c.scoreholio)
  from public.clubs c
 where c.status = 'approved' and lower(s.name) like lower(c.name) || '%';
