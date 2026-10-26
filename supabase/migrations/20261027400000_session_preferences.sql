-- People choose their own session behaviour (account window, Settings, and "Keep me signed in" at sign-in):
-- a shorter idle sign-out than the policy, or staying signed in. The policy's longest session always applies.
alter table public.accounts
  add column if not exists pref_idle_minutes integer check (pref_idle_minutes between 5 and 240),
  add column if not exists pref_stay_signed_in boolean not null default false;
