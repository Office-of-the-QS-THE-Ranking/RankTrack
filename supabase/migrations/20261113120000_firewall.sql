-- The Hub's own firewall (2026-11-13), so the Office can inspect and filter traffic wherever the Hub is hosted.
-- The proxy (src/proxy.ts, src/lib/firewall) reads the settings and active rules through firewall_config, checks every
-- page and API request against them, and writes each request to firewall_requests through firewall_log after the
-- response is sent. Raw addresses are personal data (RA 10173): they are kept for retention_days only, then
-- firewall_purge deletes them. Like the other server-only tables, nothing but the Hub's secret key reaches these.

create table public.firewall_settings (
  id integer primary key default 1 check (id = 1),
  -- off: no checks, nothing recorded · log: record and report what rules would do · on: enforce
  mode text not null default 'log' check (mode in ('off', 'log', 'on')),
  -- Only requests with a session, and the sign-in pages, get through.
  lockdown boolean not null default false,
  -- Requests per minute from one address before it is refused for the rest of the minute; 0 turns it off.
  rate_limit integer not null default 600 check (rate_limit between 0 and 100000),
  -- Known vulnerability scanners and probes for files the Hub never serves (/.env, /wp-login.php …).
  block_scanners boolean not null default true,
  retention_days integer not null default 30 check (retention_days between 1 and 365),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.firewall_settings (id) values (1);

create table public.firewall_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('ip', 'country', 'path', 'agent')),
  -- An address or CIDR range, a two-letter country code, a path prefix, or text found in the user agent.
  value text not null check (length(value) between 1 and 200),
  action text not null check (action in ('block', 'allow', 'log')),
  enabled boolean not null default true,
  expires_at timestamptz,
  note text check (length(note) <= 300),
  hits bigint not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text
);

create table public.firewall_requests (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ip text not null,
  country text,
  city text,
  method text not null,
  host text,
  path text not null,
  agent text,
  referrer text,
  -- The request carried a Hub session cookie (not verified here; the pages verify it).
  session boolean not null default false,
  -- allow · log (flagged, or a rule that would have blocked while monitoring) · block · rate_limit · lockdown
  action text not null check (action in ('allow', 'log', 'block', 'rate_limit', 'lockdown')),
  -- No foreign key: a rule deleted while a proxy still holds it in memory mustn't lose the request.
  rule_id uuid,
  reason text
);
create index firewall_requests_at on public.firewall_requests (at desc);
create index firewall_requests_ip on public.firewall_requests (ip, at desc);
create index firewall_requests_action on public.firewall_requests (action, at desc);

alter table public.firewall_settings enable row level security;
alter table public.firewall_rules enable row level security;
alter table public.firewall_requests enable row level security;
revoke all on table public.firewall_settings, public.firewall_rules, public.firewall_requests from anon, authenticated;

-- What a proxy needs: the settings and the rules in force.
create function public.firewall_config()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) - 'updated_by' from public.firewall_settings s where id = 1),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'value', r.value, 'action', r.action) order by r.created_at)
      from public.firewall_rules r
      where r.enabled and (r.expires_at is null or r.expires_at > now())
    ), '[]'::jsonb)
  );
$$;

-- Record requests (one or a batch) and count the rules they matched.
create function public.firewall_log(p_rows jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.firewall_requests (at, ip, country, city, method, host, path, agent, referrer, session, action, rule_id, reason)
  select coalesce(x.at, now()), left(x.ip, 64), left(x.country, 8), left(x.city, 80), left(x.method, 10), left(x.host, 120), left(x.path, 512),
         left(x.agent, 300), left(x.referrer, 200), coalesce(x.session, false), x.action, x.rule_id, left(x.reason, 120)
  from jsonb_to_recordset(p_rows) as x(at timestamptz, ip text, country text, city text, method text, host text, path text, agent text,
                                         referrer text, session boolean, action text, rule_id uuid, reason text);
  update public.firewall_rules f
  set hits = f.hits + c.n, last_hit_at = now()
  from (
    select y.rule_id, count(*) as n from jsonb_to_recordset(p_rows) as y(rule_id uuid) where y.rule_id is not null group by y.rule_id
  ) c
  where f.id = c.rule_id;
end;
$$;

-- Delete requests older than the retention period. Returns how many went.
create function public.firewall_purge()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
  v_gone integer;
begin
  select retention_days into v_days from public.firewall_settings where id = 1;
  delete from public.firewall_requests where at < now() - make_interval(days => coalesce(v_days, 30));
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

-- Everything the Firewall page's overview shows for the requests since p_from, in steps of p_step.
create function public.firewall_summary(p_from timestamptz, p_step interval)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (
    select *, action in ('block', 'rate_limit', 'lockdown') as denied
    from public.firewall_requests
    where at >= p_from
  )
  select jsonb_build_object(
    'total', (select count(*) from r),
    'denied', (select count(*) from r where denied),
    'flagged', (select count(*) from r where action = 'log'),
    'ips', (select count(distinct ip) from r),
    'countries', (select count(distinct country) from r where country is not null),
    'sessions', (select count(*) from r where session),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('t', t, 'allowed', a, 'denied', d, 'flagged', f) order by t)
      from (
        select date_bin(p_step, at, p_from) as t,
               count(*) filter (where not denied and action <> 'log') as a,
               count(*) filter (where denied) as d,
               count(*) filter (where action = 'log') as f
        from r group by 1
      ) s
    ), '[]'::jsonb),
    'top_ips', coalesce((
      select jsonb_agg(jsonb_build_object('key', ip, 'country', country, 'n', n, 'denied', d, 'last', last, 'agent', agent) order by n desc)
      from (
        select ip, max(country) as country, count(*) as n, count(*) filter (where denied) as d, max(at) as last, max(agent) as agent
        from r group by ip order by n desc limit 12
      ) q
    ), '[]'::jsonb),
    'top_paths', coalesce((
      select jsonb_agg(jsonb_build_object('key', path, 'n', n, 'denied', d) order by n desc)
      from (select path, count(*) as n, count(*) filter (where denied) as d from r group by path order by n desc limit 10) q
    ), '[]'::jsonb),
    'top_countries', coalesce((
      select jsonb_agg(jsonb_build_object('key', c, 'n', n, 'denied', d) order by n desc)
      from (select coalesce(country, '') as c, count(*) as n, count(*) filter (where denied) as d from r group by 1 order by n desc limit 12) q
    ), '[]'::jsonb),
    'top_agents', coalesce((
      select jsonb_agg(jsonb_build_object('key', a, 'n', n, 'denied', d) order by n desc)
      from (select coalesce(agent, '') as a, count(*) as n, count(*) filter (where denied) as d from r group by 1 order by n desc limit 8) q
    ), '[]'::jsonb),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object('key', reason, 'action', action, 'n', n) order by n desc)
      from (
        select coalesce(reason, action) as reason, action, count(*) as n
        from r where action <> 'allow' group by 1, 2 order by n desc limit 10
      ) q
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.firewall_config() from public, anon, authenticated;
revoke all on function public.firewall_log(jsonb) from public, anon, authenticated;
revoke all on function public.firewall_purge() from public, anon, authenticated;
revoke all on function public.firewall_summary(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.firewall_config() to service_role;
grant execute on function public.firewall_log(jsonb) to service_role;
grant execute on function public.firewall_purge() to service_role;
grant execute on function public.firewall_summary(timestamptz, interval) to service_role;
