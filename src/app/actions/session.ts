"use server";

/*
 * Sign-in through the University's Google Workspace (Supabase Auth hands off to Google; /auth/callback
 * finishes), sign-out, the activity heartbeat and access requests. Every attempt, successful or not, is
 * audited.
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SPECIFY, SPECIFY_LABEL, SALUTATIONS, OTHER_SALUTATION, NO_SALUTATION, listedAffiliation, validRequestText, asksWebsite, cleanWebsite, salutationText } from "@/lib/governance/access-requests";
import { ROLE } from "@/lib/governance/catalog";
import { domainAllowed } from "@/lib/governance/derive";
import { clean, isDay, isEmail, log } from "@/lib/governance/engine/core";
import { openRequest } from "@/lib/governance/engine/requests";
import { run, runSystem } from "@/lib/governance/server/run";
import { SESSION_COOKIE, checkSession } from "@/lib/governance/server/session";
import { safeNext } from "@/lib/governance/server/signin";
import { readState, touch } from "@/lib/governance/server/store";
import { normalizeReference, trackRequest, type Track } from "@/lib/governance/request-tracker";
import { authClient } from "@/lib/supabase/server";

/** The way in: off to Google's account chooser, and back through /auth/callback. */
export async function startGoogleSignIn(next?: string): Promise<{ ok: false; message: string }> {
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const back = new URL("/auth/callback", origin);
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
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await runSystem((ctx) => {
      const sess = ctx.state.sessions.find((x) => x.id === id);
      const a = sess && ctx.state.accounts.find((x) => x.id === sess.accountId);
      ctx.state.sessions = ctx.state.sessions.filter((x) => x.id !== id);
      if (a) log(ctx, "session.signout", "Session", res(a.id, a.name), "Success", "Signed out", { ...ctx.actor, id: a.id, name: a.name, role: "Signed in" });
      return { ok: true, message: "Signed out" };
    });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/signin?ended=signed-out");
}

/** The idle timer's ping while someone is working. Returns how the session stands. */
export async function heartbeat(active: boolean): Promise<{ ok: boolean; problem?: string; idleMinutes?: number; warnMinutes?: number }> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return { ok: false, problem: "ended" };
  const state = await readState();
  const check = checkSession(state, id);
  if ("problem" in check) return { ok: false, problem: check.problem };
  if (active) await touch(id, new Date().toISOString());
  return { ok: true, idleMinutes: state.security.session.idleMinutes, warnMinutes: state.security.session.warnMinutes };
}

/**
 * Someone without an account asks for one from the sign-in page; it enters the account access workflow.
 * From the University's own domains it asks for a contributor account, in the unit the approver chooses; from
 * anywhere else, for a sponsored guest of the Office of QS/THE Rankings, whose access ends GUEST_DAYS after
 * approval (and which needs guest sign-in on to approve).
 */
export async function requestAccess(input: {
  lastName: string;
  firstName: string;
  middleName: string;
  salutation: string;
  otherSalutation?: string;
  birthday: string;
  email: string;
  affiliation: string;
  organization: string;
  website?: string;
  agreed: boolean;
}): Promise<{ ok: boolean; message: string; reference?: string; at?: string }> {
  const lastName = clean(input.lastName, 60).normalize("NFC").toUpperCase();
  const firstName = clean(input.firstName, 60).normalize("NFC").toUpperCase();
  const middleName = clean(input.middleName, 60).normalize("NFC").toUpperCase();
  const email = clean(input.email).toLowerCase();
  const answer = clean(input.affiliation, 160).normalize("NFC").toUpperCase();
  if (!lastName || !validRequestText(lastName)) return { ok: false, message: "Enter your last name." };
  if (!firstName || !validRequestText(firstName)) return { ok: false, message: "Enter your first name." };
  if (middleName && !validRequestText(middleName)) return { ok: false, message: "Check your middle name." };
  const salutation = input.salutation === OTHER_SALUTATION ? salutationText(String(input.otherSalutation ?? "")).trim() : input.salutation;
  if (input.salutation !== NO_SALUTATION && !(SALUTATIONS.includes(salutation) || (input.salutation === OTHER_SALUTATION && /\p{L}/u.test(salutation))))
    return { ok: false, message: "Choose a salutation, or Prefer not to specify." };
  const today = new Date().toISOString().slice(0, 10);
  const youngest = `${Number(today.slice(0, 4)) - 15}${today.slice(4)}`;
  if (!isDay(input.birthday) || input.birthday < "1900-01-01" || input.birthday > youngest) return { ok: false, message: "Check your birthday." };
  if (!isEmail(email)) return { ok: false, message: "Enter your institution email address." };
  if (!validRequestText(answer, true)) return { ok: false, message: "Enter an affiliation using letters, spaces, hyphens, em dashes, slashes or parentheses only." };
  const listed = listedAffiliation(answer);
  const organization = listed === SPECIFY ? clean(input.organization, 160).normalize("NFC").toUpperCase() : "";
  if (listed === SPECIFY && !validRequestText(organization)) return { ok: false, message: "Name your accreditation organization." };
  const affiliation = listed === SPECIFY ? SPECIFY_LABEL : (listed ?? answer);
  const website = asksWebsite(answer) ? cleanWebsite(input.website ?? "") : "";
  if (asksWebsite(answer) && input.website?.trim() && !website) return { ok: false, message: "Enter the website as a full address starting with https://." };
  if (input.agreed !== true) return { ok: false, message: "Accept the declarations to send your request." };
  const state = await readState();
  if (state.accounts.some((a) => a.email === email)) return { ok: false, message: "That email already has an account. Sign in, or ask the Office if it is suspended." };
  if (state.requests.some((r) => r.status === "Pending" && r.payload.kind === "account-access" && r.payload.email === email)) return { ok: false, message: "A request for this email is already waiting for approval." };
  const name = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const external = !domainAllowed(state, email);
  // guests are sponsored by the Office; University staff go to the unit the approver chooses
  const office = state.units.find((u) => u.id === "rankings-office" && u.status === "Active");
  let at = "";
  const out = await run(null, (ctx) => {
    at = ctx.iso;
    const req = openRequest(
      ctx,
      "account-access",
      {
        kind: "account-access",
        name,
        email,
        unitId: external && office ? office.id : "",
        roleId: external ? ROLE.external : ROLE.coordinator,
        title: organization || affiliation,
        applicant: {
          lastName,
          firstName,
          ...(middleName ? { middleName } : {}),
          ...(input.salutation !== NO_SALUTATION ? { salutation } : {}),
          birthday: input.birthday,
          affiliation,
          listed: !!listed,
          ...(organization ? { organization } : {}),
          ...(website ? { website } : {}),
          agreedAt: ctx.iso,
        },
        ...(external ? { external: true } : {}),
      },
      `Account for ${name}, ${organization || affiliation}`,
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
  const state = await readState();
  const req = state.requests.find((r) => r.id === reference);
  if (!req || req.payload.kind !== "account-access" || req.payload.email.toLowerCase() !== email) return { ok: false, message: NO_MATCH, errors: { reference: NO_MATCH, email: NO_MATCH } };
  const steps = state.workflows.find((w) => w.id === req.workflowId)?.steps.length ?? 1;
  const account = req.status === "Approved" ? state.accounts.find((a) => a.email.toLowerCase() === email) : undefined;
  return { ok: true, track: trackRequest(req, steps, account && (account.firstLogin ?? account.lastLogin)) };
}
