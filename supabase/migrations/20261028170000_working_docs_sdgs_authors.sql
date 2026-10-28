-- Working Documents also name the SDGs they serve and who writes them. Both start empty; nothing else changes.
alter table public.workspace_docs
  add column sdgs integer[] not null default '{}' check (cardinality(sdgs) <= 17 and sdgs <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]),
  add column authors text[] not null default '{}' check (cardinality(authors) <= 12);

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
