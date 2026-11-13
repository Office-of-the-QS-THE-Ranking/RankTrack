-- Firewall › Settings › Run on development servers (2026-11-13): development servers share the production database,
-- so the firewall stays off on them unless the Office switches this on. Their visits are then checked and recorded
-- like any other (the host column shows localhost). HUB_FIREWALL_DEV=1 still forces it on for one server.
alter table public.firewall_settings add column dev_enabled boolean not null default false;
