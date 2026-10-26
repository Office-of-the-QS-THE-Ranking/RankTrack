"use server";

/*
 * Sign-in through the University's Google Workspace (Supabase Auth hands off to Google; /auth/callback
 * finishes), sign-out, the activity heartbeat and access requests. Every attempt, successful or not, is
 * audited.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SPECIFY, SPECIFY_LABEL, SALUTATIONS, OTHER_SALUTATION, NO_SALUTATION, THOMASIAN_AFFILIATION, SECTIONS, UST_ROLES, sectionsFor, isThomasian, listedAffiliation, validRequestText, asksWebsite, cleanWebsite, salutationText } from "@/lib/governance/access-requests";
import { ROLE } from "@/lib/governance/catalog";
import { domainAllowed } from "@/lib/governance/derive";
import { requestUnits } from "@/lib/governance/directory";
import { clean, isDay, isEmail, log } from "@/lib/governance/engine/core";
import { openRequest } from "@/lib/governance/engine/requests";
import { allow, clientKey } from "@/lib/governance/server/limits";
import { run, runSystem } from "@/lib/governance/server/run";
import { STAY_COOKIE, STAY_COOKIE_OPTIONS, checkSession, clearSessionCookie, sessionIdOf } from "@/lib/governance/server/session";
import { STATE_COOKIE, verifiedEmail } from "@/lib/governance/server/email-verify";
import { siteOrigin } from "@/lib/governance/server/origin";
import { safeNext } from "@/lib/governance/server/signin";
import { readState, touch } from "@/lib/governance/server/store";
import { usedNote } from "@/lib/governance/session-limits";
import { normalizeReference, trackRequest, type Track } from "@/lib/governance/request-tracker";
import { authClient } from "@/lib/supabase/server";

/** The way in: off to Google's account chooser, and back through /auth/callback. `stay`: "Keep me signed in". */
export async function startGoogleSignIn(next?: string, stay = false): Promise<{ ok: false; message: string }> {
  const jar = await cookies();
  // an email check left unfinished would otherwise take over this sign-in at /auth/callback
  jar.delete(STATE_COOKIE);
  jar.set(STAY_COOKIE, stay === true ? "1" : "0", STAY_COOKIE_OPTIONS);
  const back = new URL("/auth/callback", await siteOrigin());
  const to = safeNext(next);
  if (to) back.searchParams.set("next", to);
  const { sso } = (await readState()).security;
  const { data, error } = await (await authClient()).auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: back.toString(),
      // Google lists only University accounts unless sponsored guests may sign in too.
      queryParams: { prompt: "select_account", ...(!sso.allowGuests && sso.domains.length === 1 ? { hd: sso.domains[0] } : {}) },
    },
  });
  if (error || !data.url) return { ok: false, message: "Google sign-in is unavailable right now. Try again in a moment." };
  redirect(data.url);
}

const res = (id: string, label: string) => ({ type: "Account", id, label });

export async function signOut() {
  const jar = await cookies();
  const id = sessionIdOf(jar);
  if (id) {
    await runSystem((ctx) => {
      const sess = ctx.state.sessions.find((x) => x.id === id);
      const a = sess && ctx.state.accounts.find((x) => x.id === sess.accountId);
      ctx.state.sessions = ctx.state.sessions.filter((x) => x.id !== id);
      if (a && sess) log(ctx, "session.signout", "Session", res(a.id, a.name), "Success", `Signed out${usedNote(sess.createdAt, ctx.iso)}`, { ...ctx.actor, id: a.id, name: a.name, role: "Signed in" });
      return { ok: true, message: "Signed out" };
    });
  }
  clearSessionCookie(jar);
  redirect("/signin?ended=signed-out");
}

/** The idle timer's ping while someone is working. Returns how the session stands. */
export async function heartbeat(active: boolean): Promise<{ ok: boolean; problem?: string; idleMinutes?: number; warnMinutes?: number }> {
  const id = sessionIdOf(await cookies());
  if (!id) return { ok: false, problem: "ended" };
  const state = await readState();
  const check = checkSession(state, id);
  if ("problem" in check) return { ok: false, problem: check.problem };
  if (active) await touch(id, new Date().toISOString());
  return { ok: true, idleMinutes: state.security.session.idleMinutes, warnMinutes: state.security.session.warnMinutes };
}

/**
 * Someone without an account asks for one from the sign-in page; it enters the account access workflow. A
 * UST email is not access in itself: Thomasians ask too. A Thomasian picks University of Santo Tomas as their
 * affiliation and proves their UST email by signing in to Google with it (/auth/verify-email), then asks
 * to be an Administrator, Coordinator or Student of an office or college (the approver confirms or changes
 * the unit); an external partner, from anywhere else, asks as External, for a sponsored guest of the Office of QS/THE Rankings, whose access
 * ends GUEST_DAYS after approval (and which needs guest sign-in on to approve).
 */
export async function requestAccess(input: {
  lastName: string;
  firstName: string;
  middleName: string;
  salutation: string;
  otherSalutation?: string;
  birthday: string;
  email: string;
  /** University of Santo Tomas for a Thomasian; otherwise the affiliation, and the organization or website it may ask for. */
  affiliation: string;
  organization: string;
  website?: string;
  /** Thomasians: the role they ask for, whether in a University Office or a College/Faculty, and which one. */
  roleId?: string;
  section?: string;
  unitId?: string;
  agreed: boolean;
}): Promise<{ ok: boolean; message: string; reference?: string; at?: string }> {
  const lastName = clean(input.lastName, 60).normalize("NFC").toUpperCase();
  const firstName = clean(input.firstName, 60).normalize("NFC").toUpperCase();
  const middleName = clean(input.middleName, 60).normalize("NFC").toUpperCase();
  const email = clean(input.email).toLowerCase();
  const thomasian = isThomasian(clean(input.affiliation, 160));
  const answer = thomasian ? THOMASIAN_AFFILIATION : clean(input.affiliation, 160).normalize("NFC").toUpperCase();
  if (!lastName || !validRequestText(lastName)) return { ok: false, message: "Enter your last name." };
  if (!firstName || !validRequestText(firstName)) return { ok: false, message: "Enter your first name." };
  if (middleName && !validRequestText(middleName)) return { ok: false, message: "Check your middle name." };
  const salutation = input.salutation === OTHER_SALUTATION ? salutationText(String(input.otherSalutation ?? "")).trim() : input.salutation;
  if (input.salutation !== NO_SALUTATION && !(SALUTATIONS.includes(salutation) || (input.salutation === OTHER_SALUTATION && /\p{L}/u.test(salutation))))
    return { ok: false, message: "Choose a salutation, or Prefer not to specify." };
  const today = new Date().toISOString().slice(0, 10);
  const youngest = `${Number(today.slice(0, 4)) - 15}${today.slice(4)}`;
  if (!isDay(input.birthday) || input.birthday < "1900-01-01" || input.birthday > youngest) return { ok: false, message: "Check your birthday." };
  if (!isEmail(email)) return { ok: false, message: thomasian ? "Enter your UST email address." : "Enter your institution email address." };
  const role = thomasian ? UST_ROLES.find((r) => r.id === input.roleId) : undefined;
  if (thomasian && !role) return { ok: false, message: "Choose your role: Administrator, Coordinator or Student." };
  const section = role ? sectionsFor(role.id).find((x) => x === input.section) : undefined;
  if (role && !section) return { ok: false, message: role.id === ROLE.student ? "Students choose a College/Faculty." : "Choose University Office or College/Faculty." };
  if (!thomasian && !validRequestText(answer, true)) return { ok: false, message: "Enter an affiliation using letters, spaces, hyphens, em dashes, slashes or parentheses only." };
  const listed = thomasian ? undefined : listedAffiliation(answer);
  const organization = listed === SPECIFY ? clean(input.organization, 160).normalize("NFC").toUpperCase() : "";
  if (listed === SPECIFY && !validRequestText(organization)) return { ok: false, message: "Name your accreditation organization." };
  const affiliation = listed === SPECIFY ? SPECIFY_LABEL : (listed ?? answer);
  const website = !thomasian && asksWebsite(answer) ? cleanWebsite(input.website ?? "") : "";
  if (!thomasian && asksWebsite(answer) && input.website?.trim() && !website) return { ok: false, message: "Enter the website as a full address starting with https://." };
  if (input.agreed !== true) return { ok: false, message: "Accept the declarations to send your request." };
  // Anyone can send a request, so cap how many one network, and everyone together, can send, before anything
  // below can say whether an address already has an account. If the counter is unreachable, nothing is sent.
  const client = await clientKey();
  if (!(await allow(`access:${client}`, 3600, ACCESS.perClientHour, true, false))) return { ok: false, message: "Too many requests were sent from your network. Try again in an hour." };
  if (!(await allow("access:all", 3600, ACCESS.allHour, true, false))) return { ok: false, message: "The Hub is receiving many requests right now. Try again in an hour." };
  const state = await readState();
  const university = domainAllowed(state, email);
  if (thomasian && !university) return { ok: false, message: `Use your UST email (${state.security.sso.domains.map((d) => `@${d}`).join(" or ")}).` };
  if (!thomasian && university) return { ok: false, message: "That is a UST email. Choose University of Santo Tomas as your affiliation." };
  // a UST email counts only once this browser has signed in to Google with it (/auth/verify-email)
  if (thomasian && (await verifiedEmail()) !== email) return { ok: false, message: "Verify your UST email with Google, then submit again." };
  // the unit must be one of the chosen section's: a University Office, or a College/Faculty
  const sectionLabel = SECTIONS.find((x) => x.key === section)?.label;
  const allowed = sectionLabel ? (requestUnits(state.units).find((g) => g.label === sectionLabel)?.units ?? []) : [];
  const unit = role && allowed.some((u) => u.id === input.unitId) ? state.units.find((u) => u.id === input.unitId) : undefined;
  if (role && !unit) return { ok: false, message: section === "offices" ? "Choose your office." : "Choose your college or faculty." };
  const name = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const external = !thomasian;
  // guests are sponsored by the Office; Thomasians go to the unit the approver confirms
  const office = state.units.find((u) => u.id === "rankings-office" && u.status === "Active");
  let at = "";
  const out = await run(null, (ctx) => {
    at = ctx.iso;
    // Checked inside the transaction, so two requests sent at the same moment can't both pass.
    const s = ctx.state;
    if (s.accounts.some((a) => a.email.toLowerCase() === email)) return { ok: false, message: "That email already has an account. Sign in, or ask the Office if it is suspended." };
    const pending = s.requests.filter((r) => r.status === "Pending" && r.payload.kind === "account-access");
    if (pending.some((r) => r.payload.kind === "account-access" && r.payload.email.toLowerCase() === email)) return { ok: false, message: "A request for this email is already waiting for approval." };
    if (pending.length >= ACCESS.pending) return { ok: false, message: "The Office has too many requests waiting right now. Try again tomorrow." };
    const req = openRequest(
      ctx,
      "account-access",
      {
        kind: "account-access",
        name,
        email,
        unitId: external && office ? office.id : "",
        roleId: role?.id ?? ROLE.external,
        title: role?.name ?? (organization || affiliation),
        applicant: {
          ...(thomasian ? { thomasian: true, unitId: unit!.id } : {}),
          lastName,
          firstName,
          ...(middleName ? { middleName } : {}),
          ...(input.salutation !== NO_SALUTATION ? { salutation } : {}),
          birthday: input.birthday,
          affiliation,
          listed: thomasian || !!listed,
          ...(organization ? { organization } : {}),
          ...(website ? { website } : {}),
          agreedAt: ctx.iso,
        },
        ...(external ? { external: true } : {}),
      },
      `Account for ${name}, ${unit?.name ?? (organization || affiliation)}`,
      "",
    );
    return { ok: true, message: req.id };
  });
  revalidatePath("/", "layout");
  // The receipt is also to be emailed to the requester once the Hub's outgoing mail is set up.
  return out.ok
    ? { ok: true, message: `Your request is with the administrators. Once it is approved, sign in with ${email}.`, reference: out.message, at }
    : { ok: false, message: out.message };
}

/** Access requests waiting at once; per network and in total each hour. */
const ACCESS = { pending: 200, perClientHour: 5, allHour: 60 };
/** Failed tracker lookups one network may make in an hour, so reference codes can't be guessed. */
const TRACK_MISSES = 20;

const NO_MATCH = "No request matches that reference code and email. Check both and try again.";

/**
 * The Submission Tracker's lookup, polled while the page is open: an access request by its reference code
 * and the email it was sent with. Both must match, and a miss never says which one was wrong. Only the
 * stages come back. Lookups are not audited, since the tracker asks every few seconds.
 */
export async function trackAccessRequest(input: { reference: string; email: string }): Promise<{ ok: true; track: Track } | { ok: false; message: string; errors: Partial<Record<"reference" | "email", string>> }> {
  const reference = normalizeReference(String(input.reference ?? ""));
  const email = clean(String(input.email ?? "")).toLowerCase();
  const errors: Partial<Record<"reference" | "email", string>> = {};
  if (!reference) errors.reference = "Enter the reference code from your request, like RQ-0001.";
  if (!isEmail(email)) errors.email = "Enter the email address you sent the request with.";
  if (errors.reference || errors.email) return { ok: false, message: (errors.reference ?? errors.email)!, errors };
  const misses = `track-miss:${await clientKey()}`;
  if (!(await allow(misses, 3600, TRACK_MISSES, false, false))) {
    const message = "Too many lookups didn't match. Try again in an hour.";
    return { ok: false, message, errors: { reference: message } };
  }
  const state = await readState();
  const req = state.requests.find((r) => r.id === reference);
  if (!req || req.payload.kind !== "account-access" || req.payload.email.toLowerCase() !== email) {
    await allow(misses, 3600, TRACK_MISSES);
    return { ok: false, message: NO_MATCH, errors: { reference: NO_MATCH, email: NO_MATCH } };
  }
  const steps = state.workflows.find((w) => w.id === req.workflowId)?.steps.length ?? 1;
  const account = req.status === "Approved" ? state.accounts.find((a) => a.email.toLowerCase() === email) : undefined;
  return { ok: true, track: trackRequest(req, steps, account && (account.firstLogin ?? account.lastLogin)) };
}

/** Whether this browser has proved `email` with Google, so the request form can show its check on return. */
export async function emailVerified(email: string): Promise<boolean> {
  const e = clean(String(email ?? "")).toLowerCase();
  return !!e && (await verifiedEmail()) === e;
}
