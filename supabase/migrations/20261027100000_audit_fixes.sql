-- Fixes from the security and performance audit of 2026-10-27.

-- ---------- Evidence: real attachments, and who submitted by account ----------

-- Separation of duties compares accounts, not display names. Older rows keep only the name.
alter table public.evidence add column submitted_by_id text;
-- Uploaded files in the R2 private bucket: [{ "name", "src", "bytes" }]. `files` keeps the names (and a public URL) for display.
alter table public.evidence add column attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array');

-- ---------- Uploads: who sent each file, and when it stopped being used ----------

-- One row per object the Hub handed out an upload URL for. A file a post, unit or evidence item stops using is
-- released, not deleted, and kept for the backup retention period so a restored recovery point still finds it.
create table public.media_uploads (
  key text primary key check (key ~ '^(posts|emblems|evidence)/[0-9a-f-]{36}\.[a-z0-9]+$'),
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index media_uploads_released_idx on public.media_uploads (released_at) where released_at is not null;

alter table public.media_uploads enable row level security;
revoke all on table public.media_uploads from anon, authenticated;

-- ---------- Sessions: last activity never moves backwards ----------

-- touch() writes sessions.last_seen directly, without a new store version, so a commit from an instance whose
-- copy is older must not write an earlier time back. Same as 20261026230000_relational_store.sql otherwise.
create or replace function public.hub_commit(p_version bigint, p_schema integer, p_deletes jsonb, p_upserts jsonb, p_audit jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_version bigint;
  v_item jsonb;
  v_table text;
  v_keys text[];
  v_cols text[];
  v_rest text[];
begin
  select version into v_version from public.hub_meta where id = 1 for update;
  if not found then
    if p_version <> 0 then
      return null;
    end if;
    insert into public.hub_meta (id, schema, version) values (1, p_schema, 0) on conflict (id) do nothing;
    select version into v_version from public.hub_meta where id = 1 for update;
  end if;
  if v_version <> p_version then
    return null;
  end if;

  set constraints all deferred;

  for v_item in select value from jsonb_array_elements(coalesce(p_deletes, '[]'::jsonb)) loop
    v_table := public.hub_table(v_item ->> 'table');
    v_keys := public.hub_columns(v_table, true);
    execute format(
      'delete from public.%I as t using jsonb_populate_recordset(null::public.%I, $1) as d where (%s) = (%s)',
      v_table, v_table,
      (select string_agg('t.' || quote_ident(k), ', ') from unnest(v_keys) as k),
      (select string_agg('d.' || quote_ident(k), ', ') from unnest(v_keys) as k)
    ) using v_item -> 'rows';
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_upserts, '[]'::jsonb)) loop
    v_table := public.hub_table(v_item ->> 'table');
    v_keys := public.hub_columns(v_table, true);
    v_cols := public.hub_columns(v_table, null);
    v_rest := public.hub_columns(v_table, false);
    execute format(
      'insert into public.%I as t (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) %s',
      v_table,
      (select string_agg(quote_ident(c), ', ') from unnest(v_cols) as c),
      (select string_agg(quote_ident(c), ', ') from unnest(v_cols) as c),
      v_table,
      (select string_agg(quote_ident(k), ', ') from unnest(v_keys) as k),
      case
        when coalesce(array_length(v_rest, 1), 0) = 0 then 'do nothing'
        else format(
          'do update set (%s) = row(%s)',
          (select string_agg(quote_ident(c), ', ') from unnest(v_rest) as c),
          (select string_agg(
            case when v_table = 'sessions' and c = 'last_seen' then 'greatest(t.last_seen, excluded.last_seen)' else 'excluded.' || quote_ident(c) end,
            ', '
          ) from unnest(v_rest) as c)
        )
      end
    ) using v_item -> 'rows';
  end loop;

  -- In sequence order, so each entry's chain check sees the one before it.
  insert into public.audit_events
  select * from jsonb_populate_recordset(null::public.audit_events, coalesce(p_audit, '[]'::jsonb)) as e order by e.seq;

  update public.hub_meta set version = version + 1, schema = p_schema, updated_at = now() where id = 1;
  return v_version + 1;
end;
$$;

revoke execute on function public.hub_commit(bigint, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hub_commit(bigint, integer, jsonb, jsonb, jsonb) to service_role;

-- ---------- Sessions: only a hash of each token is stored ----------

-- The cookie holds the token; the store holds its SHA-256 (hex), so reading the database or the console never
-- yields a working session. Tokens already hashed (64 hex characters) are left alone, so this runs once.
update public.sessions set id = encode(sha256(convert_to(id, 'UTF8')), 'hex') where id !~ '^[0-9a-f]{64}$';
-- Every instance reloads the store instead of matching the old ids.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
