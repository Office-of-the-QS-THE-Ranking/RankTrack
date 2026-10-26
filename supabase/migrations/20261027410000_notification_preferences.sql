-- People choose their own notifications (account window, Notifications): email on or off, and which kinds
-- reach them in the Hub and by email. Stored as the kind:channel pairs switched off, e.g. 'reviews:email'.
alter table public.accounts
  add column if not exists pref_notify_email boolean not null default false,
  add column if not exists pref_notify_off text[] not null default '{}';
