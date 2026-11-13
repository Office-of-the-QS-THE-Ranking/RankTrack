-- The Hub's roles follow the user's role diagram (2026-11-12). The Office of QS/THE Rankings is the Super
-- Administrator, and each of its people holds a position: Director (owns the Hub), Ranking Specialist (runs it day to
-- day) or Staff (the Office's work, without managing accounts). Administrators and Coordinators head and file for one
-- University Office or College/Faculty: there are no University-wide Administrators any more.
--
-- Johncen Jekk Tesnado (ACC-001) is the Director for now. The Office's University-wide Administrators become Ranking
-- Specialists (user, 2026-11-12): Kiana Nicole Ortega, Alyanna Ricci Evangelista, Hannah Gonzales and Kenneth
-- Clarence Rivera Isip.

set constraints all immediate;

alter table public.account_assignments add column position text;

update public.account_assignments set position = 'director' where role_id = 'super-admin';
update public.account_assignments set position = 'director' where id = 'AS-039' and account_id = 'ACC-001';

update public.account_assignments
set role_id = 'super-admin', position = 'specialist', scope_units = null
where role_id = 'administrator' and scope_units is null;

-- The same person can't hold the Office's role twice; keep their highest position.
delete from public.account_assignments as x
using public.account_assignments as y
where x.role_id = 'super-admin' and y.role_id = 'super-admin' and x.account_id = y.account_id and x.id <> y.id
  and (case x.position when 'director' then 3 when 'specialist' then 2 else 1 end, x.id)
    < (case y.position when 'director' then 3 when 'specialist' then 2 else 1 end, y.id);

update public.accounts as a set active_assignment = null
where a.active_assignment is not null
  and not exists (select 1 from public.account_assignments as x where x.id = a.active_assignment);

alter table public.account_assignments add constraint account_assignments_position_check
  check (case when role_id = 'super-admin' then position in ('director', 'specialist', 'staff') else position is null end);

update public.accounts set title = 'Director' where id = 'ACC-001';
update public.accounts as a set title = 'Ranking Specialist'
where a.title in ('Administrator', 'Super Administrator') and a.id <> 'ACC-001'
  and exists (select 1 from public.account_assignments as x where x.account_id = a.id and x.role_id = 'super-admin' and x.position = 'specialist');

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
