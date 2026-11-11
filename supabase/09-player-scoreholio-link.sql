-- AZCL: players can add a link to their own Scoreholio player page (run once)
alter table public.players add column if not exists scoreholio_url text check (char_length(scoreholio_url) <= 500);
