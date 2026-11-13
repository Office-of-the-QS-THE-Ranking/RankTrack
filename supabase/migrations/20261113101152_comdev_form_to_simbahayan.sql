-- The Community Development Project Proposal (FM-0001) belongs to UST SIMBAHAYAN, whose ComDev coordinators and
-- Director sign it off (user, 2026-11-13). It was held by the Office with SIMBAHAYAN only named as issuer, so it never
-- showed in SIMBAHAYAN's Digital Forms. Units may now hold proposals and terminal reports (lib/forms/access.ts).
update public.forms set unit_id = 'simbahayan'
where id = 'FM-0001' and unit_id is null and owner_id is null
  and exists (select 1 from public.org_units where id = 'simbahayan');

-- Running servers reload the store.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
