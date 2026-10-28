"use server";

/*
 * Finding a person named on a digital form in the University directory (server/people-directory.ts): as the
 * responder types a contact's, officer's or emergency contact's last and first names, matches offer the person's
 * University email and photo. Only a responder signed in with a University account (Google on the form's page, or
 * the Hub) may look anyone up, so the form's public link doesn't list the University's people; a few lookups a
 * minute is plenty for filling in a form.
 */
import { LOOKUP_MIN, lookupKey, type PersonMatch } from "@/lib/forms/people-lookup";
import { FORM_CODE } from "@/lib/forms/kinds";
import { fieldMap, peopleDetails } from "@/lib/forms/modules";
import { formWho } from "@/lib/governance/server/form-copies";
import { takesResponses } from "@/lib/governance/server/forms";
import { allow, clientKey } from "@/lib/governance/server/limits";
import { findInDirectory, mayLookUp, searchInDirectory } from "@/lib/governance/server/people-directory";
import { readState } from "@/lib/governance/server/store";

type Found = { ok: true; people: PersonMatch[] } | { ok: false };

const NONE: Found = { ok: false };
const nameOf = (v: unknown) => (typeof v === "string" && v.length <= 80 ? lookupKey(v) : "");

export async function findPeople(input: { code: string; field: string; lastName: string; firstName: string }): Promise<Found> {
  const code = typeof input?.code === "string" && FORM_CODE.test(input.code) ? input.code : "";
  const last = nameOf(input?.lastName);
  const first = nameOf(input?.firstName);
  if (!code || last.length < LOOKUP_MIN || first.length < LOOKUP_MIN) return NONE;

  const who = await formWho();
  const state = await readState();
  const domains = state.security.sso.domains.map((d) => d.toLowerCase());
  if (!who || !mayLookUp(state, who)) return NONE;

  const form = state.records.forms.find((f) => f.code === code);
  if (!form || !(takesResponses(form) || who.via === "hub")) return NONE;
  const spec = fieldMap(form.schema.sections).get(String(input.field));
  if (spec?.type !== "people" || !peopleDetails(spec).includes("email")) return NONE;
  const domain = (spec.domain ?? domains[0] ?? "").toLowerCase();
  if (!domains.includes(domain)) return NONE;

  if (!(await allow(`people:${who.email}`, 60, 40)) || !(await allow(`people:${await clientKey()}`, 60, 80))) return NONE;
  return { ok: true, people: await findInDirectory(state, last, first, domain, who.email) };
}

/**
 * People to add to a private team copy (lib/forms/copies.ts), as its owner types a name or email: University
 * accounts only, for an owner signed in with one, on a form whose link builds copies.
 */
export async function findCopyPeople(input: { code: string; text: string }): Promise<Found> {
  const code = typeof input?.code === "string" && FORM_CODE.test(input.code) ? input.code : "";
  const text = typeof input?.text === "string" && input.text.length <= 80 ? input.text.trim() : "";
  if (!code || text.replace(/[^\p{L}]/gu, "").length < LOOKUP_MIN) return NONE;

  const who = await formWho();
  const state = await readState();
  if (!who || !mayLookUp(state, who)) return NONE;
  const form = state.records.forms.find((f) => f.code === code && f.copies);
  if (!form || !(takesResponses(form) || who.via === "hub")) return NONE;
  const domain = who.email.split("@")[1]!.toLowerCase();

  if (!(await allow(`people:${who.email}`, 60, 40)) || !(await allow(`people:${await clientKey()}`, 60, 80))) return NONE;
  const people = await searchInDirectory(state, text, domain, who.email, 5);
  return { ok: true, people: people.filter((p) => p.email !== who.email.toLowerCase()) };
}
