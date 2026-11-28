-- Add the Office position to Nicolas's existing account. Keep his Rector assignment available.
do $$
declare
  v_account_id text;
  v_assignment_id text;
begin
  -- Serialize with hub_commit so the running Hub sees the grant and its new ID together.
  perform 1 from public.hub_meta where id = 1 for update;

  select id into v_account_id from public.accounts
  where lower(email) = 'rpnicolas@ust.edu.ph' and status = 'Active' and not coalesce(external, false);
  if not found then
    return;
  end if;

  if exists (
    select 1 from public.account_assignments
    where account_id = v_account_id and role_id = 'super-admin'
      and (expires is null or expires > (now() at time zone 'Asia/Manila')::date)
  ) then
    return;
  end if;

  update public.id_counters set value = value + 1 where name = 'assignment'
  returning 'AS-' || lpad(value::text, greatest(3, length(value::text)), '0') into strict v_assignment_id;

  insert into public.account_assignments (id, account_id, ord, role_id, position, granted_by, granted_at, note)
  select v_assignment_id, v_account_id, coalesce(max(ord), -1) + 1,
         'super-admin', 'specialist', 'system', now(), 'Rankings Office appointment'
  from public.account_assignments where account_id = v_account_id;

  update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
end $$;
