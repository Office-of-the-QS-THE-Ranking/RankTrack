-- Workspace folders: users create them (empty ones too) and nest them. A folder belongs to a unit, or to the
-- Office for its shared shelves, like the files in it. Files point at their folder by id (folder_id), so renaming
-- or moving a folder touches one row. Nothing existing changes.

create table public.workspace_folders (
  id text primary key,
  ord integer not null,
  -- Null: one of the Office's shared folders.
  unit_id text,
  shelf text not null check (shelf in ('working', 'library', 'templates')),
  -- Null: at the shelf's top level.
  parent_id text,
  name text not null check (char_length(name) between 1 and 48 and name !~ '[/\\]'),
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null
);
create index workspace_folders_unit_idx on public.workspace_folders (unit_id, shelf);

insert into public.hub_tables (name, position) values ('workspace_folders', 61);

alter table public.workspace_folders enable row level security;
revoke all on table public.workspace_folders from anon, authenticated;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
