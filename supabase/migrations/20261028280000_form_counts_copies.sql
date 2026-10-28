-- A team copy is a response from the moment it's built (user, 2026-10-28): the counts take every row,
-- sent or still being filled in. A copy's submitted_at is its build time until it's sent. `drafts` still
-- gives the unsent ones apart.

create or replace function public.hub_form_counts(p_form_ids text[])
returns table (form_id text, total bigint, week bigint, last_at timestamptz, drafts bigint)
language sql
stable
set search_path = ''
as $$
  select
    r.form_id,
    count(*),
    count(*) filter (where r.submitted_at > now() - interval '7 days'),
    max(r.submitted_at),
    count(*) filter (where r.status = 'draft')
  from public.form_responses as r
  where r.form_id = any (p_form_ids)
  group by r.form_id;
$$;

revoke execute on function public.hub_form_counts(text[]) from public, anon, authenticated;
grant execute on function public.hub_form_counts(text[]) to service_role;
