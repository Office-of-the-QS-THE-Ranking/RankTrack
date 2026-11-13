-- Renamed tabs (user, 2026-11-13): Administration became Command & Control (/…/command-control), its Approval
-- Workflows became Workflow Pipelines (/…/command-control/workflow-pipelines), Contributions became Unit Submissions
-- (/admin/unit-submissions), and the Knowledge Center became the Knowledge Base (/knowledge-base, /admin/knowledge-base,
-- /portal/knowledge-base). Stored names and links follow, so nothing leans on the redirects in next.config.ts.

-- The public section's switch in System Configuration.
update public.features set name = 'Knowledge Base' where id = 'public-knowledge' and name = 'Knowledge Center';

-- Links in people's notification inboxes.
update public.notices set href = regexp_replace(href, '^/(admin|portal)/administration/workflows(?=$|[?#])', '/\1/command-control/workflow-pipelines')
  where href ~ '^/(admin|portal)/administration/workflows($|[?#])';
update public.notices set href = regexp_replace(href, '^/(admin|portal)/administration(?=$|[/?#])', '/\1/command-control')
  where href ~ '^/(admin|portal)/administration($|[/?#])';
update public.notices set href = regexp_replace(href, '^/admin/contributions(?=$|[?#])', '/admin/unit-submissions')
  where href ~ '^/admin/contributions($|[?#])';
update public.notices set href = '/admin/unit-submissions?tab=units' where href = '/admin/units';
update public.notices set href = regexp_replace(href, '^/admin/reports(?=$|[?#])', '/admin/workspace/build-a-report')
  where href ~ '^/admin/reports($|[?#])';
update public.notices set href = regexp_replace(href, '^/(admin|portal)/(workspace/)?knowledge(?=$|[?#])', '/\1/knowledge-base')
  where href ~ '^/(admin|portal)/(workspace/)?knowledge($|[?#])';

-- The assistant's index: where each passage links, and its title. Its ids stay, so the next sync matches them.
update public.assistant_chunks set href = regexp_replace(href, '^/knowledge(?=$|[?#])', '/knowledge-base') where href ~ '^/knowledge($|[?#])';
update public.assistant_chunks set href = 'workspace:/knowledge-base' where href = 'workspace:/knowledge';
update public.assistant_chunks set title = replace(title, 'Knowledge Center', 'Knowledge Base') where title like '%Knowledge Center%';

-- The migration test asks every row-changing migration to move the store's version, so running servers reload.
update public.hub_meta set version = version + 1;
