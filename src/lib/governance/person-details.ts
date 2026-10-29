/*
 * Who someone is and where they belong, as the Request access form (RequestAccessForm → requestAccess) and the
 * invite drawer (InviteSheet → account.invite) both ask it: the same fields, rules and messages, a requester
 * answering for themselves ("your") and an administrator for the person they invite ("their"). University of
 * Santo Tomas as the affiliation asks for a role, a University Office or College/Faculty and which one, on a UST
 * email (a Student, the Secretary of a student organization, commission or council, also names it); any other
 * affiliation is an External partner's, on an email outside the University.
 */
import {
  NO_SALUTATION,
  OTHER_SALUTATION,
  SALUTATIONS,
  SECTIONS,
  SPECIFY,
  SPECIFY_LABEL,
  THOMASIAN_AFFILIATION,
  UST_ROLES,
  asksWebsite,
  cleanWebsite,
  isThomasian,
  listedAffiliation,
  salutationText,
  sectionsFor,
  universityEmail,
  validRequestText,
  type Section,
  type Voice,
} from "./access-requests";
import { ROLE } from "./catalog";
import { requestUnits } from "./directory";
import { clean, isEmail } from "./engine/core";
import type { AccountProfile, OrgUnit, RoleId } from "./types";

/** The shared fields, as either form sends them. */
export type PersonInput = {
  lastName: string;
  firstName: string;
  middleName: string;
  salutation: string;
  otherSalutation?: string;
  email: string;
  affiliation: string;
  organization: string;
  website?: string;
  /** Thomasians: the role, whether in a University Office or a College/Faculty, and which one. */
  roleId?: string;
  section?: string;
  unitId?: string;
};

/** The fields once checked; a Thomasian's unit is checked against the Directory by placePerson. */
export type Person = {
  /** First, middle and last, in capitals. */
  name: string;
  email: string;
  thomasian: boolean;
  profile: AccountProfile;
  /** A Thomasian's role and section, and the unit as given. */
  roleId?: RoleId;
  section?: Section;
  unitId: string;
};

const upper = (v: unknown) => clean(v, 60).normalize("NFC").toUpperCase();

/** The profile without empty fields, as an account keeps it. */
export function profileOf(p: AccountProfile): AccountProfile {
  return {
    lastName: p.lastName,
    firstName: p.firstName,
    ...(p.middleName ? { middleName: p.middleName } : {}),
    ...(p.salutation ? { salutation: p.salutation } : {}),
    affiliation: p.affiliation,
    listed: p.listed,
    ...(p.organization ? { organization: p.organization } : {}),
    ...(p.website ? { website: p.website } : {}),
  };
}

/** The account's position line: a Thomasian's role (a Student's as the Secretary of their organization), or an External partner's organization. */
export const personTitle = (p: Person) =>
  p.roleId === ROLE.student && p.profile.organization
    ? `Secretary, ${p.profile.organization}`
    : p.roleId
      ? (UST_ROLES.find((r) => r.id === p.roleId)?.name ?? "")
      : p.profile.organization || p.profile.affiliation;

/** The answers checked on their own, or what to fix as a sentence. */
export function readPerson(input: PersonInput, voice: Voice): Person | string {
  const your = voice === "self" ? "your" : "their";
  const lastName = upper(input.lastName);
  const firstName = upper(input.firstName);
  const middleName = upper(input.middleName);
  const email = clean(input.email).toLowerCase();
  const thomasian = isThomasian(clean(input.affiliation, 160));
  const answer = thomasian ? THOMASIAN_AFFILIATION : clean(input.affiliation, 160).normalize("NFC").toUpperCase();
  if (!lastName || !validRequestText(lastName)) return `Enter ${your} last name.`;
  if (!firstName || !validRequestText(firstName)) return `Enter ${your} first name.`;
  if (middleName && !validRequestText(middleName)) return `Check ${your} middle name.`;
  const salutation = input.salutation === OTHER_SALUTATION ? salutationText(String(input.otherSalutation ?? "")).trim() : input.salutation;
  if (input.salutation !== NO_SALUTATION && !(SALUTATIONS.includes(salutation) || (input.salutation === OTHER_SALUTATION && /\p{L}/u.test(salutation))))
    return "Choose a salutation, or Prefer not to specify.";
  if (!isEmail(email)) return thomasian ? `Enter ${your} UST email address.` : `Enter ${your} institution email address.`;
  const role = thomasian ? UST_ROLES.find((r) => r.id === input.roleId) : undefined;
  if (thomasian && !role) return `Choose ${your} role: Administrator, Coordinator or Student.`;
  const section = role ? sectionsFor(role.id).find((x) => x === input.section) : undefined;
  if (role && !section) return role.id === ROLE.student ? "Students choose a College/Faculty." : "Choose University Office or College/Faculty.";
  if (!thomasian && !validRequestText(answer, true)) return "Enter an affiliation using letters, spaces, hyphens, em dashes, slashes or parentheses only.";
  const listed = thomasian ? undefined : listedAffiliation(answer);
  // Student access is for the Secretary of a student organization, commission or council, named here.
  const secretary = role?.id === ROLE.student;
  const organization = listed === SPECIFY || secretary ? clean(input.organization, 160).normalize("NFC").toUpperCase() : "";
  if (listed === SPECIFY && !validRequestText(organization)) return `Name ${your} accreditation organization.`;
  if (secretary && !validRequestText(organization, true)) return `Name the student organization, commission or council ${voice === "self" ? "you are" : "they are"} the Secretary of.`;
  const website = !thomasian && asksWebsite(answer) ? cleanWebsite(input.website ?? "") : "";
  if (!thomasian && asksWebsite(answer) && input.website?.trim() && !website) return "Enter the website as a full address starting with https://.";
  return {
    name: [firstName, middleName, lastName].filter(Boolean).join(" "),
    email,
    thomasian,
    profile: profileOf({
      lastName,
      firstName,
      middleName,
      salutation: input.salutation !== NO_SALUTATION ? salutation : undefined,
      affiliation: listed === SPECIFY ? SPECIFY_LABEL : (listed ?? answer),
      listed: thomasian || !!listed,
      organization,
      website,
    }),
    roleId: role?.id,
    section,
    unitId: thomasian ? clean(input.unitId) : "",
  };
}

/**
 * The email against the affiliation (a UST address for the University, any other for an External partner),
 * then a Thomasian's unit against the chosen section of the Directory. Returns that unit, or what to fix.
 */
export function placePerson(p: Person, { domains, units, voice }: { domains: string[]; units: OrgUnit[]; voice: Voice }): { unit?: OrgUnit } | string {
  const your = voice === "self" ? "your" : "their";
  const university = universityEmail(p.email, domains);
  if (p.thomasian && !university) return `Use ${your} UST email (${domains.map((d) => `@${d}`).join(" or ")}).`;
  if (!p.thomasian && university) return `That is a UST email. Choose University of Santo Tomas as ${your} affiliation.`;
  if (!p.roleId) return {};
  const label = SECTIONS.find((x) => x.key === p.section)?.label;
  const allowed = label ? (requestUnits(units).find((g) => g.label === label)?.units ?? []) : [];
  const unit = allowed.some((u) => u.id === p.unitId) ? units.find((u) => u.id === p.unitId) : undefined;
  if (!unit) return p.section === "offices" ? `Choose ${your} office.` : `Choose ${your} college or faculty.`;
  return { unit };
}
