-- About the Office becomes editable from the Knowledge Center (2026-11-13). The sidebar's About the Office page is
-- gone; the Office edits Purpose, Vision and mission, Deliverables, Team, Reporting and coordination, Policies,
-- Contact and FAQs in the Knowledge Center's About tab, and the public /about page reads the same rows. The ranking
-- portfolio is no longer kept here: the public page lists the rankings System Configuration tracks and publishes.

alter table public.office_profile add column purpose text not null default '';

alter table public.office_entries drop constraint office_entries_section_check;
alter table public.office_entries add constraint office_entries_section_check
  check (section in ('function', 'objective', 'deliverable', 'workplan', 'team', 'portfolio', 'coordination', 'policy', 'faq'));
-- Policies: the anchor the footers and menus link to (#privacy, #accessibility, #disclaimer).
alter table public.office_entries add column anchor text check (anchor is null or anchor ~ '^[a-z0-9-]{1,40}$');

update public.office_profile set purpose =
  'The Office addresses current and emerging challenges in UST’s international ranking performance, strengthening the University’s competitiveness and appeal on the global stage.'
where id = 1;

insert into public.office_entries (section, position, title, body, anchor) values
  ('coordination', 1, 'Office of the Rector', 'The Office of QS/THE Rankings operates under the Office of the Rector.', null),
  ('coordination', 2, 'Director', 'Engr. Nestor R. Ong heads the Office. The Office Clerk, Office Assistant and Ranking Specialists report directly to the Director.', null),
  ('coordination', 3, 'Functional supervision', 'Engr. Rodablas P. Nicolas provides functional or indirect supervision to the Ranking Specialists.', null),
  ('coordination', 4, 'Academic and support units', 'Coordinate with the Office to collect and consolidate data and implement action plans.', null),
  ('coordination', 5, 'Office of International Relations & Programs', 'Works with the Office on data collection and stakeholder coordination.', null),
  ('policy', 1, 'Data privacy statement', 'Personal data in submissions is processed under the Data Privacy Act of 2012 (Republic Act No. 10173). Only approved data, documents and narratives appear on this site; confidential evidence stays in the internal workspace, where every change is logged.', 'privacy'),
  ('policy', 2, 'Accessibility', 'This site aims to meet WCAG 2.2 AA: keyboard access throughout, visible focus, text alternatives and tables beside every chart, and results stated in words, never by colour alone. Report a barrier to the Office by email.', 'accessibility'),
  ('policy', 3, 'Methodology disclaimer', 'Results belong to the ranking bodies and follow their published methods. The Office reports them as published and does not alter them. Figures for the current cycle that are not yet published are placeholders for review.', 'disclaimer'),
  ('faq', 1, 'Can one document count for several rankings?', 'Yes. Submit it once; the Office maps it to every indicator it supports and credits your unit each time.', null),
  ('faq', 2, 'What makes evidence acceptable?', 'It names the reporting period, the measurable result, who benefited and how that was verified, and links to an approved document.', null),
  ('faq', 3, 'Why was a submission returned?', 'Most returns are for the wrong reporting period, a missing approval date or a link that needs a login.', null),
  ('faq', 4, 'Who confirms official figures?', 'The data owner for each indicator. The Office checks consistency but does not change official values.', null),
  ('faq', 5, 'When will a unit know where its evidence counts?', 'As soon as a reviewer accepts it. The unit''s dashboard lists every ranking and indicator it supports.', null)
on conflict (section, position) do nothing;

-- Saves the profile fields given and replaces the sections given, in one transaction. Called by the Hub's server
-- (service role) after it has checked the editor's role; nobody else may call it.
create or replace function public.office_save(profile jsonb, sections jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  if profile is not null and profile <> '{}'::jsonb then
    update public.office_profile set
      name = coalesce(profile->>'name', name),
      reports_to = coalesce(profile->>'reports_to', reports_to),
      location = coalesce(profile->>'location', location),
      landmark = coalesce(profile->>'landmark', landmark),
      phone = coalesce(profile->>'phone', phone),
      email = coalesce(profile->>'email', email),
      street = coalesce(profile->>'street', street),
      city = coalesce(profile->>'city', city),
      vision = coalesce(profile->>'vision', vision),
      mission = coalesce(profile->>'mission', mission),
      summary = coalesce(profile->>'summary', summary),
      purpose = coalesce(profile->>'purpose', purpose)
    where id = 1;
  end if;
  if sections is not null then
    for s in select jsonb_object_keys(sections) loop
      if s not in ('function', 'objective', 'deliverable', 'workplan', 'team', 'coordination', 'policy', 'faq') then
        raise exception 'Unknown section %', s;
      end if;
      delete from public.office_entries where section = s;
      insert into public.office_entries (section, position, title, body, person, owners, timing, href, anchor)
      select s, (e.ord)::int, e.v->>'title', coalesce(e.v->>'body', ''), nullif(e.v->>'person', ''), nullif(e.v->>'owners', ''),
             nullif(e.v->>'timing', ''), nullif(e.v->>'href', ''), nullif(e.v->>'anchor', '')
      from jsonb_array_elements(sections->s) with ordinality as e(v, ord);
    end loop;
  end if;
end;
$$;

revoke all on function public.office_save(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.office_save(jsonb, jsonb) to service_role;

-- The migration test asks every row-changing migration to move the store's version, so running servers reload.
update public.hub_meta set version = version + 1;
