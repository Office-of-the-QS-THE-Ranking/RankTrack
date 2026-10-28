-- Team copies update live. Besides saving to the copy (hub_form_copy_save), the pages open on a copy share each
-- change as it's typed, who is in which question, and each save, over a Supabase Realtime channel named by the copy's
-- `live` id. Only pages the copy admits are given that id (the page itself, and hub_form_copy_pulse); it changes
-- whenever the owner changes who can open the copy, so someone taken off a private copy is left on a channel no one
-- uses any more. The copy as saved stays the record: a page that misses a message catches up on its next pulse.

alter table public.form_responses add column live uuid not null default gen_random_uuid();

-- As before, and the copy's live channel id.
create or replace function public.hub_form_copy_pulse(p_form_id text, p_token text, p_email text, p_known integer, p_who text, p_name text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.form_responses%rowtype;
  v_now timestamptz := now();
  v_here jsonb;
  v_who text := nullif(p_who, '');
  v_name text := nullif(p_name, '');
begin
  select * into r from public.form_responses as x where x.token = p_token and x.form_id = p_form_id;
  if not found then
    return jsonb_build_object('error', 'gone');
  end if;
  if not public.hub_form_copy_admits(r.access, r.owner_email, r.members, p_email) then
    return jsonb_build_object('error', 'denied');
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_here
    from jsonb_each(r.presence) as e
    where e.key <> coalesce(v_who, '') and (e.value ->> 'at')::timestamptz > v_now - interval '45 seconds';
  -- This page is here: written at most every 15 seconds, read-modify-write in one statement under the row's lock.
  if r.status = 'draft' and v_who is not null and (
    not (r.presence ? v_who)
    or (r.presence -> v_who ->> 'at')::timestamptz < v_now - interval '15 seconds'
    or (r.presence -> v_who ->> 'name') is distinct from v_name
  ) then
    update public.form_responses as x
      set presence = (
        select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each(x.presence) as e
        where e.key <> v_who and (e.value ->> 'at')::timestamptz > v_now - interval '45 seconds'
      ) || jsonb_build_object(v_who, jsonb_build_object('name', v_name, 'at', v_now))
      where x.id = r.id;
  end if;
  return jsonb_build_object('version', r.version, 'status', r.status, 'label', r.label, 'access', r.access, 'edited', r.edited, 'here', v_here, 'live', r.live)
    || case when r.version <> p_known or r.status <> 'draft' then jsonb_build_object('answers', r.answers) else '{}'::jsonb end
    || case when r.status <> 'draft' then jsonb_build_object('ref', r.ref, 'submittedAt', r.submitted_at, 'review', r.review) else '{}'::jsonb end;
end;
$$;
