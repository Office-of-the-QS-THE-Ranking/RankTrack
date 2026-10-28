-- Asking to open a private team copy. Someone signed in with a Google account that isn't on a private copy can ask
-- its owner for access from the copy's link. The owner sees who asked in the copy's Share sheet and lets them in
-- (they join the copy's members) or turns them down (the request is dropped).
--
-- 1. form_responses.access_requests: [{ email, name, at }], newest last, at most 20.
-- 2. hub_form_copy_request adds one, once per email; hub_form_copy_answer lets the owner allow or decline it.

alter table public.form_responses
  add column access_requests jsonb not null default '[]'::jsonb
    check (jsonb_typeof(access_requests) = 'array' and jsonb_array_length(access_requests) <= 20);

-- 'ok', or why not: 'gone', 'sent', 'open' (anyone with the link may open it), 'member', 'asked' (already), 'full'.
create function public.hub_form_copy_request(p_form_id text, p_token text, p_email text, p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  r public.form_responses%rowtype;
begin
  select * into r from public.form_responses where form_id = p_form_id and token = p_token for update;
  if not found then return 'gone'; end if;
  if r.status <> 'draft' then return 'sent'; end if;
  if r.access <> 'private' then return 'open'; end if;
  if p_email = r.owner_email or p_email = any(r.members) then return 'member'; end if;
  if exists (select 1 from jsonb_array_elements(r.access_requests) q where q->>'email' = p_email) then return 'asked'; end if;
  if jsonb_array_length(r.access_requests) >= 20 or cardinality(r.members) >= 30 then return 'full'; end if;
  update public.form_responses
    set access_requests = access_requests || jsonb_build_array(jsonb_build_object('email', p_email, 'name', left(p_name, 120), 'at', date_trunc('milliseconds', now())))
    where id = r.id;
  return 'ok';
end;
$$;

-- 'ok', or why not: 'gone', 'owner' (only the owner answers), 'none' (no such request), 'full'.
-- Allowing adds the email to the members and moves the copy to a new live channel, as a sharing change does.
create function public.hub_form_copy_answer(p_form_id text, p_token text, p_owner text, p_email text, p_allow boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  r public.form_responses%rowtype;
begin
  select * into r from public.form_responses where form_id = p_form_id and token = p_token for update;
  if not found then return 'gone'; end if;
  if r.owner_email <> p_owner then return 'owner'; end if;
  if not exists (select 1 from jsonb_array_elements(r.access_requests) q where q->>'email' = p_email) then return 'none'; end if;
  if p_allow and not (p_email = any(r.members)) and cardinality(r.members) >= 30 then return 'full'; end if;
  update public.form_responses
    set access_requests = coalesce((select jsonb_agg(q) from jsonb_array_elements(r.access_requests) q where q->>'email' <> p_email), '[]'::jsonb),
        members = case when p_allow and not (p_email = any(r.members)) then members || p_email else members end,
        live = case when p_allow then gen_random_uuid() else live end
    where id = r.id;
  return 'ok';
end;
$$;

revoke execute on function public.hub_form_copy_request(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.hub_form_copy_answer(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.hub_form_copy_request(text, text, text, text) to service_role;
grant execute on function public.hub_form_copy_answer(text, text, text, text, boolean) to service_role;
