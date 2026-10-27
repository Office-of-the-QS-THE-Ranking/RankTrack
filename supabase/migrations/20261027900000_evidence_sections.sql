-- Evidence in four parts: an Overview with its background, the narrative (summary), the evidence itself
-- (files with what each is, public links, how the result was verified) and the references it cites.

-- Why the work was needed, in a few sentences.
alter table public.evidence add column background text not null default '';
-- How the result was checked: a survey, records, an audit.
alter table public.evidence add column verified_by text not null default '';
-- Public pages that show the work: [{ "url", "label" }]. Their addresses stay in `files` for older views.
alter table public.evidence add column links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array');
-- Publications, news and documents cited: [{ "title", "source", "url" }]. ("references" is a reserved word.)
alter table public.evidence add column citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array');
