import "server-only";

/*
 * The University's Google Workspace directory, searched as the person asking. Google sign-in (actions/session.ts,
 * and a digital form's "Sign in with Google", /auth/verify-email) asks for directory.readonly, the access Gmail uses
 * to suggest University names; /auth/callback keeps the Google tokens it returns, encrypted, in
 * google_directory_tokens (supabase/migrations/20261028270000_google_directory_tokens.sql), and a form's people
 * lookup (actions/form-people.ts) uses them through the People API. Each search sees only what that person sees in
 * Gmail. An access token lasts an hour; the refresh token Google gives with the first consent renews it, with the
 * Google client the sign-in uses (SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID and _SECRET, the same as Supabase Auth's).
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { lookupKey, personPhoto, type PersonMatch } from "@/lib/forms/people-lookup";
import { adminDb } from "@/lib/supabase/server";

export const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/directory.readonly";

/** What sign-in asks Google for, on top of name, email and photo: the directory, and a refresh token with the first consent. */
export const DIRECTORY_SIGNIN = { scopes: DIRECTORY_SCOPE, queryParams: { access_type: "offline" } } as const;

const TABLE = "google_directory_tokens";

function key() {
  const secret = process.env.HUB_VERIFY_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("HUB_VERIFY_SECRET (or SUPABASE_SECRET_KEY) is not set: Google directory tokens can't be encrypted.");
  return createHmac("sha256", "hub-google-directory").update(secret).digest();
}

const seal = (text: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
};

const open = (sealed: string | null) => {
  if (!sealed) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(body!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
};

/** Whether Google granted the directory with this token: people may untick it on the consent screen. */
async function grantsDirectory(access: string) {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const { scope = "", expires_in } = (await res.json()) as { scope?: string; expires_in?: string };
    return scope.split(" ").includes(DIRECTORY_SCOPE) ? Math.max(60, Number(expires_in) || 3600) : false;
  } catch {
    return false;
  }
}

/**
 * Keep the Google tokens from a University account's sign-in. A refresh token comes only with a consent, so one
 * already kept stays when Google sends none. Declining the directory forgets what was kept.
 */
export async function keepDirectoryTokens(email: string, access: string | null | undefined, refresh: string | null | undefined) {
  const who = email.toLowerCase();
  try {
    if (!access) return;
    const lasts = await grantsDirectory(access);
    if (!lasts) {
      await adminDb().from(TABLE).delete().eq("email", who);
      return;
    }
    const row = { email: who, access_token: seal(access), expires_at: new Date(Date.now() + (lasts - 60) * 1000).toISOString(), updated_at: new Date().toISOString(), ...(refresh && { refresh_token: seal(refresh) }) };
    const { error } = await adminDb().from(TABLE).upsert(row, { onConflict: "email" });
    if (error) console.error(`Directory tokens: ${error.message}`);
  } catch (e) {
    // Sign-in goes on without the directory.
    console.error(`Directory tokens: ${e instanceof Error ? e.message : e}`);
  }
}

/** An access token for `email`'s directory, renewed when it has run out; null when there's none to use. */
async function accessFor(email: string) {
  const db = adminDb();
  const { data } = await db.from(TABLE).select("access_token, refresh_token, expires_at").eq("email", email).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() > Date.now()) return open(data.access_token);
  const refresh = open(data.refresh_token);
  const id = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID;
  const secret = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET;
  if (!refresh || !id || !secret) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    // Revoked, or the person left the University: forget it, and the next sign-in asks again.
    if (res.status === 400 || res.status === 401) await db.from(TABLE).delete().eq("email", email);
    return null;
  }
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  await db.from(TABLE).update({ access_token: seal(access_token), expires_at: new Date(Date.now() + (expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("email", email);
  return access_token;
}

type DirectoryPerson = {
  names?: { displayName?: string; givenName?: string; familyName?: string; metadata?: { primary?: boolean } }[];
  emailAddresses?: { value?: string; metadata?: { primary?: boolean } }[];
  photos?: { url?: string; default?: boolean }[];
};

const primary = <T extends { metadata?: { primary?: boolean } }>(list: T[] | undefined) => list?.find((x) => x.metadata?.primary) ?? list?.[0];

/** A directory person as a match, when their primary email is at `domain`. */
function matchOf(p: DirectoryPerson, domain: string): PersonMatch | null {
  const n = primary(p.names);
  const mail = primary(p.emailAddresses)?.value?.toLowerCase();
  if (!n || !mail?.endsWith(`@${domain}`)) return null;
  const photo = p.photos?.find((x) => !x.default)?.url;
  return { name: n.displayName ?? [n.givenName, n.familyName].filter(Boolean).join(" "), email: mail, photo: personPhoto(photo) };
}

/** People at `domain` in the directory, searched as `email`, by whatever Google matches `text` with: names or emails. */
export async function searchDirectoryTextAs(email: string, text: string, domain: string): Promise<PersonMatch[]> {
  try {
    const access = await accessFor(email.toLowerCase());
    if (!access) return [];
    const q = new URLSearchParams({ query: text, readMask: "names,emailAddresses,photos", sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE", pageSize: "10" });
    const res = await fetch(`https://people.googleapis.com/v1/people:searchDirectoryPeople?${q}`, { headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`people ${res.status}`);
    const { people = [] } = (await res.json()) as { people?: DirectoryPerson[] };
    return people.flatMap((p) => matchOf(p, domain) ?? []);
  } catch (e) {
    console.error(`Workspace directory: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** People at `domain` in the directory, searched as `email`, whose last name starts with `last` and first name with `first`. */
export async function searchDirectoryAs(email: string, last: string, first: string, domain: string): Promise<PersonMatch[]> {
  try {
    const access = await accessFor(email.toLowerCase());
    if (!access) return [];
    const L = lookupKey(last);
    const F = lookupKey(first);
    const q = new URLSearchParams({ query: `${F} ${L}`, readMask: "names,emailAddresses,photos", sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE", pageSize: "10" });
    const res = await fetch(`https://people.googleapis.com/v1/people:searchDirectoryPeople?${q}`, { headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`people ${res.status}`);
    const { people = [] } = (await res.json()) as { people?: DirectoryPerson[] };
    return people.flatMap((p) => {
      const n = primary(p.names);
      const mail = primary(p.emailAddresses)?.value?.toLowerCase();
      if (!n || !mail?.endsWith(`@${domain}`)) return [];
      if (!lookupKey(n.familyName ?? "").startsWith(L) || !lookupKey(n.givenName ?? "").startsWith(F)) return [];
      const photo = p.photos?.find((x) => !x.default)?.url;
      return [{ name: n.displayName ?? [n.givenName, n.familyName].filter(Boolean).join(" "), email: mail, photo: personPhoto(photo) }];
    });
  } catch (e) {
    console.error(`Workspace directory: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}
