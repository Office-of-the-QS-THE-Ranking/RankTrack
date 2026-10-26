-- Counters the Hub's public endpoints update on every call, kept out of the governance store so a burst of
-- visitors never rewrites (or contends for) the whole store document. Like the store, only the Hub's server
-- reaches them, with the project's secret key: row-level security is on with no policies, and the API roles
-- have neither table grants nor execute rights on the functions.

-- Fixed-window rate limits for public actions (access requests, the request tracker, post views), keyed by
-- action and a hashed client address.
create table public.hub_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- Anonymous views of public Impact and Innovation posts, one row per post and Manila calendar day.
create table public.hub_post_views (
  slug text not null,
  day date not null,
  views integer not null default 0,
  last_viewed_at timestamptz not null default now(),
  primary key (slug, day)
);

alter table public.hub_rate_limits enable row level security;
alter table public.hub_post_views enable row level security;

revoke all on table public.hub_rate_limits, public.hub_post_views from anon, authenticated;

-- Count one hit against `p_key` and say whether it is still within `p_max` hits per `p_window_seconds`.
-- Atomic, so simultaneous calls from any number of server instances are all counted. With `p_count` false it
-- only checks, without counting (the tracker counts misses alone, but must refuse once they run out).
create function public.hub_rate_hit(p_key text, p_window_seconds integer, p_max integer, p_count boolean default true)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if not p_count then
    return not exists (
      select 1 from public.hub_rate_limits
      where key = p_key and window_start > now() - make_interval(secs => p_window_seconds) and hits >= p_max
    );
  end if;
  insert into public.hub_rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  -- Now and then, forget windows long past (the longest window is a day).
  if random() < 0.01 then
    delete from public.hub_rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_max;
end;
$$;

-- Count a view of a post, at most once per visitor in `p_window_seconds`. Returns whether it was counted.
create function public.hub_count_post_view(p_slug text, p_day date, p_visitor text, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not public.hub_rate_hit('view:' || p_slug || ':' || p_visitor, p_window_seconds, 1, true) then
    return false;
  end if;
  insert into public.hub_post_views as v (slug, day, views, last_viewed_at)
  values (p_slug, p_day, 1, now())
  on conflict (slug, day) do update set views = v.views + 1, last_viewed_at = now();
  return true;
end;
$$;

revoke all on function public.hub_rate_hit(text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.hub_count_post_view(text, date, text, integer) from public, anon, authenticated;
grant execute on function public.hub_rate_hit(text, integer, integer, boolean) to service_role;
grant execute on function public.hub_count_post_view(text, date, text, integer) to service_role;
