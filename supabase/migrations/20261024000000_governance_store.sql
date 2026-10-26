-- The governance store (src/lib/governance/server/store.ts): one versioned JSON document holding the Hub's
-- accounts, roles, directory, records, workflows, configuration and audit trail, and the recovery points
-- taken of it. Only the Hub's server writes them, with the project's secret key; row-level security is on
-- with no policies, and the API roles have no grants, so nothing reaches them through the public API.

create table public.hub_state (
  id smallint primary key default 1 check (id = 1),
  schema integer not null,
  -- Every commit names the version it started from (optimistic concurrency between server instances).
  version bigint not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.hub_recovery_points (
  id text primary key,
  -- SHA-256 of body, checked before a point is verified or restored.
  checksum text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.hub_state enable row level security;
alter table public.hub_recovery_points enable row level security;

revoke all on table public.hub_state, public.hub_recovery_points from anon, authenticated;
