-- Working Documents: a unit's documents in progress, kept as links to where they live (Google Docs, Sheets,
-- Drive, a PDF) with a date, the rankings they serve and a status. Nothing existing changes.

create table public.workspace_docs (
  id text primary key,
  ord integer not null,
  unit_id text not null,
  title text not null check (char_length(title) between 1 and 160),
  doc_date date not null,
  rankings text[] not null default '{}' check (cardinality(rankings) <= 12),
  status text not null check (status in ('Draft', 'In progress', 'For review', 'Final')),
  links text[] not null check (cardinality(links) between 1 and 10),
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null
);
create index workspace_docs_unit_idx on public.workspace_docs (unit_id);

insert into public.hub_tables (name, position) values ('workspace_docs', 60);

alter table public.workspace_docs enable row level security;
revoke all on table public.workspace_docs from anon, authenticated;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
