-- Templates & Forms: each file says what it is (template, form, survey, checklist, guide). Files on other shelves
-- have none. Existing files there read as templates. Nothing else changes.

alter table public.workspace_files
  add column kind text check (kind in ('template', 'form', 'survey', 'checklist', 'guide'));

update public.workspace_files set kind = 'template' where shelf = 'templates' and kind is null;

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
