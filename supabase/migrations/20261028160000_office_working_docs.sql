-- The Office keeps Working Documents of its own: no unit. Nothing else changes.
alter table public.workspace_docs alter column unit_id drop not null;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
