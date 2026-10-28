-- Follow the existing Workspace migrations, which are dated ahead of the local clock.
alter table public.workspace_docs
  add column remarks text not null default ''
  check (char_length(remarks) <= 5000);

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
