-- The portal is now the PRESTIGE Portal (Performance & Rankings Evaluator of Sustainability, Transparency, &
-- Intelligence for Global Excellence), user 2026-11-13. The invitation email's subject still named the old Hub.
update public.notification_templates
  set subject = regexp_replace(subject, '(UST )?(Global )?Rankings and Impact Hub', 'PRESTIGE Portal', 'g')
  where subject ~ 'Rankings and Impact Hub';

-- The migration test asks every row-changing migration to move the store's version, so running servers reload.
update public.hub_meta set version = version + 1;
