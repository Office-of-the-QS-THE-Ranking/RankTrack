-- The governance store as relational tables. Until now the Hub kept accounts, the directory, workflows, records,
-- configuration and the audit trail in one JSON document (hub_state). From here every entity has its own table
-- with typed columns, keys, foreign keys and checks; lists keep their order in an `ord` column.
--
-- Writes go through public.hub_commit only: one transaction applies the changed rows of every table, appends the
-- sealed audit entries and moves the store's version on, refusing the commit if another server instance committed
-- first (optimistic concurrency on hub_meta.version). Reads go through public.hub_snapshot. Only the Hub's server
-- reaches either, with the project's secret key; row-level security is on with no policies and the API roles have
-- no grants. The audit trail is append-only: triggers refuse any update, delete or truncate, and every entry must
-- continue the hash chain of the one before it.
--
-- Foreign keys are deferred to the end of the transaction so a commit may write rows in any order.

-- ---------- The store ----------

create table public.hub_meta (
  id smallint primary key default 1 check (id = 1),
  schema integer not null,
  -- Moves on with every commit; a commit names the version it read.
  version bigint not null default 1,
  seeded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Directory ----------

create table public.org_units (
  id text primary key,
  ord integer not null,
  directory_key text,
  code text not null,
  name text not null,
  kind text not null check (kind in ('University', 'Office', 'Faculty', 'College', 'Institute', 'School', 'Student Government', 'Research Centre', 'Department', 'Program')),
  parent_id text references public.org_units (id) deferrable initially deferred,
  status text not null check (status in ('Active', 'Archived')),
  -- The unit's own contact addresses; null when none were ever set.
  emails text[],
  -- A logo uploaded in the Directory (an object in R2, served at /media/emblems/…).
  emblem_src text,
  emblem_width integer check (emblem_width > 0),
  emblem_height integer check (emblem_height > 0),
  established date,
  archived_at timestamptz,
  archived_reason text,
  merged_into text references public.org_units (id) deferrable initially deferred,
  check ((emblem_src is null) = (emblem_width is null) and (emblem_src is null) = (emblem_height is null))
);
create index org_units_parent_idx on public.org_units (parent_id);
create index org_units_directory_key_idx on public.org_units (directory_key);

create table public.org_unit_history (
  unit_id text not null references public.org_units (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  at timestamptz not null,
  by text not null,
  change text not null,
  primary key (unit_id, ord)
);

-- ---------- Accounts and sign-in ----------

create table public.accounts (
  id text primary key,
  ord integer not null,
  name text not null,
  email text not null check (email like '%@%'),
  title text not null default '',
  avatar text,
  unit_id text not null references public.org_units (id) deferrable initially deferred,
  status text not null check (status in ('Active', 'Pending Invitation', 'Suspended', 'Deactivated')),
  created_at timestamptz not null,
  invited_at timestamptz,
  last_login timestamptz,
  first_login timestamptz,
  identity text not null check (identity in ('Google Workspace', 'Sponsored guest')),
  external boolean,
  mfa_enrolled boolean not null default false,
  mfa_method text check (mfa_method in ('Authenticator app', 'Security key')),
  reauth_after timestamptz,
  status_reason text,
  status_changed_at timestamptz,
  kept_active_at timestamptz,
  kept_active_by text
);
create unique index accounts_email_key on public.accounts (lower(email));
create index accounts_unit_idx on public.accounts (unit_id);

-- Designated coordinators of a unit.
create table public.org_unit_admins (
  unit_id text not null references public.org_units (id) on delete cascade deferrable initially deferred,
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  primary key (unit_id, account_id)
);
create index org_unit_admins_account_idx on public.org_unit_admins (account_id);

-- A role held by an account and the records it reaches. A null scope array means no restriction on that axis.
create table public.account_assignments (
  id text primary key,
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  role_id text not null check (role_id in ('university-admin', 'coordinator', 'external')),
  scope_units text[],
  scope_bodies text[],
  scope_years text[],
  scope_datasets text[],
  granted_by text not null,
  granted_at timestamptz not null,
  -- Temporary access ends at the start of this day.
  expires date,
  note text
);
create index account_assignments_account_idx on public.account_assignments (account_id);

create table public.account_transfers (
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  from_unit text not null,
  to_unit text not null,
  at timestamptz not null,
  by text not null,
  primary key (account_id, ord)
);

-- Temporary dataset access granted through an approved data access request.
create table public.account_data_grants (
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  dataset_id text not null,
  access text not null check (access in ('View', 'Export')),
  until date not null,
  request_id text not null,
  primary key (account_id, ord)
);

create table public.sessions (
  id text primary key,
  ord integer not null,
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null,
  last_seen timestamptz not null,
  mfa boolean not null default false,
  device text not null default ''
);
create index sessions_account_idx on public.sessions (account_id);

-- A sign-in waiting for its second factor.
create table public.sign_in_challenges (
  id text primary key,
  ord integer not null,
  account_id text not null references public.accounts (id) on delete cascade deferrable initially deferred,
  created_at timestamptz not null,
  next text not null,
  attempts integer not null default 0
);

create table public.sign_in_failures (
  ord integer primary key,
  email text not null,
  at timestamptz not null
);

-- ---------- Data governance ----------

create table public.datasets (
  id text primary key,
  ord integer not null,
  name text not null,
  description text not null default '',
  owner_unit_id text not null references public.org_units (id) deferrable initially deferred,
  steward_id text not null default '',
  classification text not null check (classification in ('Public', 'Internal', 'Confidential', 'Restricted')),
  locked text,
  retention_years integer not null check (retention_years >= 0),
  retention_then text not null check (retention_then in ('Archive', 'Review', 'Dispose')),
  export_policy text not null check (export_policy in ('Allowed', 'Approval required', 'Blocked')),
  bodies text[] not null default '{}',
  public_surface text,
  personal boolean not null default false,
  records integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null
);

create table public.dataset_versions (
  dataset_id text not null references public.datasets (id) on delete cascade deferrable initially deferred,
  v integer not null,
  ord integer not null,
  at timestamptz not null,
  by text not null,
  note text not null default '',
  primary key (dataset_id, v)
);

create table public.quality_rules (
  id text primary key,
  ord integer not null,
  dataset_id text not null references public.datasets (id) deferrable initially deferred,
  name text not null,
  description text not null default '',
  enabled boolean not null,
  severity text not null check (severity in ('Error', 'Warning')),
  "check" text not null check ("check" in ('period', 'files', 'beneficiaries', 'mapped', 'duplicates', 'replication', 'external')),
  external_failures integer,
  last_run timestamptz
);

create table public.duplicate_decisions (
  key text primary key,
  ord integer not null,
  decision text not null check (decision in ('Merged', 'Dismissed')),
  keep text,
  by text not null,
  at timestamptz not null
);

-- Who stewards each dictionary term, and the Office's own definition when it replaces the reference one.
create table public.term_stewardship (
  term text primary key,
  ord integer not null,
  definition text,
  dataset_id text not null references public.datasets (id) deferrable initially deferred,
  steward_id text not null default '',
  unit_of_measure text not null default '',
  updated_at timestamptz not null
);

-- ---------- Privacy and security ----------

create table public.security_policy (
  id smallint primary key default 1 check (id = 1),
  mfa_mode text not null check (mfa_mode in ('Everyone', 'Privileged roles', 'Off')),
  mfa_roles text[] not null default '{}',
  mfa_methods text[] not null default '{}',
  sso_provider text not null,
  sso_enforced boolean not null,
  sso_domains text[] not null default '{}',
  sso_allow_guests boolean not null,
  session_idle_minutes integer not null check (session_idle_minutes > 0),
  session_absolute_hours integer not null check (session_absolute_hours > 0),
  session_warn_minutes integer not null check (session_warn_minutes >= 0),
  lockout_attempts integer not null check (lockout_attempts > 0),
  lockout_window_minutes integer not null check (lockout_window_minutes > 0),
  inactivity_days integer not null check (inactivity_days > 0),
  export_approval_for text[] not null default '{}',
  export_blocked text[] not null default '{}',
  export_watermark boolean not null,
  sharing_external_links boolean not null,
  sharing_guest_downloads boolean not null,
  privacy_officer text not null,
  privacy_email text not null,
  privacy_notice_updated date not null,
  privacy_breach_hours integer not null,
  encryption_at_rest text not null,
  encryption_in_transit text not null,
  encryption_secrets_manager text not null
);

create table public.access_reviews (
  id text primary key,
  ord integer not null,
  name text not null,
  scope text not null,
  due date not null,
  status text not null check (status in ('Scheduled', 'In progress', 'Complete')),
  reviewer_id text not null
);

-- The accounts a review covers, and the decision on each once made.
create table public.access_review_items (
  review_id text not null references public.access_reviews (id) on delete cascade deferrable initially deferred,
  account_id text not null,
  ord integer not null,
  decision text check (decision in ('Keep', 'Revoke')),
  primary key (review_id, account_id)
);

create table public.privacy_assessments (
  id text primary key,
  ord integer not null,
  name text not null,
  dataset_id text not null,
  risk text not null check (risk in ('Low', 'Medium', 'High')),
  status text not null check (status in ('Draft', 'In review', 'Approved')),
  owner text not null,
  updated date not null,
  measures text not null default ''
);

create table public.subject_requests (
  id text primary key,
  ord integer not null,
  type text not null check (type in ('Access', 'Correction', 'Erasure or blocking', 'Objection', 'Portability')),
  subject text not null,
  received date not null,
  due date not null,
  status text not null check (status in ('Open', 'In progress', 'Fulfilled', 'Declined')),
  handler_id text not null,
  note text
);

create table public.security_alerts (
  id text primary key,
  ord integer not null,
  at timestamptz not null,
  severity text not null check (severity in ('Low', 'Medium', 'High')),
  kind text not null,
  account_id text,
  detail text not null,
  status text not null check (status in ('Open', 'Acknowledged', 'Resolved'))
);
create index security_alerts_at_idx on public.security_alerts (at desc);

create table public.secret_keys (
  id text primary key,
  ord integer not null,
  name text not null,
  purpose text not null,
  algorithm text not null,
  created date not null,
  rotated date not null,
  rotation_days integer not null check (rotation_days > 0)
);

create table public.incidents (
  id text primary key,
  ord integer not null,
  title text not null,
  severity text not null check (severity in ('Low', 'Medium', 'High', 'Critical')),
  reported timestamptz not null,
  reporter_id text not null,
  status text not null check (status in ('Reported', 'Investigating', 'Escalated', 'Contained', 'Closed')),
  personal_data boolean not null,
  escalated_to text
);

create table public.incident_timeline (
  incident_id text not null references public.incidents (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  at timestamptz not null,
  by text not null,
  note text not null,
  primary key (incident_id, ord)
);

-- ---------- Audit ----------

-- Append-only and hash-chained: each entry's hash is SHA-256 over the previous hash and its own contents
-- (src/lib/governance/server/store.ts sealHash), so a changed or missing entry breaks every hash after it.
create table public.audit_events (
  seq bigint primary key check (seq > 0),
  at timestamptz not null,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  category text not null check (category in ('Account', 'Access', 'Session', 'Data', 'Approval', 'Export', 'Directory', 'Security', 'Configuration', 'Backup')),
  resource_type text not null,
  resource_id text not null,
  resource_label text not null,
  outcome text not null check (outcome in ('Success', 'Denied', 'Failed')),
  detail text,
  prev text not null check (prev ~ '^[0-9a-f]{64}$'),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$')
);
create index audit_events_at_idx on public.audit_events (at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, action, at desc);
create index audit_events_resource_idx on public.audit_events (resource_id);

create function public.audit_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit trail is append-only: % is not allowed.', tg_op using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.audit_events_append_only();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function public.audit_events_append_only();

-- Every entry continues the chain: the next sequence number, and the hash of the entry before it as `prev`.
create function public.audit_events_continue_chain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_last record;
begin
  select seq, hash into v_last from public.audit_events order by seq desc limit 1;
  if new.seq <> coalesce(v_last.seq, 0) + 1 or new.prev <> coalesce(v_last.hash, repeat('0', 64)) then
    raise exception 'Audit entry % does not continue the chain (last entry %).', new.seq, coalesce(v_last.seq, 0) using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger audit_events_chain before insert on public.audit_events
  for each row execute function public.audit_events_continue_chain();

-- ---------- Approval workflows ----------

create table public.workflows (
  id text primary key check (id in ('account-access', 'privilege-escalation', 'org-unit', 'data-access', 'publication', 'destructive')),
  ord integer not null,
  name text not null,
  description text not null default '',
  enabled boolean not null,
  sla_days integer not null check (sla_days > 0),
  -- The requester can never approve their own request.
  separation boolean not null
);

create table public.workflow_steps (
  workflow_id text not null references public.workflows (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  name text not null,
  primary key (workflow_id, ord)
);

create table public.approval_requests (
  id text primary key,
  ord integer not null,
  workflow_id text not null references public.workflows (id) deferrable initially deferred,
  title text not null,
  requester_id text not null,
  requested_at timestamptz not null,
  justification text not null default '',
  -- What is asked for. Its shape depends on the kind (src/lib/governance/types.ts RequestPayload).
  kind text not null check (kind in ('account-access', 'privilege-escalation', 'org-unit', 'data-access', 'publication', 'destructive')),
  payload jsonb not null check (payload ->> 'kind' = kind),
  status text not null check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  step integer not null default 0,
  reviewing_by text,
  reviewing_at timestamptz,
  due date not null,
  completed_at timestamptz,
  check ((reviewing_by is null) = (reviewing_at is null))
);
create index approval_requests_status_idx on public.approval_requests (status, kind);
create index approval_requests_email_idx on public.approval_requests (lower(payload ->> 'email')) where kind = 'account-access';

create table public.approval_decisions (
  request_id text not null references public.approval_requests (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  step integer not null,
  by text not null,
  at timestamptz not null,
  decision text not null check (decision in ('Approved', 'Rejected')),
  note text,
  primary key (request_id, ord)
);

-- ---------- System configuration ----------

create table public.ranking_bodies (
  key text primary key,
  ord integer not null,
  name text not null,
  short text not null,
  enabled boolean not null,
  website text not null
);

-- Which reference frameworks (ranking_frameworks) are tracked and shown, and their confirmed deadlines.
create table public.ranking_settings (
  slug text primary key references public.ranking_frameworks (slug) deferrable initially deferred,
  ord integer not null,
  enabled boolean not null,
  public boolean not null,
  deadline date not null
);

create table public.reporting_cycles (
  id text primary key,
  ord integer not null,
  status text not null check (status in ('Current', 'Open', 'Closed', 'Archived'))
);

create table public.academic_years (
  id text primary key,
  ord integer not null,
  current boolean not null
);

create table public.reporting_periods (
  id text primary key,
  ord integer not null,
  label text not null,
  note text not null default '',
  accepting boolean not null
);

create table public.notification_templates (
  id text primary key,
  ord integer not null,
  name text not null,
  event text not null,
  channel text not null check (channel in ('Email', 'In-app', 'Email and in-app')),
  subject text not null,
  body text not null,
  enabled boolean not null
);

create table public.features (
  id text primary key,
  ord integer not null,
  name text not null,
  description text not null default '',
  area text not null check (area in ('Contributor workspace', 'Office workspace', 'Public website')),
  enabled boolean not null
);

create table public.feature_flags (
  id text primary key,
  ord integer not null,
  name text not null,
  description text not null default '',
  mode text not null check (mode in ('Off', 'Selected', 'Everyone')),
  accounts text[] not null default '{}',
  units text[] not null default '{}',
  updated_at timestamptz not null
);

create table public.system_settings (
  id smallint primary key default 1 check (id = 1),
  upload_max_file_mb integer not null check (upload_max_file_mb > 0),
  upload_max_files integer not null check (upload_max_files > 0),
  upload_types text[] not null default '{}',
  dashboard_office_view text not null check (dashboard_office_view in ('submissions', 'rankings')),
  dashboard_show_clock boolean not null,
  dashboard_deadline_warning_days integer not null,
  site_notice text not null default '',
  site_notice_on boolean not null default false,
  site_as_of date not null,
  -- When anonymous post view counting began.
  post_views_since timestamptz not null
);

-- ---------- Backup and recovery ----------

create table public.backup_settings (
  id smallint primary key default 1 check (id = 1),
  schedule_full text not null,
  schedule_incremental text not null,
  retention_days integer not null check (retention_days > 0),
  monthly_months integer not null,
  offsite boolean not null,
  encrypted boolean not null,
  rpo_minutes integer not null check (rpo_minutes > 0),
  rto_minutes integer not null check (rto_minutes > 0)
);

-- The catalogue of recovery points. Each point's contents are a gzipped file in the R2 private bucket.
create table public.recovery_points (
  id text primary key,
  ord integer not null,
  at timestamptz not null,
  kind text not null check (kind in ('Full', 'Incremental', 'Manual')),
  size_mb numeric(10, 2) not null default 0,
  location text not null check (location in ('Primary region', 'Off-site copy')),
  status text not null check (status in ('Completed', 'Failed')),
  -- Shortened for display; the full SHA-256 is recovery_point_files.sha256.
  checksum text not null,
  file text,
  verified_at timestamptz,
  expires_at date not null
);

-- Where each point's file is and its full checksum. Written after the file is stored, never by hub_commit.
create table public.recovery_point_files (
  point_id text primary key,
  object_key text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes > 0),
  schema integer not null,
  created_at timestamptz not null default now()
);

create table public.restore_tests (
  id text primary key,
  ord integer not null,
  at timestamptz not null,
  point_id text not null,
  result text not null check (result in ('Passed', 'Failed')),
  minutes integer not null default 0,
  by text not null,
  notes text not null default ''
);

create table public.recovery_procedures (
  id text primary key,
  ord integer not null,
  title text not null,
  owner text not null,
  updated date not null,
  steps text[] not null default '{}'
);

-- ---------- Records ----------

create table public.evidence (
  id text primary key,
  ord integer not null,
  title text not null,
  unit_id text not null,
  program_id text,
  type text not null,
  period text not null,
  submitted date not null,
  submitted_by text not null,
  status text not null check (status in ('Validated', 'For review', 'Needs revision', 'Not yet submitted', 'Not applicable')),
  stage integer not null check (stage between 0 and 5),
  level integer not null check (level between 1 and 5),
  mapped_to text[] not null default '{}',
  sdgs integer[] not null default '{}',
  summary text not null default '',
  result text not null default '',
  beneficiaries text not null default '',
  files text[] not null default '{}'
);
create index evidence_unit_idx on public.evidence (unit_id);
create index evidence_status_idx on public.evidence (status);

create table public.evidence_comments (
  evidence_id text not null references public.evidence (id) on delete cascade deferrable initially deferred,
  ord integer not null,
  by text not null,
  role text not null,
  date date not null,
  text text not null,
  primary key (evidence_id, ord)
);

create table public.posts (
  id text primary key,
  ord integer not null,
  slug text not null unique,
  title text not null,
  subtitle text not null default '',
  sdgs integer[] not null default '{}',
  themes text[] not null default '{}',
  hashtags text[],
  layout text check (layout in ('cover', 'feature', 'split', 'essay', 'banner', 'gallery', 'magazine', 'alternate')),
  body text not null default '',
  status text not null check (status in ('Draft', 'In review', 'Published', 'Unpublished')),
  author_id text not null,
  unit_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null,
  published_at timestamptz
);
create index posts_status_idx on public.posts (status);

-- A post's thumbnail (role 'thumbnail') and photos, in order.
create table public.post_media (
  post_id text not null references public.posts (id) on delete cascade deferrable initially deferred,
  role text not null check (role in ('thumbnail', 'photo')),
  ord integer not null,
  src text not null,
  width integer not null default 0 check (width >= 0),
  height integer not null default 0 check (height >= 0),
  alt text not null default '',
  primary key (post_id, role, ord)
);

-- Publication state of the Hub's own impact stories, by slug.
create table public.story_states (
  slug text primary key,
  state text not null check (state in ('Published', 'In review', 'Draft', 'Withdrawn', 'Deleted'))
);

create table public.story_proposals (
  slug text primary key,
  ord integer not null,
  title text not null,
  unit_id text not null,
  by text not null,
  at timestamptz not null,
  sdgs integer[] not null default '{}',
  rankings text[] not null default '{}',
  challenge text not null default '',
  outcome text not null default ''
);

-- Reporting-period values entered in Submit data, by requirement id.
create table public.requirement_values (
  requirement_id text primary key,
  value text not null,
  source text not null default '',
  status text not null check (status in ('For review', 'Validated', 'Needs revision')),
  by text not null,
  at timestamptz not null
);

create table public.published_reports (
  id text primary key,
  ord integer not null,
  title text not null,
  at timestamptz not null,
  by text not null
);

create table public.innovations (
  id text primary key,
  ord integer not null,
  name text not null,
  unit_id text not null,
  by text not null,
  at timestamptz not null,
  category text not null
);

create table public.assistance_requests (
  id text primary key,
  ord integer not null,
  topic text not null,
  unit_id text not null,
  by text not null,
  at timestamptz not null,
  urgent boolean not null default false
);

-- The last number used for each kind of identifier (RP-0013, ACC-001, …). Never goes back, even across a restore.
create table public.id_counters (
  name text primary key,
  value integer not null check (value >= 0)
);

create table public.notices (
  id text primary key,
  ord integer not null,
  at timestamptz not null,
  -- An account id, "unit:<id>" for everyone in a unit, or "office" for Office reviewers.
  recipient text not null,
  text text not null,
  href text not null,
  template_id text
);
create index notices_recipient_idx on public.notices (recipient, at desc);

create table public.notice_reads (
  notice_id text not null references public.notices (id) on delete cascade deferrable initially deferred,
  account_id text not null,
  ord integer not null,
  primary key (notice_id, account_id)
);

-- ---------- Which tables the store is made of ----------

-- The tables hub_snapshot reads and hub_commit may write, parents before children. Nothing else is reachable
-- through those two functions.
create table public.hub_tables (
  name text primary key,
  position integer not null unique
);

insert into public.hub_tables (name, position) values
  ('org_units', 1), ('org_unit_history', 2), ('accounts', 3), ('org_unit_admins', 4), ('account_assignments', 5),
  ('account_transfers', 6), ('account_data_grants', 7), ('sessions', 8), ('sign_in_challenges', 9), ('sign_in_failures', 10),
  ('datasets', 11), ('dataset_versions', 12), ('quality_rules', 13), ('duplicate_decisions', 14), ('term_stewardship', 15),
  ('security_policy', 16), ('access_reviews', 17), ('access_review_items', 18), ('privacy_assessments', 19), ('subject_requests', 20),
  ('security_alerts', 21), ('secret_keys', 22), ('incidents', 23), ('incident_timeline', 24), ('workflows', 25),
  ('workflow_steps', 26), ('approval_requests', 27), ('approval_decisions', 28), ('ranking_bodies', 29), ('ranking_settings', 30),
  ('reporting_cycles', 31), ('academic_years', 32), ('reporting_periods', 33), ('notification_templates', 34), ('features', 35),
  ('feature_flags', 36), ('system_settings', 37), ('backup_settings', 38), ('recovery_points', 39), ('restore_tests', 40),
  ('recovery_procedures', 41), ('evidence', 42), ('evidence_comments', 43), ('posts', 44), ('post_media', 45),
  ('story_states', 46), ('story_proposals', 47), ('requirement_values', 48), ('published_reports', 49), ('innovations', 50),
  ('assistance_requests', 51), ('id_counters', 52), ('notices', 53), ('notice_reads', 54);

create function public.hub_table(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.hub_tables where name = p_name) then
    raise exception 'Not a governance store table: %', p_name using errcode = 'invalid_parameter_value';
  end if;
  return p_name;
end;
$$;

-- ---------- Reading ----------

-- Every store table, the version they were read at, the head of the audit chain and the audit entries since
-- p_recent_since, all from one snapshot (a stable function's queries share the calling statement's snapshot).
-- Null until the store is created.
create function public.hub_snapshot(p_recent_since timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_meta record;
  v_name text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
begin
  select schema, version into v_meta from public.hub_meta where id = 1;
  if not found then
    return null;
  end if;
  for v_name in select name from public.hub_tables order by position loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I as t', v_name) into v_rows;
    v_tables := v_tables || jsonb_build_object(v_name, v_rows);
  end loop;
  return jsonb_build_object(
    'schema', v_meta.schema,
    'version', v_meta.version,
    'tables', v_tables,
    'auditHead', (select jsonb_build_object('seq', a.seq, 'hash', a.hash) from public.audit_events as a order by a.seq desc limit 1),
    'recentAudit', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.seq), '[]'::jsonb)
      from public.audit_events as a
      where a.at >= p_recent_since
    )
  );
end;
$$;

-- ---------- Writing ----------

create function public.hub_columns(p_table text, p_keys boolean)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
  from pg_catalog.pg_attribute as a
  where a.attrelid = ('public.' || quote_ident(p_table))::regclass
    and a.attnum > 0
    and not a.attisdropped
    and (p_keys is null or p_keys = (a.attnum = any (
      select unnest(i.indkey) from pg_catalog.pg_index as i where i.indrelid = a.attrelid and i.indisprimary
    )));
$$;

-- Apply one commit: rows to delete and rows to insert or update, table by table, then the sealed audit entries,
-- then the next version. Returns that version, or null when the store moved on since p_version was read (the
-- caller reads again and retries). p_version 0 creates the store.
create function public.hub_commit(p_version bigint, p_schema integer, p_deletes jsonb, p_upserts jsonb, p_audit jsonb)
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
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) %s',
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
          (select string_agg('excluded.' || quote_ident(c), ', ') from unnest(v_rest) as c)
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

-- ---------- Access ----------

do $$
declare
  v_names text[];
  v_name text;
begin
  select array_agg(name) || array['hub_meta', 'hub_tables', 'audit_events', 'recovery_point_files'] into v_names from public.hub_tables;
  foreach v_name in array v_names loop
    execute format('alter table public.%I enable row level security', v_name);
    execute format('revoke all on table public.%I from anon, authenticated', v_name);
  end loop;
end;
$$;

-- The audit trail takes inserts only, even from the server's own role.
revoke update, delete, truncate on table public.audit_events from service_role;

revoke execute on function public.hub_snapshot(timestamptz) from public, anon, authenticated;
revoke execute on function public.hub_commit(bigint, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.hub_columns(text, boolean) from public, anon, authenticated;
revoke execute on function public.hub_table(text) from public, anon, authenticated;
revoke execute on function public.audit_events_append_only() from public, anon, authenticated;
revoke execute on function public.audit_events_continue_chain() from public, anon, authenticated;
grant execute on function public.hub_snapshot(timestamptz) to service_role;
grant execute on function public.hub_commit(bigint, integer, jsonb, jsonb, jsonb) to service_role;
