-- Publications: Impact and Innovation becomes Publications, with three sections. Stories & News keeps the posts;
-- Research Articles and Reports & Insights are documents (governance store), each kind typed from a reference
-- list. The public switch for the section is renamed with it. Nothing existing is removed.

-- ---------- Research articles and reports (governance store) ----------

create table public.documents (
  id text primary key,
  ord integer not null,
  slug text not null unique,
  kind text not null check (kind in ('article', 'report')),
  title text not null check (char_length(title) between 4 and 220),
  -- Article: the authors in byline order. Report: who prepared it.
  authors text[] not null default '{}' check (cardinality(authors) <= 30),
  -- Article: the journal or proceedings. Report: its series or issuing office.
  venue text not null default '',
  -- reference_lists 'article-type' or 'insight-type'
  type text not null,
  abstract text not null default '' check (char_length(abstract) <= 4000),
  issued date not null,
  -- Without the resolver: 10.xxxx/…
  doi text check (doi ~ '^10\.[0-9]{4,9}/\S+$'),
  url text check (url ~ '^https?://'),
  -- The PDF in the media buckets: /media/documents/<uuid>.pdf
  file_src text check (file_src ~ '^/media/documents/[0-9a-f-]{36}\.pdf$'),
  file_name text,
  file_mb numeric(6, 1) check (file_mb >= 0),
  sdgs integer[] not null default '{}',
  keywords text[] not null default '{}' check (cardinality(keywords) <= 10),
  unit_id text,
  featured boolean not null default false,
  status text not null check (status in ('Draft', 'In review', 'Published', 'Unpublished')),
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null,
  published_at timestamptz,
  check ((file_src is null) = (file_name is null))
);
create index documents_kind_status_idx on public.documents (kind, status);

insert into public.hub_tables (name, position) values ('documents', 58);

alter table public.documents enable row level security;
revoke all on table public.documents from anon, authenticated;

-- ---------- What kinds of article and report there are (reference data) ----------

alter table public.reference_lists drop constraint reference_lists_list_check;
alter table public.reference_lists add constraint reference_lists_list_check check (list in (
  'impact-theme', 'wuri-category', 'report-type', 'subject-quadrant', 'subject-area',
  'impact-ladder', 'contribution-pipeline', 'wuri-pipeline', 'research-funnel',
  'article-type', 'insight-type'
));

insert into public.reference_lists (list, position, value, note, color) values
  ('article-type', 1, 'Journal article', null, null),
  ('article-type', 2, 'Conference paper', null, null),
  ('article-type', 3, 'Review article', null, null),
  ('article-type', 4, 'Book chapter', null, null),
  ('article-type', 5, 'Preprint', null, null),
  ('insight-type', 1, 'Annual report', null, null),
  ('insight-type', 2, 'Ranking analysis', null, null),
  ('insight-type', 3, 'Policy brief', null, null),
  ('insight-type', 4, 'Data insight', null, null),
  ('insight-type', 5, 'Sustainability report', null, null)
on conflict (list, value) do nothing;

-- ---------- The public section's new name ----------

update public.features
set id = 'public-publications',
    name = 'Publications',
    description = 'Stories & News, Research Articles and Reports & Insights on the public website.'
where id = 'public-impact';

update public.datasets
set public_surface = 'Publications pages of the public website'
where id = 'DS-STORIES' and public_surface = 'Impact and Innovation pages of the public website';

update public.notification_templates
set name = 'Publication live',
    event = 'A story, article or report reaches the public website',
    body = '“{title}” is now on the public website, under Publications.'
where id = 'tpl-published' and body = '“{title}” is now on the public Impact and Innovation page.';

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
