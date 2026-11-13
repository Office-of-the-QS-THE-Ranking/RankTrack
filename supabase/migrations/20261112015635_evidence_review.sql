-- Evidence review (src/lib/review, docs/evidence-review.md).
--
-- A reviewer's browser reads an evidence file (its text layer, then OCR for scanned pages) and sends only the text. Rules
-- then match it against the active editions' indicators, pick out figures and years, and compare it with other files.
-- What they find are suggestions: a person accepts one, which links the evidence record to the indicator and may offer a
-- figure beside it. An AI job, the Reviewer, can check the suggestions against the pages they came from.
--
-- The text is as sensitive as the files. Everything here sits outside the governance store, only the service role
-- reads or writes it, and none of it is in the assistant's index or lookups (tests/review-guard.test.ts).

-- ---------- What was read ----------

-- One row per uploaded evidence file that has been read. The text itself is kept by the file's SHA-256, worked out on
-- the server from storage, so the same file attached twice is read once.
create table public.review_files (
  src text primary key check (src ~ '^/media/evidence/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  evidence_id text not null check (char_length(evidence_id) <= 40),
  name text not null check (char_length(name) <= 200),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes > 0),
  status text not null default 'reading' check (status in ('reading', 'ready')),
  -- What a "page" of this file is: a PDF's page, a slide, an image, or a part of a document or sheet with no pages.
  page_unit text not null default 'page' check (page_unit in ('page', 'part', 'slide', 'image')),
  pages integer not null default 0 check (pages between 0 and 400),
  ocr_pages integer not null default 0 check (ocr_pages >= 0),
  chars integer not null default 0 check (chars >= 0),
  -- The file had more pages than are read.
  truncated boolean not null default false,
  -- MinHash of the text's word shingles, to find near-copies among other submissions (lib/review/fingerprint.ts).
  signature integer[],
  -- What the rules made of it: SDGs found, years, counts (lib/review/types.ts FileSummary).
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  read_by text not null,
  read_at timestamptz not null default now(),
  ruled_at timestamptz
);
create index review_files_evidence_idx on public.review_files (evidence_id);
create index review_files_sha_idx on public.review_files (sha256);

create table public.review_pages (
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page integer not null check (page between 1 and 400),
  text text not null check (char_length(text) <= 24000),
  ocr boolean not null default false,
  primary key (sha256, page)
);

-- ---------- What to look for ----------

-- Words and phrases that point to an SDG or to one indicator of a ranking, on top of those taken from the indicator's
-- own name and guidance. The Office adds to them (rankings: manage); an indicator's terms carry over to next year's
-- edition, since they are kept by ranking and code.
create table public.review_terms (
  id uuid primary key default gen_random_uuid(),
  sdg smallint check (sdg between 1 and 17),
  ranking_slug text references public.ranking_frameworks (slug) on delete cascade,
  indicator_code text check (indicator_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  term text not null check (char_length(term) between 2 and 80),
  added_by text not null default 'system',
  added_at timestamptz not null default now(),
  check ((sdg is not null and ranking_slug is null and indicator_code is null) or (sdg is null and ranking_slug is not null and indicator_code is not null))
);
create unique index review_terms_once_idx on public.review_terms (coalesce(sdg, 0), coalesce(ranking_slug, ''), coalesce(indicator_code, ''), lower(term));

-- ---------- What was found ----------

create table public.review_findings (
  id uuid primary key default gen_random_uuid(),
  evidence_id text not null check (char_length(evidence_id) <= 40),
  src text not null references public.review_files (src) on delete cascade,
  edition_id text not null,
  indicator_code text not null,
  pages integer[] not null default '{}',
  confidence text not null check (confidence in ('high', 'medium')),
  score numeric not null default 0,
  terms text[] not null default '{}',
  quote text not null default '' check (char_length(quote) <= 600),
  quote_page integer,
  -- The quoted sentence says no, not or none: a person should read it before accepting.
  negated boolean not null default false,
  -- Figures near the match: [{ value, text, page, quote }].
  figures jsonb not null default '[]'::jsonb check (jsonb_typeof(figures) = 'array'),
  -- The calendar year the file documents, when its text says.
  year integer check (year between 1900 and 2100),
  -- The Reviewer's check, when one was asked for: { verdict, reason, quote, page, figure, model, at }.
  ai jsonb check (ai is null or jsonb_typeof(ai) = 'object'),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'dismissed')),
  -- The figure chosen on accepting, offered beside the indicator: { value, text, page }.
  figure jsonb check (figure is null or jsonb_typeof(figure) = 'object'),
  link_id uuid,
  -- Accepting created the link, so taking the decision back removes it.
  link_made boolean not null default false,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (src, edition_id, indicator_code),
  foreign key (edition_id, indicator_code) references public.analytics_indicators (edition_id, code) on delete cascade
);
create index review_findings_evidence_idx on public.review_findings (evidence_id);
create index review_findings_accepted_idx on public.review_findings (edition_id, indicator_code) where status = 'accepted';

-- ---------- AI jobs ----------

-- A job is work a model does for the Office rather than for the person chatting: its model is chosen once, by an
-- Administrator, and must be on a plan that doesn't share data (checked when saved and again on every run).
create table public.assistant_jobs (
  id text primary key check (id in ('reviewer')),
  enabled boolean not null default false,
  model_id text references public.assistant_models (id) on delete set null,
  backup_model_id text references public.assistant_models (id) on delete set null,
  -- Runs a day, across the Hub.
  daily_limit integer not null default 100 check (daily_limit between 1 and 10000),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.assistant_jobs (id) values ('reviewer');

-- Whose work a row of usage was. Counts only, as before: never what a model was sent or said.
alter table public.assistant_usage add column job text not null default 'assistant' check (job in ('assistant', 'reviewer'));
create index assistant_usage_job on public.assistant_usage (job, at);

-- The chat's own usage, as the AI tab's charts and tables have always shown it: a job's runs are counted apart.
create or replace function public.assistant_usage_rollup(p_since timestamptz)
returns table (
  day date, model_id text, provider text, unit_id text, role_id text, outcome text,
  messages bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric
)
language sql
stable
set search_path = ''
as $$
  select (u.at at time zone 'Asia/Manila')::date, u.model_id, u.provider, u.unit_id, u.role_id, u.outcome,
    count(*), sum(u.input_tokens), sum(u.output_tokens), sum(u.cost_usd)
  from public.assistant_usage u
  where u.at >= p_since and u.job = 'assistant'
  group by 1, 2, 3, 4, 5, 6;
$$;

-- Each job's runs since a moment: how many, how many failed, and what they cost.
create function public.assistant_job_usage(p_since timestamptz, p_day_start timestamptz)
returns table (job text, runs bigint, runs_today bigint, failed bigint, input_tokens bigint, output_tokens bigint, cost_usd numeric)
language sql
stable
set search_path = ''
as $$
  select u.job, count(*), count(*) filter (where u.at >= p_day_start), count(*) filter (where u.outcome = 'error'),
    coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0), coalesce(sum(u.cost_usd), 0)
  from public.assistant_usage u
  where u.at >= p_since and u.job <> 'assistant'
  group by u.job;
$$;
revoke all on function public.assistant_job_usage(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.assistant_job_usage(timestamptz, timestamptz) to service_role;

-- ---------- Only the Hub's server ----------

do $$
declare
  t text;
begin
  foreach t in array array['review_files', 'review_pages', 'review_terms', 'review_findings', 'assistant_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------- Starting terms for the SDGs ----------

insert into public.review_terms (sdg, term) values
  (1, 'poverty'), (1, 'low-income'), (1, 'indigent'), (1, 'scholarship'), (1, 'financial aid'), (1, 'livelihood'), (1, 'microfinance'), (1, 'marginalized'), (1, 'social protection'), (1, 'mahirap'),
  (2, 'hunger'), (2, 'food security'), (2, 'nutrition'), (2, 'malnutrition'), (2, 'feeding program'), (2, 'food waste'), (2, 'sustainable agriculture'), (2, 'farmers'), (2, 'food bank'), (2, 'gutom'),
  (3, 'health'), (3, 'well-being'), (3, 'wellbeing'), (3, 'mental health'), (3, 'medical mission'), (3, 'vaccination'), (3, 'health care'), (3, 'healthcare'), (3, 'disease'), (3, 'smoke-free'), (3, 'reproductive health'), (3, 'kalusugan'),
  (4, 'education'), (4, 'lifelong learning'), (4, 'literacy'), (4, 'tutorial'), (4, 'teacher training'), (4, 'public lecture'), (4, 'open educational resources'), (4, 'vocational training'), (4, 'outreach'), (4, 'first-generation students'), (4, 'edukasyon'),
  (5, 'gender equality'), (5, 'women'), (5, 'gender and development'), (5, 'maternity'), (5, 'paternity'), (5, 'childcare'), (5, 'non-discrimination'), (5, 'sexual harassment'), (5, 'mentoring'), (5, 'kababaihan'),
  (6, 'water'), (6, 'sanitation'), (6, 'wastewater'), (6, 'drinking water'), (6, 'water conservation'), (6, 'water reuse'), (6, 'rainwater'), (6, 'hygiene'), (6, 'watershed'), (6, 'tubig'),
  (7, 'energy'), (7, 'renewable energy'), (7, 'solar'), (7, 'energy efficiency'), (7, 'kilowatt'), (7, 'carbon reduction'), (7, 'clean energy'), (7, 'electricity consumption'), (7, 'divestment'), (7, 'enerhiya'),
  (8, 'decent work'), (8, 'employment'), (8, 'living wage'), (8, 'labour rights'), (8, 'labor rights'), (8, 'internship'), (8, 'work placement'), (8, 'economic growth'), (8, 'union'), (8, 'trabaho'),
  (9, 'innovation'), (9, 'industry'), (9, 'infrastructure'), (9, 'patent'), (9, 'spin-off'), (9, 'startup'), (9, 'technology transfer'), (9, 'research income'), (9, 'incubator'), (9, 'commercialization'),
  (10, 'inequality'), (10, 'inclusion'), (10, 'persons with disabilities'), (10, 'disability'), (10, 'accessibility'), (10, 'underrepresented'), (10, 'anti-discrimination'), (10, 'indigenous'), (10, 'equity'), (10, 'diversity'),
  (11, 'sustainable cities'), (11, 'community'), (11, 'cultural heritage'), (11, 'museum'), (11, 'public access'), (11, 'green space'), (11, 'sustainable commuting'), (11, 'affordable housing'), (11, 'heritage'), (11, 'pamayanan'),
  (12, 'responsible consumption'), (12, 'recycling'), (12, 'waste management'), (12, 'single-use plastic'), (12, 'landfill'), (12, 'ethical sourcing'), (12, 'hazardous waste'), (12, 'waste segregation'), (12, 'sustainability report'), (12, 'basura'),
  (13, 'climate action'), (13, 'climate change'), (13, 'greenhouse gas'), (13, 'carbon neutral'), (13, 'carbon footprint'), (13, 'emissions'), (13, 'disaster risk'), (13, 'climate adaptation'), (13, 'low-carbon'), (13, 'klima'),
  (14, 'marine'), (14, 'ocean'), (14, 'coastal'), (14, 'aquatic'), (14, 'fisheries'), (14, 'fisherfolk'), (14, 'coral'), (14, 'water quality'), (14, 'overfishing'), (14, 'dagat'),
  (15, 'biodiversity'), (15, 'ecosystem'), (15, 'forest'), (15, 'reforestation'), (15, 'tree planting'), (15, 'wildlife'), (15, 'conservation'), (15, 'land use'), (15, 'endangered species'), (15, 'kagubatan'),
  (16, 'peace'), (16, 'justice'), (16, 'governance'), (16, 'transparency'), (16, 'anti-corruption'), (16, 'academic freedom'), (16, 'legal aid'), (16, 'human rights'), (16, 'policy advice'), (16, 'katarungan'),
  (17, 'partnership'), (17, 'collaboration'), (17, 'memorandum of agreement'), (17, 'memorandum of understanding'), (17, 'non-government organization'), (17, 'ngo'), (17, 'cross-sectoral'), (17, 'sustainable development goals'), (17, 'international collaboration'), (17, 'local government unit')
on conflict do nothing;
