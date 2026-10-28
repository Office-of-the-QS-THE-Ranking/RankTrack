-- Searching the University's Google Workspace directory as the person filling in a form
-- (src/lib/governance/server/google-directory.ts). Google sign-in asks for directory.readonly, the access Gmail
-- uses to suggest University names, and the Hub keeps that person's Google tokens here, encrypted (AES-256-GCM)
-- by the server before they arrive. Only the server's secret key reads or writes them.

create table public.google_directory_tokens (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 254),
  -- Each is iv.tag.ciphertext, base64url.
  access_token text not null check (char_length(access_token) <= 8192),
  refresh_token text check (char_length(refresh_token) <= 8192),
  expires_at timestamptz not null,
  updated_at timestamptz not null default date_trunc('milliseconds', now())
);

alter table public.google_directory_tokens enable row level security;
revoke all on table public.google_directory_tokens from anon, authenticated;
