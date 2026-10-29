-- The Student Portal (user, 2026-10-29). A Student account is the Secretary of a student organization, commission
-- or council. Students no longer reach a form's own link to start a copy (the start page is gone): they build
-- copies of the proposals and terminal reports the Office publishes to the Student Portal, build their own
-- Evaluation Forms and Registration Forms, and answer the surveys assigned to them.
--
-- 1. forms.students: published to the Student Portal. Proposal and Terminal Report forms then list under Create, a
--    survey in the students' Assignments. The Community Development Project Proposal is published.
-- 2. forms.owner_id: a Student's own form, held by their account (null for the Office's and a unit's forms).
-- 3. form_responses.account_id: the Hub account that built a copy or sent a response while signed in. It lists a
--    Student's proposals and terminal reports, and which assignments they answered.
-- 4. hub_form_submit and hub_form_copy_create record that account.
-- 5. Data governance: form responses are registered as a dataset, DS-FORMS (Confidential, personal data).

alter table public.forms add column students boolean not null default false;
alter table public.forms add column owner_id text check (owner_id is null or char_length(owner_id) between 1 and 80);
create index forms_owner_idx on public.forms (owner_id) where owner_id is not null;
update public.forms set students = true where id = 'FM-0001';

alter table public.form_responses add column account_id text check (account_id is null or char_length(account_id) between 1 and 80);
create index form_responses_account_idx on public.form_responses (account_id, form_id) where account_id is not null;

-- ---------- Responses ----------

drop function public.hub_form_submit(text, text, jsonb, jsonb, text, text, jsonb);

-- One response at a time per form, so each takes the next number of its form: CDP-0001, CDP-0002…
create function public.hub_form_submit(p_form_id text, p_prefix text, p_answers jsonb, p_respondent jsonb, p_status text, p_client text, p_consent jsonb, p_account text default null)
returns table (ref text, submitted_at timestamptz)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seq integer;
begin
  if p_consent is null then
    raise exception 'A response needs the data privacy consent.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('form_responses:' || p_form_id, 0));
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.form_responses as r where r.form_id = p_form_id;
  return query
    insert into public.form_responses as r (form_id, seq, ref, answers, respondent, status, client, privacy_consent, account_id)
    values (p_form_id, v_seq, p_prefix || '-' || lpad(v_seq::text, 4, '0'), p_answers, coalesce(p_respondent, '{}'::jsonb), p_status, p_client, p_consent, nullif(p_account, ''))
    returning r.ref, r.submitted_at;
end;
$$;

revoke execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text, jsonb, text) to service_role;

-- ---------- Copies ----------

drop function public.hub_form_copy_create(text, text, text, text, text, text, text, text[], text);

-- One at a time per form, sharing the responses' numbers: CDP-0001, CDP-0002…
create function public.hub_form_copy_create(p_form_id text, p_prefix text, p_token text, p_label text, p_access text, p_owner_email text, p_owner_name text, p_members text[], p_client text, p_account text default null)
returns table (ref text, created_at timestamptz)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seq integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('form_responses:' || p_form_id, 0));
  select coalesce(max(r.seq), 0) + 1 into v_seq from public.form_responses as r where r.form_id = p_form_id;
  return query
    insert into public.form_responses as r (form_id, seq, ref, answers, status, client, token, label, access, owner_email, owner_name, members, edited, account_id)
    values (
      p_form_id, v_seq, p_prefix || '-' || lpad(v_seq::text, 4, '0'), '{}'::jsonb, 'draft', p_client, p_token, p_label, p_access,
      lower(p_owner_email), nullif(p_owner_name, ''), coalesce(p_members, '{}'::text[]),
      jsonb_build_object('by', nullif(p_owner_name, ''), 'at', date_trunc('milliseconds', now())),
      nullif(p_account, '')
    )
    returning r.ref, r.created_at;
end;
$$;

revoke execute on function public.hub_form_copy_create(text, text, text, text, text, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.hub_form_copy_create(text, text, text, text, text, text, text, text[], text, text) to service_role;

-- ---------- Data governance ----------

insert into public.datasets (id, ord, name, description, owner_unit_id, steward_id, classification, locked, retention_years, retention_then, export_policy, bodies, public_surface, personal, records, version, updated_at)
select
  'DS-FORMS', coalesce(max(d.ord), -1) + 1, 'Digital form responses',
  'Proposals, terminal reports, evaluations, registrations and surveys sent through Digital Forms, with each review. Read in the Hub by the people who run each form and by the Office.',
  'rankings-office', '', 'Confidential', null, 5, 'Review', 'Approval required', array['THE']::text[], null, true, 0, 1, now()
from public.datasets as d
where not exists (select 1 from public.datasets where id = 'DS-FORMS');

insert into public.dataset_versions (dataset_id, v, ord, at, by, note)
select 'DS-FORMS', 1, 0, now(), 'system', 'Registered with the Student Portal'
where not exists (select 1 from public.dataset_versions where dataset_id = 'DS-FORMS' and v = 1);

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
