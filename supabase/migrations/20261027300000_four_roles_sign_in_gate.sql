-- Four roles (Administrator, Coordinator, Student, External) replace University Administrator, College/Faculty
-- Coordinator and External Collaborator. An Administrator holds the role in a University Office or a
-- College/Faculty; only a University-wide one (the Rankings Office) runs the Hub. The developer panel's
-- "Super admin" switch is gone. Schema 10 (src/lib/governance/migrate.ts from9 does the same to old recovery points).

set constraints all immediate;

alter table public.account_assignments drop constraint account_assignments_role_id_check;
update public.account_assignments set role_id = 'administrator' where role_id = 'university-admin';
alter table public.account_assignments add constraint account_assignments_role_id_check
  check (role_id in ('administrator', 'coordinator', 'student', 'external'));

update public.security_policy set mfa_roles = array_replace(mfa_roles, 'university-admin', 'administrator');

update public.approval_requests
set payload = jsonb_set(payload, '{roleId}', '"administrator"')
where kind in ('account-access', 'privilege-escalation') and payload ->> 'roleId' = 'university-admin';

update public.accounts set title = 'Administrator' where title in ('Super Administrator', 'University Administrator');

update public.hub_dev_access set role_ids = array_replace(role_ids, 'university-admin', 'administrator');
alter table public.hub_dev_access drop column super_admin;

update public.hub_meta set schema = 10 where id = 1 and schema = 9;

-- Same rules as 20261027000000_sign_in_gate_on_tables.sql; "no one runs the Hub" now means no active
-- University-wide Administrator.
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
