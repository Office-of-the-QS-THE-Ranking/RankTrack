-- Cutover to the relational store, applied once the governance store's rows are in its tables
-- (scripts/store/migrate-to-tables.ts). From here the sign-in gate reads the tables, not hub_state.

-- Same rules as 20261026210000_sign_in_gate_aliases.sql, against the relational store.
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

  -- A Hub never opened has no store yet; its first University Administrator (HUB_BOOTSTRAP_ADMIN) signs in to create it.
  if not exists (select 1 from public.hub_meta where id = 1) then
    return '{}'::jsonb;
  end if;

  -- An account the Office approved or created, in any status: the Hub words a suspension or an expired role itself.
  if exists (select 1 from public.accounts as a where lower(a.email) = v_email)
    or exists (select 1 from public.hub_auth_allow as w where w.email = v_email) then
    return '{}'::jsonb;
  end if;

  -- With no active University Administrator the Hub can't approve anyone, so University addresses may come in
  -- and the Hub restores HUB_BOOTSTRAP_ADMIN (and refuses everyone else) at /auth/callback.
  if exists (select 1 from public.security_policy as p where split_part(v_email, '@', 2) = any (p.sso_domains))
    and not exists (
      select 1
      from public.accounts as a
      join public.account_assignments as x on x.account_id = a.id
      where a.status = 'Active'
        and x.role_id = 'university-admin'
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
