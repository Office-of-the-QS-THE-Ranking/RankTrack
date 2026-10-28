-- Step 0 of every Digital Form is the data privacy notice (src/lib/forms/privacy.ts): how the Office of the
-- QS/THE Rankings and UST SIMBAHAYAN use what the form collects. A response is taken only with both of its
-- statements agreed to, and keeps that consent: the notice's version and the statements, given when the response
-- was submitted (submitted_at). Responses sent before the notice have none.

alter table public.form_responses add column privacy_consent jsonb
  check (privacy_consent is null or (jsonb_typeof(privacy_consent) = 'object' and privacy_consent ? 'version' and jsonb_typeof(privacy_consent -> 'agreed') = 'array'));

drop function public.hub_form_submit(text, text, jsonb, jsonb, text, text);

-- One response at a time per form, so each takes the next number of its form: CDP-0001, CDP-0002…
create function public.hub_form_submit(p_form_id text, p_prefix text, p_answers jsonb, p_respondent jsonb, p_status text, p_client text, p_consent jsonb)
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
    insert into public.form_responses as r (form_id, seq, ref, answers, respondent, status, client, privacy_consent)
    values (p_form_id, v_seq, p_prefix || '-' || lpad(v_seq::text, 4, '0'), p_answers, coalesce(p_respondent, '{}'::jsonb), p_status, p_client, p_consent)
    returning r.ref, r.submitted_at;
end;
$$;

revoke execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hub_form_submit(text, text, jsonb, jsonb, text, text, jsonb) to service_role;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
