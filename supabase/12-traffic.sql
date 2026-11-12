-- AZCL: anonymous traffic stats (no cookies, no names, no IP addresses) (run once)
create table if not exists public.site_events (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz not null default now(),
  kind     text not null check (kind in ('view','action')),
  name     text not null check (char_length(name) between 1 and 40),
  target   text check (char_length(target) <= 80),
  ref      text check (char_length(ref) <= 120),
  device   text check (device in ('mobile','tablet','desktop')),
  in_app   boolean not null default false,
  visitor  text check (char_length(visitor) <= 40)
);
create index if not exists site_events_at_idx on public.site_events (at);
alter table public.site_events enable row level security;
create policy "anyone records a visit" on public.site_events for insert to anon, authenticated with check (true);
create policy "admins read visits"     on public.site_events for select to authenticated using (public.is_admin());
grant insert on public.site_events to anon, authenticated;
grant select on public.site_events to authenticated;

-- One call returns everything the admin Traffic tab shows, for the last N days (Arizona dates)
create or replace function public.traffic_summary(days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare since timestamptz := (date_trunc('day', now() at time zone 'America/Phoenix') - make_interval(days => greatest(days, 1) - 1)) at time zone 'America/Phoenix';
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'totals', (select jsonb_build_object(
        'views',    count(*) filter (where kind = 'view'),
        'visitors', count(distinct visitor) filter (where kind = 'view'),
        'app_views', count(*) filter (where kind = 'view' and in_app),
        'scoreholio', count(*) filter (where kind = 'action' and name = 'scoreholio'))
      from site_events where at >= since),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'views', v, 'visitors', u) order by d) from (
        select (at at time zone 'America/Phoenix')::date as d, count(*) as v, count(distinct visitor) as u
        from site_events where kind = 'view' and at >= since group by 1) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'target', target, 'views', c) order by c desc) from (
        select name, target, count(*) as c from site_events where kind = 'view' and at >= since group by 1, 2 order by 3 desc limit 15) x), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'visits', c) order by c desc) from (
        select ref, count(*) as c from site_events where kind = 'view' and at >= since and ref is not null group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_object_agg(device, c) from (
        select coalesce(device, 'desktop') as device, count(distinct visitor) as c from site_events where kind = 'view' and at >= since group by 1) x), '{}'::jsonb),
    'actions', coalesce((select jsonb_object_agg(name, c) from (
        select name, count(*) as c from site_events where kind = 'action' and at >= since group by 1) x), '{}'::jsonb)
  );
end;
$$;
grant execute on function public.traffic_summary(integer) to authenticated;
