-- The ComDev Project Proposal no longer asks "Transportation paid through" (5.2) once for the whole budget: each
-- transport line in the budget already asks Cash or Purchasing (OVRF). Only that question is taken out of the live
-- form, so anything else edited in the Forms Builder stays as it is (the template, src/lib/forms/templates/
-- comdev-proposal.ts, no longer has it either).

update public.forms f
set schema = jsonb_set(f.schema, '{sections}', (
    select jsonb_agg(
      case when s ? 'fields'
        then jsonb_set(s, '{fields}', coalesce((select jsonb_agg(q order by i) from jsonb_array_elements(s->'fields') with ordinality as x(q, i) where q->>'id' <> 'transportPay'), '[]'::jsonb))
        else s end
      order by n)
    from jsonb_array_elements(f.schema->'sections') with ordinality as y(s, n))),
  updated_at = now(),
  updated_by = 'system'
where f.id = 'FM-0001' and f.code = 'comdev-proposal'
  and jsonb_path_exists(f.schema, '$.sections[*].fields[*] ? (@.id == "transportPay")');

-- Servers reload the store when its version moves.
update public.hub_meta set version = version + 1, updated_at = now() where id = 1;
