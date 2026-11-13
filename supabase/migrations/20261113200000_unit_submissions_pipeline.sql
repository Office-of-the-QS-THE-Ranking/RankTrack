-- Workflow Pipelines gained Unit submissions (user, 2026-11-13): the review steps evidence from the units goes
-- through, each decided by either approver or by one position. Evidence keeps where it stands in them while For
-- review: the step it waits on and the steps already approved (account ids). The workflow starts as today's single
-- review by any reviewer, so nothing waiting changes.

alter table public.workflows drop constraint if exists workflows_id_check;
alter table public.workflows add constraint workflows_id_check
  check (id in ('account-access', 'privilege-escalation', 'org-unit', 'data-access', 'publication', 'destructive', 'unit-submissions'));

alter table public.evidence
  add column review_step integer check (review_step between 0 and 4),
  add column review_approvals jsonb not null default '[]' check (jsonb_typeof(review_approvals) = 'array');

insert into public.workflows (id, ord, name, description, enabled, sla_days, separation, notify)
select 'unit-submissions', coalesce(max(ord), 0) + 1, 'Unit submissions',
  'Evidence a College/Faculty, Office or partner sends. It counts toward the rankings, merit and honours only after its last review step.',
  true, 5, true, true
from public.workflows
on conflict (id) do nothing;

insert into public.workflow_steps (workflow_id, ord, name, enabled, approver)
values ('unit-submissions', 1, 'Evidence review', true, 'office')
on conflict (workflow_id, ord) do nothing;

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
