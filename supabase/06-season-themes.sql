-- AZCL: per-event colors and heading font for State Region Event cards (run once)
alter table public.season_events add column if not exists theme_bg        text check (theme_bg ~ '^#[0-9A-Fa-f]{6}$');
alter table public.season_events add column if not exists theme_text      text check (theme_text ~ '^#[0-9A-Fa-f]{6}$');
alter table public.season_events add column if not exists theme_accent    text check (theme_accent ~ '^#[0-9A-Fa-f]{6}$');
alter table public.season_events add column if not exists theme_highlight text check (theme_highlight ~ '^#[0-9A-Fa-f]{6}$');
alter table public.season_events add column if not exists theme_font      text not null default 'default' check (theme_font in ('default','bebas'));

-- Wild West Shoot Out colors, from azwwso.com
update public.season_events
   set theme_bg = '#202322', theme_text = '#F5F5DC', theme_accent = '#C65D3A', theme_highlight = '#E6B65B', theme_font = 'bebas'
 where slot = 1;
