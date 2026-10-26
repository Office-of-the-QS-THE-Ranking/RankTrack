-- The directory lists colleges and faculties, never their departments or degree programs.
-- Nothing else refers to these units (accounts, coordinators, datasets, records, scopes), only their own history.

delete from public.org_unit_history
where unit_id in (select id from public.org_units where kind in ('Department', 'Program'));

delete from public.org_units where kind in ('Department', 'Program');

delete from public.unit_directory where category = 'Program/Department';

-- Run the deferred foreign-key checks now so the tables can be altered in this transaction.
set constraints all immediate;

alter table public.unit_directory drop constraint unit_directory_category_check;
alter table public.unit_directory add constraint unit_directory_category_check
  check (category in ('College/Faculty', 'Basic Education', 'Administrative Office', 'Research Center', 'Student Government'));

alter table public.org_units drop constraint org_units_kind_check;
alter table public.org_units add constraint org_units_kind_check
  check (kind in ('University', 'Office', 'Faculty', 'College', 'Institute', 'School', 'Student Government', 'Research Centre'));
