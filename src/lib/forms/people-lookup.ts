/*
 * Finding a person named on a form in the University's directory (actions/form-people.ts): a responder who has
 * proved a University account types a last and first name, and matching people offer their University email and
 * photo. Only Google's photo host is kept, as the Hub's content policy allows no other.
 */

/** One match: their name as the directory has it, their University email and, when they have one, their photo. */
export interface PersonMatch {
  name: string;
  email: string;
  photo?: string;
}

/** A badge for a UST email explicitly selected from the directory, rather than typed manually. */
export function directoryPicked(person: { email?: string; directoryEmail?: string; photo?: string }): boolean {
  const email = person.email?.trim().toLowerCase();
  // Earlier directory selections saved only their Google photo; editing the email clears that photo too.
  const selected = person.directoryEmail !== undefined ? email === person.directoryEmail.trim().toLowerCase() : !!personPhoto(person.photo);
  return !!email && /^[^\s@]+@ust\.edu\.ph$/.test(email) && selected;
}

/** Letters typed in each of the last and first names before the directory is searched. */
export const LOOKUP_MIN = 2;
/** The most matches offered at once. */
export const LOOKUP_MAX = 3;

/** A person's photo on Google's photo host, over HTTPS, or undefined. */
export function personPhoto(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 1024) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && /(^|\.)googleusercontent\.com$/.test(u.hostname) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** A name for matching: capitals, no accents, single spaces. "Dela Peña" → "DELA PENA". */
export const lookupKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
