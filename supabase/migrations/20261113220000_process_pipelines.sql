-- Workflow Pipelines became Process Pipelines (user, 2026-11-13): /…/command-control/process-pipelines, with a
-- Workflow tab (the approval pipelines) and an Information tab (how data is extracted, transformed and loaded).
-- Links in people's notification inboxes follow, so nothing leans on the redirect in next.config.ts.
update public.notices set href = regexp_replace(href, '^/(admin|portal)/command-control/workflow-pipelines(?=$|[?#])', '/\1/command-control/process-pipelines')
  where href ~ '^/(admin|portal)/command-control/workflow-pipelines($|[?#])';

-- The migration test asks every row-changing migration to move the store's version, so running servers reload.
update public.hub_meta set version = version + 1;
