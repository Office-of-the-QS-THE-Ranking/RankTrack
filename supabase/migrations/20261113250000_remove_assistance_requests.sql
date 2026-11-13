-- Request assistance is gone (user, 2026-11-13): the portal page, its command, the feature switch and the store
-- table. Past assistance.request audit events stay, since audit_events is append-only.
delete from public.hub_tables where name = 'assistance_requests';
drop table if exists public.assistance_requests;

delete from public.features where id = 'assistance';
delete from public.id_counters where name = 'assistance';

-- Running servers reload the store without the table and the switch.
update public.hub_meta set version = version + 1;
