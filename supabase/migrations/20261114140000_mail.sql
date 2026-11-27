-- Automatic email (2026-11-14): receipts for access requests, submissions and form responses, and the Hub's
-- notifications to people and offices, sent through a provider the Office connects on System Configuration › Email.
-- src/lib/mail queues every message in mail_outbox once the change that caused it has committed, and a worker sends
-- what is due: straight after queueing, when the Office opens the Email tab, and in the daily round. Like the other
-- server-only tables, nothing but the Hub's secret key reaches these, and servers never cache them, so they sit
-- outside the governance store.

create table public.mail_settings (
  id integer primary key default 1 check (id = 1),
  -- The master switch. Off: messages are recorded as "not sent" and never go out later.
  sending boolean not null default false,
  provider text check (provider in ('resend', 'brevo', 'sendgrid', 'smtp')),
  -- The provider's API key, or the SMTP password: AES-256-GCM, opened only on the server (lib/mail/server/settings.ts).
  secret_sealed text,
  secret_hint text check (length(secret_hint) <= 8),
  smtp_host text check (length(smtp_host) <= 253),
  smtp_port integer check (smtp_port in (25, 465, 587, 2525)),
  smtp_user text check (length(smtp_user) <= 254),
  from_name text not null default 'PRESTIGE Portal' check (length(from_name) between 1 and 80),
  from_email text check (length(from_email) <= 254),
  reply_to text check (length(reply_to) <= 254),
  -- disconnected: no key · ok: the last message was accepted · failing: the provider refused the key or the sender
  status text not null default 'disconnected' check (status in ('disconnected', 'ok', 'failing')),
  status_at timestamptz,
  last_error text check (length(last_error) <= 300),
  connected_by text,
  connected_at timestamptz,
  -- Messages one address may be sent in an hour, receipts and account notices aside; more are recorded as not sent.
  hourly_limit integer not null default 30 check (hourly_limit between 1 and 1000),
  -- Messages carry names and reasons (RA 10173): they are deleted this many days after they were queued.
  retention_days integer not null default 90 check (retention_days between 7 and 365),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.mail_settings (id) values (1);

create table public.mail_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- notification_templates.id, or 'test' for a test message. No foreign key: the queue outlives a template.
  template_id text not null check (length(template_id) between 1 and 60),
  -- The template's name when the message was queued, for the Email tab's list.
  label text not null check (length(label) between 1 and 80),
  to_email text not null check (length(to_email) between 3 and 254),
  to_name text check (length(to_name) <= 160),
  -- accounts.id when the message goes to someone with an account.
  account_id text,
  subject text not null check (length(subject) between 1 and 200),
  html text not null,
  body_text text not null,
  -- queued: waiting, or waiting to be tried again · sending: a worker holds it · sent · failed: given up ·
  -- skipped: never sent (sending off, not connected, the hourly limit)
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider text,
  -- The provider's own id for the message, to look it up in their dashboard.
  provider_ref text check (length(provider_ref) <= 200),
  last_error text check (length(last_error) <= 300),
  -- Receipts and account notices: never held back by the hourly limit.
  required boolean not null default false,
  -- The same event queued twice (a retried transaction, the daily round run twice) is one message.
  dedupe_key text check (length(dedupe_key) <= 200)
);
create unique index mail_outbox_dedupe on public.mail_outbox (dedupe_key) where dedupe_key is not null;
create index mail_outbox_due on public.mail_outbox (next_attempt_at) where status in ('queued', 'sending');
create index mail_outbox_created on public.mail_outbox (created_at desc);
create index mail_outbox_recipient on public.mail_outbox (to_email, created_at desc);

alter table public.mail_settings enable row level security;
alter table public.mail_outbox enable row level security;
revoke all on table public.mail_settings, public.mail_outbox from anon, authenticated;

-- Queue messages. `p_hold` is why nothing may go out right now (sending is off, or no provider is connected): the
-- messages are then recorded as skipped. Otherwise each is queued unless its address already had its hour's worth.
-- A message whose dedupe key is already there is left out. Returns how many were queued to send.
create function public.mail_enqueue(p_rows jsonb, p_hold text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer;
  v_row record;
  v_recent integer;
  v_status text;
  v_note text;
  v_queued integer := 0;
  v_added integer;
begin
  select hourly_limit into v_limit from public.mail_settings where id = 1;
  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(template_id text, label text, to_email text, to_name text, account_id text, subject text,
                                                  html text, body_text text, required boolean, dedupe_key text)
  loop
    v_status := 'queued';
    v_note := null;
    if p_hold is not null then
      v_status := 'skipped';
      v_note := left(p_hold, 300);
    elsif not coalesce(v_row.required, false) then
      select count(*) into v_recent from public.mail_outbox o
      where o.to_email = lower(v_row.to_email) and o.created_at > now() - interval '1 hour' and o.status in ('queued', 'sending', 'sent');
      if v_recent >= coalesce(v_limit, 30) then
        v_status := 'skipped';
        v_note := 'This address reached its hourly limit.';
      end if;
    end if;
    insert into public.mail_outbox (template_id, label, to_email, to_name, account_id, subject, html, body_text, status, last_error, required, dedupe_key)
    values (left(v_row.template_id, 60), left(v_row.label, 80), lower(left(v_row.to_email, 254)), left(v_row.to_name, 160), v_row.account_id,
            left(v_row.subject, 200), v_row.html, v_row.body_text, v_status, v_note, coalesce(v_row.required, false), left(v_row.dedupe_key, 200))
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_added = row_count;
    if v_added > 0 and v_status = 'queued' then
      v_queued := v_queued + 1;
    end if;
  end loop;
  return v_queued;
end;
$$;

-- Take up to p_limit messages that are due, so two workers never send the same one: each is marked as being sent and
-- its attempt counted. A message a worker took ten minutes ago and never finished (the server stopped) is due again.
create function public.mail_claim(p_limit integer default 20)
returns setof public.mail_outbox
language sql
set search_path = ''
as $$
  update public.mail_outbox o
  set status = 'sending', locked_at = now(), attempts = o.attempts + 1
  where o.id in (
    select d.id from public.mail_outbox d
    where (d.status = 'queued' and d.next_attempt_at <= now())
       or (d.status = 'sending' and d.locked_at < now() - interval '10 minutes')
    order by d.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  returning o.*;
$$;

-- Give back messages a worker took but never tried (the provider refused the key, so it stopped): they wait again,
-- and the attempt that never happened isn't counted.
create function public.mail_release(p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.mail_outbox
  set status = 'queued', locked_at = null, attempts = greatest(0, attempts - 1)
  where id = any(p_ids) and status = 'sending';
$$;

-- The Email tab's figures: how the last p_days days of messages ended, and how many were sent each day (Manila days).
create function public.mail_summary(p_days integer default 30)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with recent as (
    select status, (created_at at time zone 'Asia/Manila')::date as day
    from public.mail_outbox
    where created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent where status = 'sent'),
    'waiting', (select count(*) from recent where status in ('queued', 'sending')),
    'failed', (select count(*) from recent where status = 'failed'),
    'skipped', (select count(*) from recent where status = 'skipped'),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'sent', d.sent, 'other', d.other) order by d.day)
      from (
        select day, count(*) filter (where status = 'sent') as sent, count(*) filter (where status <> 'sent') as other
        from recent group by day
      ) d
    ), '[]'::jsonb)
  );
$$;

-- Delete messages older than the retention period. Returns how many went.
create function public.mail_purge()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
  v_gone integer;
begin
  select retention_days into v_days from public.mail_settings where id = 1;
  delete from public.mail_outbox where created_at < now() - make_interval(days => coalesce(v_days, 90));
  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

revoke all on function public.mail_enqueue(jsonb, text), public.mail_claim(integer), public.mail_release(uuid[]), public.mail_summary(integer), public.mail_purge() from public, anon, authenticated;
grant execute on function public.mail_enqueue(jsonb, text), public.mail_claim(integer), public.mail_release(uuid[]), public.mail_summary(integer), public.mail_purge() to service_role;

-- ---------- Messages ----------

-- The receipts and the answers to an access request, which go to an address rather than an account.
insert into public.notification_templates (id, ord, name, event, channel, subject, body, enabled)
select v.id, (select coalesce(max(ord), 0) from public.notification_templates) + v.n, v.name, v.event, 'Email', v.subject, v.body, true
from (values
  (1, 'tpl-access-received', 'Access request received', 'Someone sends the Request access form',
   'We received your access request',
   '{name}, your request for access to the PRESTIGE Portal is with the Office of QS/THE Rankings. Requests are reviewed within 3 to 5 working days.' || E'\n\n' || 'Keep your reference code. You need it, with this email address, to track your request.'),
  (2, 'tpl-access-approved', 'Access request approved', 'An access request is approved',
   'Your access request was approved',
   '{name}, your request {reference} was approved. You can now sign in to the PRESTIGE Portal with {email} through Google.'),
  (3, 'tpl-access-declined', 'Access request declined', 'An access request is declined',
   'About your access request',
   '{name}, your request {reference} was not approved.' || E'\n\n' || 'If you think this is a mistake, reply to this email.'),
  (4, 'tpl-receipt', 'Submission received', 'A unit submits evidence',
   'Received: {title}',
   '{name}, the Office received “{title}” from {unit}. A reviewer will check it, and you will be told the result.'),
  (5, 'tpl-form-receipt', 'Form response received', 'Someone signed in sends a form',
   'Received: {form}',
   'Your response to {form} was received. Keep the reference code for your records.')
) as v(n, id, name, event, subject, body)
on conflict (id) do nothing;

-- Which messages also go out by email now that the Hub can send it. Only those still on the channel they shipped with.
update public.notification_templates set channel = 'Email and in-app'
where channel = 'In-app' and id in ('tpl-submitted', 'tpl-data-request', 'tpl-data-reminder', 'tpl-data-escalated', 'tpl-data-returned');

-- The deadline reminder goes to the Office, which the daily round now sends; units have their own data reminders.
-- {days} now carries its own word ("7 days", "1 day"). Only the wording the Hub shipped with is replaced.
update public.notification_templates
set body = '{ranking} closes in {days}, on {date}.'
where id = 'tpl-deadline' and body = '{ranking} closes in {days} days. {open} requirements are still open for {unit}.';
update public.notification_templates
set subject = '{ranking} closes in {days}'
where id = 'tpl-deadline' and subject = '{ranking} closes in {days} days';

-- Email is on for everyone unless they switch it off (account window › Notifications). Until now the switch was
-- marked "Coming soon" and nothing was sent, so no choice made with it meant anything.
alter table public.accounts alter column pref_notify_email set default true;
update public.accounts set pref_notify_email = true where not pref_notify_email;

-- Running servers hold the store in memory: move its version so they read the new messages and preferences.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
