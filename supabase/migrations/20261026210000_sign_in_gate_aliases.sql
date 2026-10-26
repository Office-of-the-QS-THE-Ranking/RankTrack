-- The sign-in gate's hook again, with explicit column aliases on its JSON loops. 20261026200000_sign_in_gate.sql
-- reached the remote project before that change, so this replaces the function in place; grants carry over.

create or replace function public.hub_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
  v_state jsonb;
  v_domains jsonb;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:google'));
  end if;

  select state into v_state from public.hub_state where id = 1;
  -- A Hub never opened has no store yet; its first University Administrator (HUB_BOOTSTRAP_ADMIN) signs in to create it.
  if v_state is null then
    return '{}'::jsonb;
  end if;

  -- An account the Office approved or created, in any status: the Hub words a suspension or an expired role itself.
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_state -> 'accounts', '[]'::jsonb)) as a(acct)
    where lower(acct ->> 'email') = v_email
  ) or exists (select 1 from public.hub_auth_allow where email = v_email) then
    return '{}'::jsonb;
  end if;

  -- With no active University Administrator the Hub can't approve anyone, so University addresses may come in
  -- and the Hub restores HUB_BOOTSTRAP_ADMIN (and refuses everyone else) at /auth/callback.
  v_domains := coalesce(v_state -> 'security' -> 'sso' -> 'domains', '[]'::jsonb);
  if v_domains ? split_part(v_email, '@', 2) and not exists (
    select 1
    from jsonb_array_elements(coalesce(v_state -> 'accounts', '[]'::jsonb)) as a(acct),
         jsonb_array_elements(coalesce(acct -> 'assignments', '[]'::jsonb)) as x(grant_)
    where acct ->> 'status' = 'Active'
      and grant_ ->> 'roleId' = 'university-admin'
      and (grant_ ->> 'expires' is null or grant_ ->> 'expires' > to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'))
  ) then
    return '{}'::jsonb;
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_state -> 'requests', '[]'::jsonb)) as r(req)
    where req ->> 'status' = 'Pending'
      and req -> 'payload' ->> 'kind' = 'account-access'
      and lower(req -> 'payload' ->> 'email') = v_email
  ) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:pending'));
  end if;

  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'hub:not-registered'));
end;
$$;
