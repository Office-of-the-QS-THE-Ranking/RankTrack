-- The Office's email and street address, which the website, the workspaces' footer and the error pages show.
alter table public.office_profile
  add column email text not null default 'rankings.office@ust.edu.ph' check (email like '%@%'),
  add column street text not null default 'España Boulevard, Sampaloc',
  add column city text not null default 'Manila 1008, Philippines';

alter table public.office_profile alter column email drop default, alter column street drop default, alter column city drop default;
