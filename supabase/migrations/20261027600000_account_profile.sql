-- Who a person is, as their invitation or approved access request gave it: last, first and middle name,
-- salutation, affiliation (and whether it is a listed one), accreditation organization and website. The
-- invite drawer asks the Request access form's questions, and the account keeps the answers. Birthdays never
-- reach the account; they stay with the request, which housekeeping clears.
alter table public.accounts add column if not exists profile jsonb check (profile is null or jsonb_typeof(profile) = 'object');
