-- Repeats 20261101100000 (Students belong to no College/Faculty or Office), which was first applied without
-- moving hub_meta.version: running servers reload the store, and anything a stale server wrote back is moved again.


update public.account_assignments
set scope_units = array['rankings-office']
where role_id = 'student'
  and scope_units is distinct from array['rankings-office'];

update public.accounts a
set unit_id = 'rankings-office'
where a.unit_id <> 'rankings-office'
  and exists (select 1 from public.account_assignments s where s.account_id = a.id and s.role_id = 'student')
  and not exists (select 1 from public.account_assignments o where o.account_id = a.id and o.role_id <> 'student');

update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
