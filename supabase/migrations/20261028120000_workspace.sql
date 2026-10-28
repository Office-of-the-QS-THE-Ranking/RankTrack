-- Workspace: a unit's own files (Working Documents, Resource Library, Templates & Forms) and the Office's shared
-- ones every unit sees (no unit). Archiving keeps the shelf, so a restored file goes back where it was. Files
-- live in the private media bucket under workspace/ and are never public. Nothing existing changes.

create table public.workspace_files (
  id text primary key,
  ord integer not null,
  -- Null: shared by the Office with every unit.
  unit_id text,
  shelf text not null check (shelf in ('working', 'library', 'templates')),
  -- A row of workspace_folders on the same shelf; null is the shelf's top level.
  folder_id text,
  name text not null check (char_length(name) between 1 and 120),
  src text not null unique check (src ~ '^/media/workspace/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  bytes bigint not null check (bytes >= 0),
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null,
  archived_at timestamptz,
  archived_by text,
  check ((archived_at is null) = (archived_by is null))
);
create index workspace_files_unit_idx on public.workspace_files (unit_id, shelf);

insert into public.hub_tables (name, position) values ('workspace_files', 59);

alter table public.workspace_files enable row level security;
revoke all on table public.workspace_files from anon, authenticated;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
