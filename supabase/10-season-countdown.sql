-- AZCL: start time for the countdown on State Region Event cards (run once)
alter table public.season_events add column if not exists starts_at timestamptz;
update public.season_events set starts_at = '2027-01-15 14:00:00-07' where slot = 1 and starts_at is null;  -- WWSO doors open 2:00 PM
