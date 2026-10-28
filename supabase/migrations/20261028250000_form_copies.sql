-- Team copies of a digital form. A form with copies on doesn't open on its questions: its link (/f/<code>) builds a
-- copy first. Each copy is one response from the moment it's built: it takes the form's next reference (CDP-0008)
-- and a link of its own (/f/<code>/<token>), and everyone who opens that link fills in the same answers, saved on
-- the server as they type. A copy is open to anyone with its link, or private: only its owner and the people they
-- add, each proved by Google. Sending a copy turns it into a received response; its link then shows where it stands.
--
-- 1. forms.copies: whether the form's link builds copies (on for the Community Development Project Proposal).
-- 2. form_responses: a copy is a row in status 'draft' with its token, name, access, owner, members, a version
--    that every save moves on (so each page knows what it hasn't seen), the last edit, and who is in it now.
-- 3. hub_form_copy_create numbers a copy as hub_form_submit numbers a response; hub_form_copy_save merges one
--    page's changed answers into the copy; hub_form_copy_pulse says what changed and who is here.
-- 4. Counts and the responses table leave copies still being filled out (hub_form_counts gives them apart).

alter table public.forms add column copies boolean not null default false;
update public.forms set copies = true where id = 'FM-0001';

alter table public.form_responses drop constraint if exists form_responses_status_check;
alter table public.form_responses add constraint form_responses_status_check
  check (status in ('draft', 'received', 'in-review', 'approved', 'returned', 'declined'));

alter table public.form_responses
  -- The copy's link, 128 random bits; null for a response sent straight from the form's link.
  add column token text unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  add column label text check (char_length(label) between 1 and 80),
  add column access text check (access in ('link', 'private')),
  add column owner_email text check (char_length(owner_email) between 3 and 254),
  add column owner_name text check (char_length(owner_name) <= 120),
  -- Who else may open a private copy, by Google email (lower case).
  add column members text[] not null default '{}' check (cardinality(members) <= 30),
  add column version integer not null default 0,
  add column created_at timestamptz,
  -- The last change: { by, at }.
  add column edited jsonb,
  -- Who has the copy open: { <device>: { name, at } }, entries older than a minute ignored.
  add column presence jsonb not null default '{}'::jsonb;

update public.form_responses set created_at = submitted_at where created_at is null;
alter table public.form_responses alter column created_at set default date_trunc('milliseconds', now());
alter table public.form_responses alter column created_at set not null;

alter table public.form_responses add constraint form_responses_copy_check
  check (token is null or (label is not null and access is not null and owner_email is not null));
alter table public.form_responses add constraint form_responses_draft_check
  check (status <> 'draft' or token is not null);

create index form_responses_owner_idx on public.form_responses (form_id, owner_email) where token is not null;
create index form_responses_members_idx on public.form_responses using gin (members) where token is not null;

-- ---------- Building a copy ----------

-- One at a time per form, sharing the responses' numbers: CDP-0001, CDP-0002…
create function public.hub_form_copy_create(p_form_id text, p_prefix text, p_token text, p_label text, p_access text, p_owner_email text, p_owner_name text, p_members text[], p_client text)
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
    insert into public.form_responses as r (form_id, seq, ref, answers, status, client, token, label, access, owner_email, owner_name, members, edited)
    values (
      p_form_id, v_seq, p_prefix || '-' || lpad(v_seq::text, 4, '0'), '{}'::jsonb, 'draft', p_client, p_token, p_label, p_access,
      lower(p_owner_email), nullif(p_owner_name, ''), coalesce(p_members, '{}'::text[]),
      jsonb_build_object('by', nullif(p_owner_name, ''), 'at', date_trunc('milliseconds', now()))
    )
    returning r.ref, r.created_at;
end;
$$;

-- Whether p_email may open the copy: anyone, for a copy open to its link; its owner and members, for a private one.
create function public.hub_form_copy_admits(p_access text, p_owner text, p_members text[], p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_access = 'link' or (coalesce(p_email, '') <> '' and (p_email = p_owner or p_email = any (p_members)));
$$;

-- ---------- Saving ----------

-- One page's changed answers, merged by question: what p_set names replaces that answer, p_unset clears answers,
-- and everything else stays as the others left it. The answers come back whole only when someone else saved since
-- the version the page knew (p_known).
create function public.hub_form_copy_save(p_form_id text, p_token text, p_email text, p_known integer, p_set jsonb, p_unset text[], p_by text, p_max integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.form_responses%rowtype;
  v_answers jsonb;
begin
  select * into r from public.form_responses as x where x.token = p_token and x.form_id = p_form_id for update;
  if not found then
    return jsonb_build_object('error', 'gone');
  end if;
  if not public.hub_form_copy_admits(r.access, r.owner_email, r.members, p_email) then
    return jsonb_build_object('error', 'denied');
  end if;
  if r.status <> 'draft' then
    return jsonb_build_object('error', 'sent');
  end if;
  v_answers := (r.answers || coalesce(p_set, '{}'::jsonb)) - coalesce(p_unset, '{}'::text[]);
  if octet_length(v_answers::text) > p_max then
    return jsonb_build_object('error', 'large');
  end if;
  update public.form_responses
    set answers = v_answers,
        version = r.version + 1,
        edited = jsonb_build_object('by', nullif(p_by, ''), 'at', date_trunc('milliseconds', now())),
        updated_at = date_trunc('milliseconds', now())
    where id = r.id;
  return jsonb_build_object('version', r.version + 1)
    || case when r.version <> p_known then jsonb_build_object('answers', v_answers) else '{}'::jsonb end;
end;
$$;

-- ---------- Keeping a page up to date ----------

-- Every few seconds, from each page open on a copy: the version, the answers if they moved past p_known, who else is
-- here (and this page, p_who, is noted as here), and once the copy is sent, its answers, reference, when, and review.
create function public.hub_form_copy_pulse(p_form_id text, p_token text, p_email text, p_known integer, p_who text, p_name text)
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
  return jsonb_build_object('version', r.version, 'status', r.status, 'label', r.label, 'access', r.access, 'edited', r.edited, 'here', v_here)
    || case when r.version <> p_known or r.status <> 'draft' then jsonb_build_object('answers', r.answers) else '{}'::jsonb end
    || case when r.status <> 'draft' then jsonb_build_object('ref', r.ref, 'submittedAt', r.submitted_at, 'review', r.review) else '{}'::jsonb end;
end;
$$;

-- ---------- Counts ----------

drop function public.hub_form_counts(text[]);

-- Each form's responses: all of them, the last seven days', when the last came, and the copies still being filled out.
create function public.hub_form_counts(p_form_ids text[])
returns table (form_id text, total bigint, week bigint, last_at timestamptz, drafts bigint)
language sql
stable
set search_path = ''
as $$
  select
    r.form_id,
    count(*) filter (where r.status <> 'draft'),
    count(*) filter (where r.status <> 'draft' and r.submitted_at > now() - interval '7 days'),
    max(r.submitted_at) filter (where r.status <> 'draft'),
    count(*) filter (where r.status = 'draft')
  from public.form_responses as r
  where r.form_id = any (p_form_ids)
  group by r.form_id;
$$;

revoke execute on function public.hub_form_copy_create(text, text, text, text, text, text, text, text[], text) from public, anon, authenticated;
revoke execute on function public.hub_form_copy_admits(text, text, text[], text) from public, anon, authenticated;
revoke execute on function public.hub_form_copy_save(text, text, text, integer, jsonb, text[], text, integer) from public, anon, authenticated;
revoke execute on function public.hub_form_copy_pulse(text, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.hub_form_counts(text[]) from public, anon, authenticated;
grant execute on function public.hub_form_copy_create(text, text, text, text, text, text, text, text[], text) to service_role;
grant execute on function public.hub_form_copy_admits(text, text, text[], text) to service_role;
grant execute on function public.hub_form_copy_save(text, text, text, integer, jsonb, text[], text, integer) to service_role;
grant execute on function public.hub_form_copy_pulse(text, text, text, integer, text, text) to service_role;
grant execute on function public.hub_form_counts(text[]) to service_role;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
