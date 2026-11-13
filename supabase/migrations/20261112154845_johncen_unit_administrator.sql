-- Johncen Jekk Tesnado (ACC-001), the Director, also becomes Administrator of the College of Information and
-- Computing Sciences and of the Office for Community Development (SIMBAHAYAN) (user, 2026-11-12). He keeps acting
-- as Director (AS-039) and switches to either unit under Roles & access.

set constraints all immediate;

do $$
declare
  v_next integer := (select value from public.id_counters where name = 'assignment');
  v_ord integer := (select coalesce(max(ord), -1) from public.account_assignments where account_id = 'ACC-001');
  v_unit text;
begin
  foreach v_unit in array array['cics', 'simbahayan'] loop
    if not exists (
      select 1 from public.account_assignments
      where account_id = 'ACC-001' and role_id = 'administrator' and scope_units = array[v_unit]
    ) then
      v_next := v_next + 1;
      v_ord := v_ord + 1;
      insert into public.account_assignments (id, account_id, ord, role_id, position, scope_units, scope_bodies, scope_years, scope_datasets, granted_by, granted_at, expires, note)
      values ('AS-' || lpad(v_next::text, 3, '0'), 'ACC-001', v_ord, 'administrator', null, array[v_unit], null, null, null, 'system', now(), null, 'Added at the Office''s request');
    end if;
  end loop;
  update public.id_counters set value = v_next where name = 'assignment';
end $$;

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
