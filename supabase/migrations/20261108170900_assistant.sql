-- The assistant (src/lib/assistant, docs/assistant.md).
--
-- Everything here sits outside the governance store, so a busy chat never rewrites it, and only the service role reads
-- or writes these tables. Who may see a passage is decided in the app (lib/assistant/server/chat.ts), because Hub
-- sessions aren't Supabase sessions. Connecting, disconnecting and changing a model are audited through the store's
-- trail by src/app/actions/assistant.ts. assistant_usage holds counts only: never what anyone asked or was told.

create extension if not exists vector with schema extensions;

-- ---------- Settings ----------

create table public.assistant_settings (
  id smallint primary key default 1 check (id = 1),
  paused boolean not null default false,
  fallback_model text,
  index_built_at timestamptz,
  index_chunks integer not null default 0,
  index_error text,
  updated_at timestamptz not null default now()
);

-- ---------- Providers ----------

create table public.assistant_providers (
  id text primary key check (id in ('google', 'cloudflare', 'openai', 'anthropic')),
  position smallint not null,
  key_sealed text,
  key_hint text,
  -- As declared by the Administrator: no provider says which plan a key is on. A key on Google's free plan may be read
  -- by Google, so it only ever receives public passages (lib/assistant/rules.ts).
  plan text not null default 'paid' check (plan in ('free', 'paid')),
  account_ref text,
  status text not null default 'disconnected' check (status in ('disconnected', 'ok', 'no_credit', 'bad_key')),
  status_at timestamptz,
  monthly_budget_usd numeric(10, 2) check (monthly_budget_usd is null or monthly_budget_usd >= 0),
  low_credit_usd numeric(10, 2) not null default 2 check (low_credit_usd >= 0),
  connected_by text,
  connected_at timestamptz
);

insert into public.assistant_providers (id, position, plan) values
  ('google', 1, 'free'),
  ('cloudflare', 2, 'free'),
  ('openai', 3, 'paid'),
  ('anthropic', 4, 'paid');

-- ---------- Models ----------

create table public.assistant_models (
  id text primary key,
  provider text not null references public.assistant_providers (id) on delete cascade,
  position smallint not null,
  label text not null,
  -- US dollars per million tokens, as the provider publishes them. The Administrator can correct them on the AI tab.
  input_usd numeric(10, 4) not null check (input_usd >= 0),
  output_usd numeric(10, 4) not null check (output_usd >= 0),
  enabled boolean not null default true,
  access text not null default 'on_request' check (access in ('everyone', 'on_request')),
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  is_default boolean not null default false
);

create unique index assistant_models_one_default on public.assistant_models (is_default) where is_default;

-- Prices as published on 2026-11-09. Gemini 3.8 Flash's rises to 1.50 / 7.50 on 2027-01-01.
insert into public.assistant_models (id, provider, position, label, input_usd, output_usd, access, daily_limit, is_default) values
  ('gemini-3.8-flash', 'google', 1, 'Gemini 3.8 Flash', 0.75, 3.75, 'everyone', 30, true),
  ('gemini-2.5-flash-lite', 'google', 2, 'Gemini 2.5 Flash-Lite', 0.10, 0.40, 'everyone', 30, false),
  ('@cf/zai-org/glm-4.7-flash', 'cloudflare', 3, 'GLM 4.7 Flash', 0.0605, 0.4004, 'everyone', 30, false),
  ('gpt-5-nano', 'openai', 4, 'ChatGPT · GPT-5 nano', 0.05, 0.40, 'on_request', 30, false),
  ('gpt-6-luna', 'openai', 5, 'ChatGPT · GPT-6 Luna', 0.10, 0.50, 'on_request', 30, false),
  ('gpt-6.1-terra', 'openai', 6, 'ChatGPT · GPT-6.1 Terra', 1.00, 5.00, 'on_request', 20, false),
  ('claude-haiku-5-5', 'anthropic', 7, 'Claude Haiku 5.5', 0.10, 0.50, 'on_request', 30, false),
  ('claude-sonnet-5-5', 'anthropic', 8, 'Claude Sonnet 5.5', 2.00, 10.00, 'on_request', 20, false);

insert into public.assistant_settings (id, fallback_model) values (1, '@cf/zai-org/glm-4.7-flash');

alter table public.assistant_settings
  add constraint assistant_settings_fallback_fkey foreign key (fallback_model) references public.assistant_models (id) on delete set null;

-- Who asked for a model that is on request, and what was decided.
create table public.assistant_model_access (
  model_id text not null references public.assistant_models (id) on delete cascade,
  account_id text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  primary key (model_id, account_id)
);

create index assistant_model_access_pending on public.assistant_model_access (requested_at) where status = 'pending';

-- ---------- Ledgers ----------

-- Credits the Administrator bought on the provider's own site and recorded here. No provider lets the Hub read a
-- balance, so what's left is an estimate: these, minus the cost of what was used.
create table public.assistant_credits (
  id bigint generated always as identity primary key,
  provider text not null references public.assistant_providers (id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  note text,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create index assistant_credits_provider on public.assistant_credits (provider);

create table public.assistant_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  account_id text not null,
  unit_id text,
  role_id text,
  model_id text,
  provider text,
  outcome text not null check (outcome in ('answered', 'refused', 'stopped', 'error')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0
);

create index assistant_usage_at on public.assistant_usage (at);
create index assistant_usage_person on public.assistant_usage (account_id, model_id, at);

-- ---------- The index ----------

-- One passage of Hub content. `level` is what may reach a model: 'public' anywhere, 'internal' never to a free plan
-- that shares data. module, action and unit_id are what a viewer must hold, checked again at every question.
create table public.assistant_chunks (
  id text primary key,
  source_id text not null,
  title text not null,
  href text not null,
  content text not null,
  hash text not null,
  level text not null check (level in ('public', 'internal')),
  module text,
  action text,
  unit_id text,
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored,
  updated_at timestamptz not null default now()
);

create index assistant_chunks_embedding on public.assistant_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index assistant_chunks_fts on public.assistant_chunks using gin (fts);
create index assistant_chunks_source on public.assistant_chunks (source_id);

-- ---------- Reads ----------

-- The passages nearest a question, plus any matching its words (names like "THE Impact" embed poorly).
create function public.assistant_search(p_embedding extensions.vector(1024), p_query text, p_levels text[], p_limit integer default 12)
returns table (
  id text, source_id text, title text, href text, content text, level text, module text, action text, unit_id text,
  similarity double precision, text_match boolean
)
language sql
stable
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('english', p_query) as t),
  near as (
    select c.id from public.assistant_chunks c
    where c.level = any (p_levels)
    order by c.embedding operator(extensions.<=>) p_embedding
    limit p_limit * 2
  ),
  words as (
    select c.id from public.assistant_chunks c, q
    where c.level = any (p_levels) and c.fts @@ q.t
    order by ts_rank(c.fts, q.t) desc
    limit p_limit
  )
  select c.id, c.source_id, c.title, c.href, c.content, c.level, c.module, c.action, c.unit_id,
    1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity,
    c.fts @@ (select t from q) as text_match
  from public.assistant_chunks c
  where c.id in (select near.id from near union select words.id from words)
  order by similarity desc
  limit p_limit;
$$;

-- Each provider's spend ever and since a month began, for what's left and for budgets.
create function public.assistant_provider_spend(p_month_start timestamptz)
returns table (provider text, total_usd numeric, month_usd numeric)
language sql
stable
set search_path = ''
as $$
  select u.provider, coalesce(sum(u.cost_usd), 0), coalesce(sum(u.cost_usd) filter (where u.at >= p_month_start), 0)
  from public.assistant_usage u
  where u.provider is not null
  group by u.provider;
$$;

-- Usage grouped by Manila day, model, unit, role and outcome, for the AI tab's charts and tables.
create function public.assistant_usage_rollup(p_since timestamptz)
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
  where u.at >= p_since
  group by 1, 2, 3, 4, 5, 6;
$$;

-- ---------- Only the Hub's server ----------

do $$
declare
  t text;
begin
  foreach t in array array[
    'assistant_settings', 'assistant_providers', 'assistant_models', 'assistant_model_access',
    'assistant_credits', 'assistant_usage', 'assistant_chunks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

revoke all on function public.assistant_search(extensions.vector, text, text[], integer) from public, anon, authenticated;
revoke all on function public.assistant_provider_spend(timestamptz) from public, anon, authenticated;
revoke all on function public.assistant_usage_rollup(timestamptz) from public, anon, authenticated;
grant execute on function public.assistant_search(extensions.vector, text, text[], integer) to service_role;
grant execute on function public.assistant_provider_spend(timestamptz) to service_role;
grant execute on function public.assistant_usage_rollup(timestamptz) to service_role;

-- ---------- Notifications ----------

insert into public.notification_templates (id, ord, name, event, channel, subject, body, enabled) values
  ('tpl-ai-credits', 30, 'AI credits low', 'A provider''s estimated credits are running low', 'In-app', '{provider} credits are low', '{provider} has about ${left} of credit left. Add credits on the AI Assistant page.', true),
  ('tpl-ai-down', 31, 'AI provider stopped', 'A provider refused the assistant''s requests', 'In-app', '{provider} stopped answering', '{provider} stopped answering: {reason}. Check it on the AI Assistant page.', true),
  ('tpl-ai-budget', 32, 'AI budget reached', 'A provider reached its monthly budget', 'In-app', '{provider} reached its budget', '{provider} reached its monthly budget of ${budget}, so its models are paused until next month.', true),
  ('tpl-ai-request', 33, 'AI model request', 'Someone asked to use an AI model', 'In-app', '{name} asked for {model}', '{name} asked to use {model} in the assistant. Decide on the AI Assistant page.', true),
  ('tpl-ai-decision', 34, 'AI model decision', 'A request for an AI model was decided', 'In-app', '{model}: {decision}', 'Your request to use {model} in the assistant was {decision}.', true)
on conflict (id) do nothing;

-- Running servers keep the store, templates included, in memory until this moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
