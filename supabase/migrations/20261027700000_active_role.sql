-- One role at a time: someone who holds several roles acts in the one they last switched to (account window,
-- Roles & access), and only its permissions count. Null means their highest role. It names one of the account's
-- own assignments; no foreign key, because an assignment that ends or is removed simply falls back to the highest.
alter table public.accounts add column if not exists active_assignment text;
