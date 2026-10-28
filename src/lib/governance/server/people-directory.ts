import "server-only";

/*
 * The University directory a digital form looks people up in (actions/form-people.ts). Two sources, merged by
 * email: the Hub's own accounts (everyone invited or approved, with the Google photo of their last sign-in), and
 * the University's Google Workspace directory, searched as the person asking with the access their Google
 * sign-in granted (server/google-directory.ts): the names, emails and photos they already see in Gmail.
 */
import { LOOKUP_MAX, lookupKey, personPhoto, type PersonMatch } from "@/lib/forms/people-lookup";
import type { FormWho } from "@/lib/governance/hub-types";
import type { GovernanceState } from "@/lib/governance/types";
import { searchDirectoryAs, searchDirectoryTextAs } from "./google-directory";

/** Whether someone signed in to a form may look people up: only with a University account. */
export const mayLookUp = (state: GovernanceState, who: FormWho | null) => !!who && state.security.sso.domains.some((d) => d.toLowerCase() === who.email.split("@")[1]);

/**
 * People at `domain` whose last name starts with `last` and first name with `first`, Hub accounts first; with
 * `asEmail`, the Workspace directory too, searched as that person.
 */
export async function findInDirectory(state: GovernanceState, last: string, first: string, domain: string, asEmail?: string): Promise<PersonMatch[]> {
  const found = new Map<string, PersonMatch>();
  for (const m of [...hubMatches(state, last, first, domain), ...(asEmail ? await searchDirectoryAs(asEmail, last, first, domain) : [])]) {
    const had = found.get(m.email);
    if (!had) found.set(m.email, m);
    else if (!had.photo && m.photo) had.photo = m.photo;
  }
  return [...found.values()].slice(0, LOOKUP_MAX);
}

/**
 * People at `domain` whose name words or email start with what's typed in one box ("dela cruz", "juan.delacruz"),
 * Hub accounts first, then the Workspace directory searched as `asEmail`.
 */
export async function searchInDirectory(state: GovernanceState, text: string, domain: string, asEmail: string, max = LOOKUP_MAX): Promise<PersonMatch[]> {
  const local = text.toLowerCase().split("@")[0]!.trim();
  const words = lookupKey(local.replace(/[._]+/g, " ")).split(" ").filter(Boolean);
  if (!words.length) return [];
  const hub = state.accounts
    .filter((a) => !a.external && (a.status === "Active" || a.status === "Pending Invitation") && a.email.toLowerCase().endsWith(`@${domain}`))
    .filter((a) => {
      const n = namesOf(a);
      const name = `${n.first} ${n.last}`.split(" ").filter(Boolean);
      return a.email.toLowerCase().startsWith(local) || words.every((w) => name.some((x) => x.startsWith(w)));
    })
    .map((a) => ({ name: a.profile ? [a.profile.firstName, a.profile.middleName, a.profile.lastName].filter(Boolean).join(" ") : a.name, email: a.email.toLowerCase(), photo: personPhoto(a.avatar) }));
  const found = new Map<string, PersonMatch>();
  for (const m of [...hub, ...(await searchDirectoryTextAs(asEmail, words.join(" "), domain))]) {
    const had = found.get(m.email);
    if (!had) found.set(m.email, m);
    else if (!had.photo && m.photo) had.photo = m.photo;
  }
  return [...found.values()].slice(0, max);
}

/**
 * Names and photos of the people with these emails: Hub accounts first, then, for anyone still missing a name or
 * photo, the Workspace directory searched by their email as `asEmail`. People found in neither are left out.
 */
export async function peopleByEmail(state: GovernanceState, emails: string[], asEmail?: string): Promise<Record<string, { name: string; photo?: string }>> {
  const want = new Set(emails.map((e) => e.toLowerCase()));
  const found: Record<string, { name: string; photo?: string }> = {};
  for (const a of state.accounts) {
    const email = a.email.toLowerCase();
    if (!want.has(email)) continue;
    const photo = personPhoto(a.avatar);
    found[email] = { name: a.profile ? [a.profile.firstName, a.profile.middleName, a.profile.lastName].filter(Boolean).join(" ") : a.name, ...(photo && { photo }) };
  }
  const missing = asEmail ? [...want].filter((e) => !found[e]?.name || !found[e]?.photo) : [];
  await Promise.all(
    missing.map(async (email) => {
      const m = (await searchDirectoryTextAs(asEmail!, email, email.split("@")[1]!)).find((p) => p.email === email);
      if (!m) return;
      const had = found[email];
      found[email] = { name: had?.name || m.name, ...((had?.photo ?? m.photo) && { photo: had?.photo ?? m.photo }) };
    }),
  );
  return found;
}

/** Last and first names; parts from the profile, or split from the whole name (last word is the last name). */
function namesOf(a: GovernanceState["accounts"][number]) {
  if (a.profile?.lastName) return { last: lookupKey(a.profile.lastName), first: lookupKey(a.profile.firstName) };
  const words = lookupKey(a.name).split(" ");
  return { last: words.at(-1) ?? "", first: words.slice(0, -1).join(" ") };
}

function hubMatches(state: GovernanceState, last: string, first: string, domain: string): PersonMatch[] {
  const L = lookupKey(last);
  const F = lookupKey(first);
  return state.accounts
    .filter((a) => !a.external && (a.status === "Active" || a.status === "Pending Invitation") && a.email.toLowerCase().endsWith(`@${domain}`))
    .filter((a) => {
      const n = namesOf(a);
      return n.last.startsWith(L) && n.first.startsWith(F);
    })
    .map((a) => ({ name: a.profile ? [a.profile.firstName, a.profile.middleName, a.profile.lastName].filter(Boolean).join(" ") : a.name, email: a.email.toLowerCase(), photo: personPhoto(a.avatar) }));
}
