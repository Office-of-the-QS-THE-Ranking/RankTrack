/*
 * The data privacy notice every Digital Form opens with: Step 0, before the first question. A respondent reads
 * how the Office of the QS/THE Rankings and UST SIMBAHAYAN use what the form collects (and, for a form a unit or a
 * student organization made, how its maker does) and agrees to both statements; until then no other step opens,
 * and the server takes no response without that consent. The consent is kept with the response
 * (form_responses.privacy_consent) under the notice's version, so a change to these words is a new version. No
 * server code, so pages can import it.
 */

/** Change it whenever the notice's words change: each response keeps the version it was given. */
export const PRIVACY_VERSION = "2026-10-29.1";

export const PRIVACY_LAW = { name: "Data Privacy Act of 2012", ref: "RA 10173" };

type Icon = "user" | "users" | "phone" | "building" | "pen" | "clipboard" | "lock-keyhole" | "ban" | "eye" | "clock" | "rankings" | "collaboration";

/** What a Digital Form collects: a label and a few words on it. */
export const PRIVACY_COLLECTS: { icon: Icon; label: string; note: string }[] = [
  { icon: "user", label: "Names", note: "In capitals" },
  { icon: "phone", label: "Phone and email", note: "UST addresses" },
  { icon: "building", label: "College or office", note: "Or organization" },
  { icon: "pen", label: "E-signature", note: "A ticked box, dated when sent" },
  { icon: "clipboard", label: "Answers and budgets", note: "And the links you share" },
  { icon: "lock-keyhole", label: "Time sent", note: "A coded network mark, or your Hub account on an assignment" },
];

export interface PrivacyUser {
  id: "rankings" | "simbahayan" | "maker";
  name: string;
  role: string;
  icon: Icon;
  uses: string[];
}

/** The two offices that use what a form collects, and how. */
export const PRIVACY_USERS: PrivacyUser[] = [
  {
    id: "rankings",
    name: "Office of the QS/THE Rankings",
    role: "Hosts this form",
    icon: "rankings",
    uses: [
      "Keeps your response secure on the Hub",
      "Counts projects, partners and SDGs as ranking evidence",
      "Sends rankers totals and stories only, never names or contacts",
      "May contact you for a project’s proof",
    ],
  },
  {
    id: "simbahayan",
    name: "UST SIMBAHAYAN",
    role: "Community Development Office",
    icon: "collaboration",
    uses: [
      "Reviews your form and takes it through its sign-offs",
      "Coordinates with the people you name",
      "Releases and liquidates the Community Service Fund",
      "Documents and reports the work, with the photos you allow",
    ],
  },
];

/** Who made a form, when not the Office: a unit, or a student organization (through its Secretary). */
export type PrivacyMaker = { kind: "unit" | "student"; name: string };

/** The offices that use what a form collects, and, for a form a unit or a student organization made, its maker. */
export function privacyUsers(maker?: PrivacyMaker): PrivacyUser[] {
  if (!maker) return PRIVACY_USERS;
  return [
    ...PRIVACY_USERS,
    {
      id: "maker",
      name: maker.name,
      role: maker.kind === "student" ? "The student organization that made this form" : "The unit that made this form",
      icon: maker.kind === "student" ? "users" : "building",
      uses: ["Reads the answers sent to this form", "Uses them only for the activity it names", "Shares them with no one outside UST", "Answers your questions about this form"],
    },
  ];
}

/** What happens, and never happens, to a response. */
export const PRIVACY_PROMISES: { icon: Icon; title: string; text: string }[] = [
  { icon: "ban", title: "Never sold", text: "Not shared outside UST unless the law requires it" },
  { icon: "eye", title: "Seen by reviewers only", text: "Reviewers, signatories and the offices that release funds" },
  { icon: "clock", title: "Kept while needed", text: "Then deleted or made anonymous under UST’s records rules" },
];

/** The rights the Data Privacy Act gives everyone named in a form. */
export const PRIVACY_RIGHTS = ["Be informed", "Access", "Correct", "Object", "Erase or block", "Get a copy", "Be compensated", "Complain to the Privacy Commission"];

export const PRIVACY_CONTACT = "Write to the office that issued this form or to the University’s Data Protection Officer.";

/** What the respondent agrees to, each required. */
export const PRIVACY_STATEMENTS = [
  { id: "mine", title: "I agree to this notice", text: "The Office of the QS/THE Rankings and UST SIMBAHAYAN may use my information as described." },
  { id: "others", title: "The people I name agreed", text: "My contacts, officers, speakers and emergency contact know how their information is used." },
] as const;

/** A statement's words for this form: its maker, when a unit or a student organization made it, is named with the offices. */
export const statementText = (s: (typeof PRIVACY_STATEMENTS)[number], maker?: PrivacyMaker) =>
  s.id === "mine" && maker ? `The Office of the QS/THE Rankings, UST SIMBAHAYAN and ${maker.name} may use my information as described.` : s.text;

export type PrivacyStatement = (typeof PRIVACY_STATEMENTS)[number]["id"];

/** The consent a response is kept with: the notice's version and the statements agreed to. */
export interface PrivacyConsent {
  version: string;
  agreed: PrivacyStatement[];
}

/** The consent as sent, if it's complete and for the current notice; null when not. */
export function readConsent(raw: unknown): PrivacyConsent | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.version !== PRIVACY_VERSION || !Array.isArray(c.agreed)) return null;
  const agreed = PRIVACY_STATEMENTS.map((s) => s.id).filter((id) => (c.agreed as unknown[]).includes(id));
  return agreed.length === PRIVACY_STATEMENTS.length ? { version: PRIVACY_VERSION, agreed } : null;
}
