import "server-only";

/*
 * Proving a UST email before a Thomasian requests access. The request form goes to /auth/verify-email, the way
 * sign-in goes to Google, which signs in to the University's Google Workspace through Supabase Auth (the Google client and
 * callback the Hub already uses) and comes back to /auth/callback, marked by the state cookie. Supabase's sign-in gate refuses
 * addresses without an account, so the typed address is let through (hub_auth_allow, "Email verification") for
 * the few minutes this takes. If Google's account is the email typed, on a University domain, the browser gets a
 * signed, short-lived cookie that requestAccess checks; the Supabase user made on the way is removed again.
 *
 * A digital form's pages sign in the same way (`back` names the form or copy to return to), choosing any Google
 * account without typing an email first: the proof is a signed cookie with the email and Google's name, good for a week, that says who builds a
 * team copy, who may open a private one, and who is in one (lib/forms/copies.ts). It opens nothing else in the Hub.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isEmail } from "../engine/core";
import { profileAvatar } from "@/lib/forms/copies";

const SECURE = process.env.NODE_ENV === "production";

/** The signed proof that the browser signed in to Google as an email; the request form has this long to send. */
export const VERIFIED_COOKIE = SECURE ? "__Host-hub_email_verified" : "hub_email_verified";
export const VERIFIED_MINUTES = 30;

/** The email being proved, signed, held while the browser is at Google. */
export const STATE_COOKIE = SECURE ? "__Host-hub_verify_state" : "hub_verify_state";

export const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", secure: SECURE } as const;

/**
 * Who a digital form's pages know this browser to be, after Google sign-in from a form: email and name, signed. A Hub
 * session outranks it (server/form-copies.ts formWho), and signing in to or out of the Hub clears it (`FORM_WHO_GONE`).
 */
export const FORM_WHO_COOKIE = SECURE ? "__Host-hub_form_who" : "hub_form_who";
export const FORM_WHO_DAYS = 7;

/** The form cookie's options to clear it: `__Host-` cookies are only replaced with Secure and path "/", as set. */
export const FORM_WHO_GONE = { ...COOKIE_OPTIONS, maxAge: 0 } as const;

/** How hub_auth_allow marks the addresses let through while they verify, and for how long. */
export const VERIFY_REASON = "Email verification";
export const VERIFY_MINUTES = 15;

function key() {
  const secret = process.env.HUB_VERIFY_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("HUB_VERIFY_SECRET (or SUPABASE_SECRET_KEY) is not set: email verification can't sign its proof.");
  return createHmac("sha256", "hub-email-verify").update(secret).digest();
}

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export const randomToken = () => randomBytes(24).toString("base64url");

/** A cookie value that says this browser proved `email` until `VERIFIED_MINUTES` from now. */
export function proofFor(email: string) {
  const body = `${Buffer.from(email.toLowerCase()).toString("base64url")}.${Date.now() + VERIFIED_MINUTES * 60_000}`;
  return `${body}.${sign(body)}`;
}

/** The email a proof vouches for, or "" if it is missing, forged or expired. */
export function provenEmail(proof: string | undefined): string {
  const [who, until, mac] = (proof ?? "").split(".");
  if (!who || !until || !mac) return "";
  const want = Buffer.from(sign(`${who}.${until}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got) || Number(until) < Date.now()) return "";
  const email = Buffer.from(who, "base64url").toString();
  return isEmail(email) ? email : "";
}

/** The email this browser has proved, or "". */
export async function verifiedEmail() {
  return provenEmail((await cookies()).get(VERIFIED_COOKIE)?.value);
}

/** The state cookie's value: state, nonce, the email expected and, from a form, where to return; signed so none can be swapped. */
export function statePack(state: string, nonce: string, email: string, back?: string) {
  const body = [state, nonce, Buffer.from(email).toString("base64url"), ...(back ? [Buffer.from(back).toString("base64url")] : [])].join(".");
  return `${body}.${sign(body)}`;
}

export function stateUnpack(pack: string | undefined): { state: string; nonce: string; email: string; back?: string } | null {
  const parts = (pack ?? "").split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const mac = parts.pop()!;
  const [state, nonce, who, back] = parts;
  if (!state || !nonce || who === undefined || (!who && !back) || !mac) return null;
  const want = Buffer.from(sign(parts.join(".")));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { state, nonce, email: Buffer.from(who, "base64url").toString(), ...(back && { back: Buffer.from(back, "base64url").toString() }) };
}

/** A cookie value that says this browser signed in to Google as `email` (named `name`), for a form's pages. */
export function formWhoFor(email: string, name: string, avatar?: string) {
  const photo = profileAvatar(avatar);
  const body = [Buffer.from(email.toLowerCase()).toString("base64url"), Buffer.from(name.slice(0, 120)).toString("base64url"), Date.now() + FORM_WHO_DAYS * 86_400_000, ...(photo ? [Buffer.from(photo).toString("base64url")] : [])].join(".");
  return `${body}.${sign(`form.${body}`)}`;
}

/** Who a form's cookie vouches for, or null if it is missing, forged or expired. */
export function formWhoOf(value: string | undefined): { email: string; name: string; avatar?: string } | null {
  const parts = (value ?? "").split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const mac = parts.pop();
  const [who, name, until, photo] = parts;
  if (!who || name === undefined || !until || !mac) return null;
  const want = Buffer.from(sign(`form.${parts.join(".")}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got) || Number(until) < Date.now()) return null;
  const email = Buffer.from(who, "base64url").toString();
  const avatar = photo ? profileAvatar(Buffer.from(photo, "base64url").toString()) : undefined;
  return isEmail(email) ? { email, name: Buffer.from(name, "base64url").toString(), ...(avatar && { avatar }) } : null;
}
