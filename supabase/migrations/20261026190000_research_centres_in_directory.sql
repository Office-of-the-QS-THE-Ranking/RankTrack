-- The University's three research centres, which ust_directory.csv leaves out, join the directory under the
-- Office of the Vice-Rector for Research and Innovation, so a new Hub is seeded with every unit from this table.
alter table public.unit_directory drop constraint unit_directory_category_check;
alter table public.unit_directory add constraint unit_directory_category_check
  check (category in ('College/Faculty', 'Basic Education', 'Program/Department', 'Administrative Office', 'Research Center', 'Student Government'));

insert into public.unit_directory (key, parent_key, category, name, emails, position) values
  ('R01', 'A04', 'Research Center', 'Research Center for the Natural and Applied Sciences', '{}', 97),
  ('R02', 'A04', 'Research Center', 'Research Center for Social Sciences and Education', '{}', 98),
  ('R03', 'A04', 'Research Center', 'Research Center for Culture, Arts and Humanities', '{}', 99);
