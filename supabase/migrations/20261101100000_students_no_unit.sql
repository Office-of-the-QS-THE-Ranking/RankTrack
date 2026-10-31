-- Students belong to no College/Faculty or Office (user, 2026-11-01): their role is just Student. Their accounts
-- and roles are kept with the Office that runs the Hub, as guests' are, and the Hub never shows that as a unit.

-- A Student role is never scoped to a college or office.
update public.account_assignments
set scope_units = array['rankings-office']
where role_id = 'student'
  and scope_units is distinct from array['rankings-office'];

-- An account that holds only Student roles leaves its college for the Office.
update public.accounts a
set unit_id = 'rankings-office'
where a.unit_id <> 'rankings-office'
  and exists (select 1 from public.account_assignments s where s.account_id = a.id and s.role_id = 'student')
  and not exists (select 1 from public.account_assignments o where o.account_id = a.id and o.role_id <> 'student');

-- Running servers reload the store (added after this was first applied; 20261101110000 bumps it there).
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
