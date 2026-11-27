-- Command & Control › Web Analytics (2026-11-14): the Hub's own, cookieless page analytics, so the Office sees which
-- pages people visit and where they come from wherever the Hub is hosted. Every page sends a page view to /api/pulse
-- (components/ui/WebAnalytics.tsx), which records it through web_analytics_record after the response is sent.
--
-- No addresses and no cookies: a visitor is a hash of the day's secret salt, the address and the browser, so the same
-- person counts once a day and can't be followed from one day to the next. Query strings are dropped except the UTM
-- tags, and secret form links (/f/<code>) are recorded as /f/[code]. Like the firewall's tables, only the Hub's secret
-- key reaches these.

create table public.web_analytics_settings (
  id integer primary key default 1 check (id = 1),
  -- Off until the Office switches it on.
  enabled boolean not null default false,
  retention_days integer not null default 180 check (retention_days between 7 and 730),
  -- Development servers share the production database, so their visits count only when this is on.
  dev_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.web_analytics_settings (id) values (1);

create table public.web_analytics_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- pageview · event (a custom event, named)
  kind text not null check (kind in ('pageview', 'event')),
  name text check (length(name) <= 60),
  -- A daily-rotating hash, never an address.
  visitor text not null check (length(visitor) between 8 and 64),
  -- site (public pages) · portal (/admin, /portal) · form (/f) · signin
  area text not null check (area in ('site', 'portal', 'form', 'signin')),
  host text,
  path text not null,
  -- The path with record ids and codes replaced, so /f/AB12 and /f/CD34 count as one route.
  route text not null,
  -- The referring site's host; null for direct visits and the Hub's own pages.
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country text,
  device text check (device in ('desktop', 'mobile', 'tablet')),
  browser text,
  os text,
  props jsonb
);
create index web_analytics_events_at on public.web_analytics_events (at desc);
create index web_analytics_events_kind on public.web_analytics_events (kind, at desc);

alter table public.web_analytics_settings enable row level security;
alter table public.web_analytics_events enable row level security;
revoke all on table public.web_analytics_settings, public.web_analytics_events from anon, authenticated;

-- Record page views and events (one or a batch).
create function public.web_analytics_record(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.web_analytics_events (at, kind, name, visitor, area, host, path, route, referrer, utm_source, utm_medium, utm_campaign, country, device, browser, os, props)
  select coalesce(x.at, now()), x.kind, left(x.name, 60), left(x.visitor, 64), x.area, left(x.host, 120), left(x.path, 512), left(x.route, 512),
         left(x.referrer, 200), left(x.utm_source, 100), left(x.utm_medium, 100), left(x.utm_campaign, 100), left(x.country, 8),
         x.device, left(x.browser, 40), left(x.os, 40), x.props
  from jsonb_to_recordset(p_rows) as x(at timestamptz, kind text, name text, visitor text, area text, host text, path text, route text,
                                       referrer text, utm_source text, utm_medium text, utm_campaign text, country text, device text,
                                       browser text, os text, props jsonb);
$$;

-- Delete records older than the retention period. Returns how many went.
create function public.web_analytics_purge()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
  v_gone integer;
begin
  select retention_days into v_days from public.web_analytics_settings where id = 1;
  delete from public.web_analytics_events where at < now() - make_interval(days => coalesce(v_days, 180));
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

-- Everything the overview shows for [p_from, now), in steps of p_step, with the totals for [p_prev_from, p_from) to
-- compare. p_area narrows it to one part of the Hub (null: all of it). Bounce rate is the share of visitors who saw
-- one page and left; a visitor's hash changes daily, so a visitor here is one person on one day.
create function public.web_analytics_summary(p_from timestamptz, p_prev_from timestamptz, p_step interval, p_area text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select * from public.web_analytics_events
    where at >= p_prev_from and (p_area is null or area = p_area)
  ),
  cur as (select * from e where at >= p_from),
  pv as (select * from cur where kind = 'pageview'),
  prev as (select * from e where at < p_from and kind = 'pageview'),
  per_visitor as (
    select visitor, count(*) as n, min(at) as first from pv group by visitor
  ),
  prev_visitor as (
    select visitor, count(*) as n from prev group by visitor
  )
  select jsonb_build_object(
    'visitors', (select count(*) from per_visitor),
    'pageviews', (select count(*) from pv),
    'bounced', (select count(*) from per_visitor where n = 1),
    'prev_visitors', (select count(*) from prev_visitor),
    'prev_pageviews', (select count(*) from prev),
    'prev_bounced', (select count(*) from prev_visitor where n = 1),
    'online', (select count(distinct visitor) from pv where at >= now() - interval '5 minutes'),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('t', s.t, 'visitors', s.v, 'pageviews', s.p, 'bounced', coalesce(b.b, 0), 'arrived', coalesce(b.f, 0)) order by s.t)
      from (select date_bin(p_step, at, p_from) as t, count(distinct visitor) as v, count(*) as p from pv group by 1) s
      left join (select date_bin(p_step, first, p_from) as t, count(*) filter (where n = 1) as b, count(*) as f from per_visitor group by 1) b on b.t = s.t
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('key', path, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select path, count(distinct visitor) as v, count(*) as n from pv group by path order by v desc, n desc limit 12) q
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object('key', route, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select route, count(distinct visitor) as v, count(*) as n from pv group by route order by v desc, n desc limit 12) q
    ), '[]'::jsonb),
    'hosts', coalesce((
      select jsonb_agg(jsonb_build_object('key', h, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select coalesce(host, '') as h, count(distinct visitor) as v, count(*) as n from pv group by 1 order by v desc, n desc limit 12) q
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(jsonb_build_object('key', referrer, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select referrer, count(distinct visitor) as v, count(*) as n from pv where referrer is not null group by referrer order by v desc, n desc limit 12) q
    ), '[]'::jsonb),
    'direct', (select count(distinct visitor) from pv where referrer is null),
    'utm', coalesce((
      select jsonb_agg(jsonb_build_object('key', k, 'visitors', v, 'n', n) order by v desc, n desc)
      from (
        select concat_ws(' · ', utm_source, utm_medium, utm_campaign) as k, count(distinct visitor) as v, count(*) as n
        from pv where coalesce(utm_source, utm_medium, utm_campaign) is not null group by 1 order by v desc, n desc limit 12
      ) q
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('key', c, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select coalesce(country, '') as c, count(distinct visitor) as v, count(*) as n from pv group by 1 order by v desc, n desc limit 12) q
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('key', d, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select coalesce(device, 'desktop') as d, count(distinct visitor) as v, count(*) as n from pv group by 1) q
    ), '[]'::jsonb),
    'browsers', coalesce((
      select jsonb_agg(jsonb_build_object('key', b, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select coalesce(browser, 'Other') as b, count(distinct visitor) as v, count(*) as n from pv group by 1 order by v desc, n desc limit 8) q
    ), '[]'::jsonb),
    'os', coalesce((
      select jsonb_agg(jsonb_build_object('key', o, 'visitors', v, 'n', n) order by v desc, n desc)
      from (select coalesce(os, 'Other') as o, count(distinct visitor) as v, count(*) as n from pv group by 1 order by v desc, n desc limit 8) q
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('key', name, 'visitors', v, 'n', n, 'last', last) order by n desc)
      from (
        select name, count(distinct visitor) as v, count(*) as n, max(at) as last
        from cur where kind = 'event' and name is not null group by name order by n desc limit 50
      ) q
    ), '[]'::jsonb)
  );
$$;

-- The latest custom events, for the Events tab.
create function public.web_analytics_recent_events(p_from timestamptz, p_area text default null, p_limit integer default 100)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'name', name, 'path', path, 'area', area, 'country', country, 'device', device, 'props', props) order by at desc), '[]'::jsonb)
  from (
    select * from public.web_analytics_events
    where kind = 'event' and at >= p_from and (p_area is null or area = p_area)
    order by at desc limit least(greatest(p_limit, 1), 200)
  ) q;
$$;

revoke all on function public.web_analytics_record(jsonb) from public, anon, authenticated;
revoke all on function public.web_analytics_purge() from public, anon, authenticated;
revoke all on function public.web_analytics_summary(timestamptz, timestamptz, interval, text) from public, anon, authenticated;
revoke all on function public.web_analytics_recent_events(timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.web_analytics_record(jsonb) to service_role;
grant execute on function public.web_analytics_purge() to service_role;
grant execute on function public.web_analytics_summary(timestamptz, timestamptz, interval, text) to service_role;
grant execute on function public.web_analytics_recent_events(timestamptz, text, integer) to service_role;
