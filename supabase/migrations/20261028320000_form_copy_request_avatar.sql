-- A request to open a private copy carries the asker's Google photo, so its owner sees who is asking.
-- hub_form_copy_request takes p_avatar; asking again refreshes the name and photo of a request still waiting.

drop function if exists public.hub_form_copy_request(text, text, text, text);

-- 'ok', or why not: 'gone', 'sent', 'open' (anyone with the link may open it), 'member', 'asked' (already), 'full'.
create function public.hub_form_copy_request(p_form_id text, p_token text, p_email text, p_name text, p_avatar text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  r public.form_responses%rowtype;
  v_ask jsonb := jsonb_strip_nulls(jsonb_build_object('email', p_email, 'name', left(p_name, 120), 'avatar', nullif(left(p_avatar, 1024), ''), 'at', date_trunc('milliseconds', now())));
begin
  select * into r from public.form_responses where form_id = p_form_id and token = p_token for update;
  if not found then return 'gone'; end if;
  if r.status <> 'draft' then return 'sent'; end if;
  if r.access <> 'private' then return 'open'; end if;
  if p_email = r.owner_email or p_email = any(r.members) then return 'member'; end if;
  if exists (select 1 from jsonb_array_elements(r.access_requests) q where q->>'email' = p_email) then
    update public.form_responses
      set access_requests = (select jsonb_agg(case when q->>'email' = p_email then q || (v_ask - 'at') else q end) from jsonb_array_elements(r.access_requests) q)
      where id = r.id;
    return 'asked';
  end if;
  if jsonb_array_length(r.access_requests) >= 20 or cardinality(r.members) >= 30 then return 'full'; end if;
  update public.form_responses set access_requests = access_requests || jsonb_build_array(v_ask) where id = r.id;
  return 'ok';
end;
$$;

revoke execute on function public.hub_form_copy_request(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hub_form_copy_request(text, text, text, text, text) to service_role;
