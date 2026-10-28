-- Let Google supply a form visitor's identity without collecting an email first.
create or replace function public.hub_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:google'));
  end if;

  -- Google identities also prove who opens a digital form, before we know their email.
  -- This creates no Hub account or Hub session: /auth/callback still calls completeSignIn,
  -- and form callbacks issue only the form identity cookie and remove unregistered Auth users.
  -- Provider comes from Auth-controlled app_metadata, never editable user_metadata.
  if event -> 'user' -> 'app_metadata' ->> 'provider' = 'google' then
    return '{}'::jsonb;
  end if;

  -- A Hub never opened has no store yet; its first Administrator (HUB_BOOTSTRAP_ADMIN) signs in to create it.
  if not exists (select 1 from public.hub_meta where id = 1) then
    return '{}'::jsonb;
  end if;

  -- An account the Office approved or created, in any status: the Hub words a suspension or an expired role itself.
  if exists (select 1 from public.accounts as a where lower(a.email) = v_email)
    or exists (select 1 from public.hub_auth_allow as w where w.email = v_email) then
    return '{}'::jsonb;
  end if;

  -- With no active University-wide Administrator the Hub can't approve anyone, so University addresses may come
  -- in and the Hub restores HUB_BOOTSTRAP_ADMIN (and refuses everyone else) at /auth/callback.
  if exists (select 1 from public.security_policy as p where split_part(v_email, '@', 2) = any (p.sso_domains))
    and not exists (
      select 1
      from public.accounts as a
      join public.account_assignments as x on x.account_id = a.id
      where a.status = 'Active'
        and x.role_id = 'administrator'
        and x.scope_units is null
        and (x.expires is null or x.expires > (now() at time zone 'Asia/Manila')::date)
    ) then
    return '{}'::jsonb;
  end if;

  if exists (
    select 1 from public.approval_requests as r
    where r.status = 'Pending' and r.kind = 'account-access' and lower(r.payload ->> 'email') = v_email
  ) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:pending'));
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:not-registered'));
end;
$$;

revoke execute on function public.hub_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hub_before_user_created(jsonb) to supabase_auth_admin;
