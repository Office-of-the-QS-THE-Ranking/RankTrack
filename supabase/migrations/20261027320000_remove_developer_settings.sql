-- The developer settings panel is gone (user, 2026-10-27): its saved access profile, and any test address it
-- let past the sign-in gate. hub_auth_allow stays for the request form's email check ("Email verification").
drop table if exists public.hub_dev_access;

delete from public.hub_auth_allow where reason = 'Developer settings';

comment on table public.hub_auth_allow is
  'Addresses the sign-in gate admits without a Hub account: only the request form''s email check, for a few minutes (src/lib/governance/server/email-verify.ts).';
