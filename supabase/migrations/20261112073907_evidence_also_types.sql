-- Evidence can span several kinds. `type` stays the main kind; `also_types` holds up to two more, in the order picked.
alter table public.evidence add column also_types text[] not null default '{}' check (cardinality(also_types) <= 2);
