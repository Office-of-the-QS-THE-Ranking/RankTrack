/*
 * Prints the SQL that seeds a form template as a live form in the forms table, for a migration, so the live form
 * starts exactly as its template (src/lib/forms/templates) and passes the same schema check the Forms Builder's
 * saves will. With --update, the SQL that brings that live form's questions up to the template instead.
 * Usage: npx tsx scripts/forms/seed-sql.mts <id> <code> [--update] > seed.sql
 */
import { readSchema } from "../../src/lib/forms/schema";
import { COMDEV_PROPOSAL } from "../../src/lib/forms/templates/comdev-proposal";

const args = process.argv.slice(2);
const update = args.includes("--update");
const [id = "FM-0001", code = "comdev-proposal"] = args.filter((a) => !a.startsWith("--"));
const t = COMDEV_PROPOSAL;
const schema = readSchema(t.schema);
if (typeof schema === "string") throw new Error(`The template doesn't pass the schema check: ${schema}`);
/** JSON with keys sorted and undefined left out, to compare what two schemas say rather than how they're ordered. */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
if (canonical(schema) !== canonical(t.schema)) {
  const a = canonical(schema);
  const b = canonical(t.schema);
  const at = [...a].findIndex((c, i) => c !== b[i]);
  throw new Error(`The schema check changed the template near …${b.slice(Math.max(0, at - 120), at + 80)}… → …${a.slice(Math.max(0, at - 120), at + 80)}…`);
}

const text = (s: string | undefined) => (s === undefined ? "null" : `'${s.replace(/'/g, "''")}'`);
const json = JSON.stringify(schema, null, 2);
if (json.includes("$form$")) throw new Error("The schema holds the quote marker.");

if (update) {
  process.stdout.write(`update public.forms
set schema = $form$${json}$form$::jsonb,
  updated_at = now(),
  updated_by = 'system'
where id = ${text(id)} and code = ${text(code)};
`);
  process.exit(0);
}

process.stdout.write(`insert into public.forms (id, ord, unit_id, code, prefix, title, description, kind, reference, issuer_id, status, closes_on, schema, created_by, created_at, updated_at, updated_by)
values (
  ${text(id)}, 0, null, ${text(code)}, ${text(t.prefix)},
  ${text(t.title)},
  ${text(t.description)},
  ${text(t.kind)}, ${text(t.reference)}, ${text(t.issuerId)}, 'open', null,
  $form$${json}$form$::jsonb,
  'system', now(), now(), 'system'
);
`);
