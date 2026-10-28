-- Saved role overrides use the existing service-only settings and transactional hub_commit path.
alter table public.system_settings
  add column if not exists role_permissions jsonb default '{}'::jsonb
  check (jsonb_typeof(role_permissions) = 'object');
