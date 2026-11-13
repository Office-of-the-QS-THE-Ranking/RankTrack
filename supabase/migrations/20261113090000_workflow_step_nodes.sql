-- Approval Workflows became a node studio (2026-11-13): each approval step can be switched off (requests pass it
-- without stopping) and given to the Director or a Ranking Specialist alone, and each workflow can stop telling the
-- requester its outcome. Existing steps stay on, for either approver; existing workflows keep telling the requester.

alter table public.workflow_steps
  add column enabled boolean not null default true,
  add column approver text not null default 'office' check (approver in ('office', 'director', 'specialist'));

alter table public.workflows add column notify boolean not null default true;

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
