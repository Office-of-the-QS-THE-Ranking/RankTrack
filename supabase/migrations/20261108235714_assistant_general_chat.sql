-- The assistant now holds general conversations as well as answering from the Hub (user, 2026-11-09), so usage tells the
-- two apart: 'answered' cited the Hub, 'general' didn't. 'refused' stays for rows from before this change.
alter table public.assistant_usage drop constraint assistant_usage_outcome_check;
alter table public.assistant_usage add constraint assistant_usage_outcome_check check (outcome in ('answered', 'general', 'refused', 'stopped', 'error'));

-- The backup the Administrator asked for: runs on the Cloudflare key the index already uses.
update public.assistant_settings set fallback_model = '@cf/zai-org/glm-4.7-flash', updated_at = now() where id = 1;
