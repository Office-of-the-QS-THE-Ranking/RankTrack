import "server-only";

/*
 * Proving a UST email before a Thomasian requests access. The request form goes to /auth/verify-email, the way
 * sign-in goes to Google, which signs in to the University's Google Workspace through Supabase Auth (the Google client and
 * callback the Hub already uses) and comes back to /auth/callback, marked by the state cookie. Supabase's sign-in gate refuses
 * addresses without an account, so the typed address is let through (hub_auth_allow, "Email verification") for
 * the few minutes this takes. If Google's account is the email typed, on a University domain, the browser gets a
 * signed, short-lived cookie that requestAccess checks; the Supabase user made on the way is removed again.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isEmail } from "../engine/core";

const SECURE = process.env.NODE_ENV === "production";

/** The signed proof that the browser signed in to Google as an email; the request form has this long to send. */
export const VERIFIED_COOKIE = SECURE ? "__Host-hub_email_verified" : "hub_email_verified";
export const VERIFIED_MINUTES = 30;

/** The email being proved, signed, held while the browser is at Google. */
export const STATE_COOKIE = SECURE ? "__Host-hub_verify_state" : "hub_verify_state";

export const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", secure: SECURE } as const;

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

/** The state cookie's value: state, nonce and the email expected, signed so it can't be swapped for another. */
export function statePack(state: string, nonce: string, email: string) {
  const body = [state, nonce, Buffer.from(email).toString("base64url")].join(".");
  return `${body}.${sign(body)}`;
}

export function stateUnpack(pack: string | undefined): { state: string; nonce: string; email: string } | null {
  const [state, nonce, who, mac] = (pack ?? "").split(".");
  if (!state || !nonce || !who || !mac) return null;
  const want = Buffer.from(sign(`${state}.${nonce}.${who}`));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { state, nonce, email: Buffer.from(who, "base64url").toString() };
}
