-- The deadline check: where each ranking body publishes its dates and how the Hub reads them (reference data),
-- the dates the Hub read and the Office decides on, the extra dates in each ranking's calendar, and where each
-- ranking's deadline came from (governance store). The check reads public pages once a day with fixed rules
-- (a table row, a sentence, or a part of the page to compare); it never signs in and never changes a date by
-- itself: what it reads waits for the Office.

-- ---------- Sources (reference data) ----------

create table public.deadline_sources (
  id text primary key,
  position integer not null unique,
  -- The ranking body (ranking_families.body)
  body text not null,
  name text not null,
  -- The page a person opens to check a date
  page text not null,
  -- What the Hub reads; {year} and {next} stand for this year and the next. Null for a body read by hand.
  fetch_url text,
  -- table: rows of a dates table; sentence: a regular expression with a named group `due`;
  -- watch: what to compare on the page (its matches); manual: not read
  kind text not null check (kind in ('table', 'sentence', 'watch', 'manual')),
  pattern text,
  -- Which rankings a date belongs to: [{ "row"?: table row label, "slugs": [...], "deadline"?: true, "label"?: "…" }]
  rules jsonb not null default '[]'::jsonb,
  note text not null default ''
);

alter table public.deadline_sources enable row level security;
revoke all on table public.deadline_sources from anon, authenticated;

insert into public.deadline_sources (id, position, body, name, page, fetch_url, kind, pattern, rules, note) values
  (
    'qs-cycle', 1, 'QS', 'QS help centre: Rankings Cycle',
    'https://support.qs.com/hc/en-gb/articles/15441557138716',
    'https://support.qs.com/api/v2/help_center/en-gb/articles/15441557138716.json',
    'table', null,
    '[
      {"row": "Survey Contacts Submission window 1", "slugs": ["qs-wur"], "label": "Survey contacts, first window closes"},
      {"row": "Survey Contacts Submission window 2", "slugs": ["qs-wur"], "label": "Survey contacts, second window closes"},
      {"row": "Institution Data", "slugs": ["qs-wur", "qs-subject"], "deadline": true},
      {"row": "Sustainability Data", "slugs": ["qs-sustainability"], "deadline": true}
    ]'::jsonb,
    'One article, renamed for each cycle, with a Key Dates table. Read through the help centre''s public API.'
  ),
  (
    'the-wur', 2, 'THE', 'THE: How to participate',
    'https://www.timeshighereducation.com/how-participate-times-higher-education-rankings',
    'https://www.timeshighereducation.com/how-participate-times-higher-education-rankings',
    'sentence',
    'World University Rankings:[\s\S]{0,2000}?portal will be open from [^.]*? to (?<due>\d{1,2} [A-Za-z]+(?: \d{4})?)',
    '[{"slugs": ["the-wur", "the-subject"], "deadline": true}]'::jsonb,
    'The World University Rankings portal, which the subject rankings share. The page gives the day without a year.'
  ),
  (
    'the-impact', 3, 'THE', 'THE: Sustainability Impact Ratings, time to submit',
    'https://www.timeshighereducation.com/world-university-rankings/sustainability-impact-ratings-{next}-time-submit-your-data',
    'https://www.timeshighereducation.com/world-university-rankings/sustainability-impact-ratings-{next}-time-submit-your-data',
    'sentence',
    'required data by (?<due>\d{1,2} [A-Za-z]+ \d{4})',
    '[{"slugs": ["the-impact"], "deadline": true}]'::jsonb,
    'THE posts this each September for the next edition. Until then the page does not exist.'
  ),
  (
    'greenmetric', 4, 'UI', 'UI GreenMetric: Guidelines',
    'https://uigreenmetric.com/resources/university/guidelines',
    'https://uigreenmetric.com/resources/university/guidelines',
    'watch',
    'guidelines/(\d{4})/english',
    '[{"slugs": ["greenmetric"]}]'::jsonb,
    'UI GreenMetric publishes no timeline page. The Hub watches its list of guidelines and tells you when a new year appears.'
  ),
  (
    'wuri', 5, 'WURI', 'WURI website',
    'https://www.wuri.world/',
    null,
    'manual', null,
    '[{"slugs": ["wuri"]}]'::jsonb,
    'The WURI website does not allow automated reading. Enter its dates by hand.'
  );

-- ---------- Governance store ----------

-- Where a ranking's deadline came from: set by hand, or read from a ranking body's website and applied.
alter table public.ranking_settings
  add column if not exists deadline_source text check (deadline_source in ('Manual', 'Automatic')),
  add column if not exists deadline_url text,
  add column if not exists deadline_by text,
  add column if not exists deadline_at timestamptz;

-- Dates in a ranking's calendar besides its deadline: survey windows, portals closing in stages.
create table public.calendar_entries (
  id text primary key,
  ord integer not null,
  slug text not null references public.ranking_frameworks (slug) deferrable initially deferred,
  label text not null check (char_length(label) between 1 and 120),
  due date not null,
  source text not null check (source in ('Manual', 'Automatic')),
  url text,
  set_by text not null,
  set_at timestamptz not null
);

-- Dates the check read that differ from the Hub's, until the Office applies or dismisses them.
create table public.deadline_findings (
  id text primary key,
  ord integer not null,
  source_id text not null,
  slug text not null references public.ranking_frameworks (slug) deferrable initially deferred,
  target text not null check (target in ('deadline', 'milestone')),
  label text not null,
  due date not null,
  quote text not null default '',
  url text not null,
  found_at timestamptz not null,
  state text not null check (state in ('New', 'Applied', 'Dismissed')),
  decided_by text,
  decided_at timestamptz
);

-- Each source's last reading.
create table public.deadline_watch (
  id text primary key,
  ord integer not null,
  checked_at timestamptz not null,
  status text not null check (status in ('Read', 'Waiting', 'Failed', 'Manual')),
  hash text,
  changed_at timestamptz,
  note text not null default ''
);

insert into public.hub_tables (name, position) values ('calendar_entries', 55), ('deadline_findings', 56), ('deadline_watch', 57);

alter table public.calendar_entries enable row level security;
alter table public.deadline_findings enable row level security;
alter table public.deadline_watch enable row level security;
revoke all on table public.calendar_entries, public.deadline_findings, public.deadline_watch from anon, authenticated;

-- The Office hears about new dates in the bell.
insert into public.notification_templates (id, ord, name, event, channel, subject, body, enabled) values
  (
    'tpl-deadline-found', 8, 'New date found', 'The deadline check reads a date that differs from the Hub''s', 'In-app',
    'New date for {ranking}',
    '{ranking}: {label} {date} on {source}. Apply it or dismiss it on the ranking''s page.',
    true
  )
on conflict (id) do nothing;

update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
