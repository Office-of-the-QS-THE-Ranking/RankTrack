/*
 * Access requests from the sign-in page (SignInFlow → requestAccess): the affiliations the form suggests, how
 * an answer is matched to them, and how long a guest's access lasts once approved.
 */

/** Insert date separators as each pair is completed; let deletion remove a trailing separator. */
export function formatRequestBirthday(value: string, deleting = false): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const separator = value.includes("/") ? "/" : "-";
  let formatted = digits.slice(0, 2);
  if (digits.length > 2 || (digits.length === 2 && !deleting)) formatted += separator;
  formatted += digits.slice(2, 4);
  if (digits.length > 4 || (digits.length === 4 && !deleting)) formatted += separator;
  return formatted + digits.slice(4);
}

/** Parse a typed month-first birthday without accepting rolled-over calendar dates. */
export function requestBirthday(value: string): string {
  const match = /^(\d{2})([/-])(\d{2})\2(\d{4})$/.exec(value);
  if (!match) return "";
  const [, month, , day, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
}

/** A completed month-first birthday, shown with its full month name. */
export function displayRequestBirthday(value: string): string {
  const iso = requestBirthday(value);
  if (!iso) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Uppercase request text, retaining letters and spaces (plus affiliation punctuation). */
export function requestText(value: string, affiliation = false): string {
  const upper = value.normalize("NFC").toUpperCase();
  return upper.replace(affiliation ? /[^\p{L} \u2014/()\-]/gu : /[^\p{L} ]/gu, "");
}

/** Server-side check: at least one letter, with no unsupported characters. */
export function validRequestText(value: string, affiliation = false): boolean {
  return /\p{L}/u.test(value) && value === requestText(value, affiliation);
}

/**
 * The affiliations suggested as the requester types: ranking bodies, accreditors, and the kinds of
 * organization outside reviewers come from (the Office's list, 2026-10-24). An answer that matches none is
 * kept as typed, under Others.
 */
export const AFFILIATIONS = [
  "QS Quacquarelli Symonds (QS)",
  "Times Higher Education (THE)",
  "ShanghaiRanking Consultancy (ARWU)",
  "U.S. News & World Report",
  "Center for World University Rankings (CWUR)",
  "Round University Ranking (RUR)",
  "URAP – University Ranking by Academic Performance",
  "Webometrics Ranking of World Universities",
  "UI GreenMetric World University Rankings",
  "Association for the Advancement of Sustainability in Higher Education (AASHE)",
  "Sustainable Development Solutions Network (SDSN)",
  "ASEAN University Network – Quality Assurance (AUN-QA)",
  "Philippine Accrediting Association of Schools, Colleges and Universities (PAASCU)",
  "Accrediting Agency of Chartered Colleges and Universities in the Philippines (AACCUP)",
  "International Accreditation Organization (Specify)",
  "Government Agency",
  "Partner University / Higher Education Institution",
  "Research Institution",
  "International Organization",
  "Independent Auditor / External Evaluator",
  "Authorized Third-Party Data Validator",
].map((name) => requestText(name.replace(/&/g, "AND").replace(/–/g, "—"), true));

/** The one suggestion that asks the requester to name their organization in a field of its own. */
export const SPECIFY = "INTERNATIONAL ACCREDITATION ORGANIZATION (SPECIFY)";

/** How the specified organization is labelled once named: the suggestion without its "(Specify)". */
export const SPECIFY_LABEL = "INTERNATIONAL ACCREDITATION ORGANIZATION";

/** The salutations the form offers (the Office's list, 2026-10-25), before Other and Prefer not to specify. */
export const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Miss", "Mx.", "Dr.", "Prof.", "Atty.", "Engr.", "Rev.", "Fr.", "Sr.", "Hon."];

/** The choice that opens a field for the requester's own salutation. */
export const OTHER_SALUTATION = "Other";

/** The choice that leaves the salutation out. */
export const NO_SALUTATION = "Prefer not to specify";

/** A salutation typed under Other: letters, full stops and spaces, up to 24 characters. */
export const salutationText = (value: string) => value.normalize("NFC").replace(/[^\p{L}. ]/gu, "").replace(/\s+/g, " ").slice(0, 24);

/** How many working days the Office takes to review a request, as the receipt says. */
export const REVIEW_DAYS = "3 to 5";

/** How long an approved guest's access lasts, counted from the day of approval. */
export const GUEST_DAYS = 90;

const key = (s: string) => s.toLowerCase().replace(/[–—-]/g, "-").replace(/\./g, "").replace(/\s+/g, " ").trim();

/** The listed affiliation an answer matches, ignoring case, spacing, full stops and dash style; undefined for Others. */
export function listedAffiliation(answer: string): string | undefined {
  const k = key(answer);
  return k ? AFFILIATIONS.find((a) => key(a) === k) : undefined;
}

/**
 * The suggestions an answer brings up, best first: those starting with it, then those with a word starting
 * with it (so "the" finds Times Higher Education and "shanghai" finds ARWU), then any containing it.
 */
export function suggestAffiliations(answer: string): string[] {
  const k = key(answer);
  if (!k) return [...AFFILIATIONS];
  const starts: string[] = [];
  const words: string[] = [];
  const contains: string[] = [];
  for (const a of AFFILIATIONS) {
    const ka = key(a);
    if (ka.startsWith(k)) starts.push(a);
    else if (ka.split(/[\s(/]+/).some((w) => w.startsWith(k))) words.push(a);
    else if (ka.includes(k)) contains.push(a);
  }
  return [...starts, ...words, ...contains];
}

/*
 * Checking where a requester comes from. The institution email's domain is the evidence (they must receive
 * mail there to sign in); the approver sees it against the domains the chosen affiliation is known to use.
 * Someone under Others (or a named accreditation organization) may add their organization's website, which is
 * compared the same way and is only ever shown as text, never as a link.
 */

/** Domains the specific listed organizations send mail from or publish on. Categories (Government Agency, …) have none. */
const KNOWN_DOMAINS: [string, string[]][] = [
  ["QS Quacquarelli Symonds (QS)", ["qs.com", "topuniversities.com"]],
  ["Times Higher Education (THE)", ["timeshighereducation.com", "inpdatapoints.com"]],
  ["ShanghaiRanking Consultancy (ARWU)", ["shanghairanking.com", "shanghairanking.cn"]],
  ["U.S. News & World Report", ["usnews.com"]],
  ["Center for World University Rankings (CWUR)", ["cwur.org"]],
  ["Round University Ranking (RUR)", ["roundranking.com"]],
  ["URAP – University Ranking by Academic Performance", ["urapcenter.org"]],
  ["Webometrics Ranking of World Universities", ["webometrics.info", "csic.es"]],
  ["UI GreenMetric World University Rankings", ["ui.ac.id"]],
  ["Association for the Advancement of Sustainability in Higher Education (AASHE)", ["aashe.org"]],
  ["Sustainable Development Solutions Network (SDSN)", ["unsdsn.org"]],
  ["ASEAN University Network – Quality Assurance (AUN-QA)", ["aunsec.org", "aun-qa.org"]],
  ["Philippine Accrediting Association of Schools, Colleges and Universities (PAASCU)", ["paascu.org.ph"]],
  ["Accrediting Agency of Chartered Colleges and Universities in the Philippines (AACCUP)", ["aaccupqa.org.ph"]],
];
const DOMAINS_BY_AFFILIATION = new Map(KNOWN_DOMAINS.map(([name, d]) => [requestText(name.replace(/&/g, "AND").replace(/–/g, "—"), true), d]));

/** Personal mailboxes: anyone can open one, so they say nothing about an institution. */
const PERSONAL_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.ph",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

/** Whether the form asks for the organization's website: only for an organization the list doesn't know. */
export const asksWebsite = (affiliation: string) => {
  const listed = listedAffiliation(affiliation);
  return !!affiliation.trim() && (listed === undefined || listed === SPECIFY);
};

/** A website as typed, kept only as a plain https address (no sign-in details, query or fragment); "" if it isn't one. */
export function cleanWebsite(value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > 200) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return "";
    return `https://${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return "";
  }
}

/** The part of a host an organization owns: example.org from mail.example.org, ust.edu.ph from mail.ust.edu.ph. */
export function baseDomain(host: string): string {
  const labels = host
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);
  const n = labels.length;
  const two = n >= 3 && labels[n - 1].length === 2 && ["com", "edu", "org", "net", "gov", "ac", "co"].includes(labels[n - 2]);
  return labels.slice(two ? -3 : -2).join(".");
}

const sameOwner = (a: string, b: string) => !!a && baseDomain(a) === baseDomain(b);

export type DomainCheck = {
  domain: string;
  /** university: the University's own; match / mismatch: against the affiliation's known domains; personal: a personal mailbox; unknown: nothing to compare. */
  email: "university" | "match" | "mismatch" | "personal" | "unknown";
  expected: string[];
  /** The website's host and whether it shares the email's domain, when a website was given. */
  site?: { host: string; matches: boolean };
};

/** What the approver needs to judge where a requester comes from. */
export function checkDomains({ email, affiliation, website, university }: { email: string; affiliation: string; website?: string; university: boolean }): DomainCheck {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const expected = DOMAINS_BY_AFFILIATION.get(affiliation) ?? [];
  const host = website
    ? (() => {
        try {
          return new URL(website).hostname;
        } catch {
          return "";
        }
      })()
    : "";
  const site = host ? { host, matches: sameOwner(host, domain) } : undefined;
  const verdict: DomainCheck["email"] = university
    ? "university"
    : PERSONAL_MAIL.has(domain)
      ? "personal"
      : expected.length
        ? expected.some((d) => sameOwner(d, domain))
          ? "match"
          : "mismatch"
        : "unknown";
  return { domain, email: verdict, expected, site };
}
