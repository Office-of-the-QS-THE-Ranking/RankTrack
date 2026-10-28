-- Digital Forms kinds: Survey, Registration Form, Application Form, Proposal Form, Evaluation Form, Terminal Report.
-- E-form is retired; the Community Development Project Proposal (FM-0001) becomes a Proposal Form.

alter table public.forms drop constraint if exists forms_kind_check;
update public.forms set kind = 'application' where kind = 'eform';
update public.forms set kind = 'proposal' where id = 'FM-0001';
alter table public.forms add constraint forms_kind_check
  check (kind in ('survey', 'registration', 'application', 'proposal', 'evaluation', 'terminal-report'));

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
