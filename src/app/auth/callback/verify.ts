import { NextResponse, type NextRequest } from "next/server";
import { domainAllowed } from "@/lib/governance/derive";
import { COOKIE_OPTIONS, FORM_WHO_COOKIE, FORM_WHO_DAYS, STATE_COOKIE, VERIFIED_COOKIE, VERIFIED_MINUTES, VERIFY_REASON, formWhoFor, proofFor, stateUnpack } from "@/lib/governance/server/email-verify";
import { keepDirectoryTokens } from "@/lib/governance/server/google-directory";
import { readState } from "@/lib/governance/server/store";
import { adminDb, authClient } from "@/lib/supabase/server";

/**
 * /auth/callback while the verification state cookie is set: the request form back from Google (lib/governance/server/email-verify.ts).
 * The account must be the email typed, in the University's Google Workspace. Nothing signs in: the Supabase
 * session ends at once, and the Supabase user and the gate's temporary pass go again unless the Hub knows the address.
 * From a digital form (`back` in the state), any Google account will do, and the proof names it for the form's pages.
 */
export async function finishVerification(request: NextRequest) {
  const url = request.nextUrl;
  const pack = stateUnpack(request.cookies.get(STATE_COOKIE)?.value);
  const expected = pack?.email ?? "";
  const back = pack?.back;
  const done = (result: string, proof?: string) => {
    const res = NextResponse.redirect(new URL(back ? `${back}?signin=${result}` : `/signin?verified=${result}`, url));
    res.cookies.delete(STATE_COOKIE);
    if (proof) res.cookies.set(back ? FORM_WHO_COOKIE : VERIFIED_COOKIE, proof, { ...COOKIE_OPTIONS, maxAge: back ? FORM_WHO_DAYS * 86_400 : VERIFIED_MINUTES * 60 });
    return res;
  };
  const db = adminDb();
  const release = () => (expected ? db.from("hub_auth_allow").delete().eq("email", expected).eq("reason", VERIFY_REASON) : Promise.resolve());

  const code = url.searchParams.get("code");
  if (!code) {
    await release();
    return done(url.searchParams.get("error") === "access_denied" ? "cancelled" : "google");
  }
  if (!pack || (!back && !expected)) return done("expired");
  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data.user;
  await release();
  if (error || !user?.email) return done("google");
  await supabase.auth.signOut({ scope: "local" });

  const email = user.email.toLowerCase();
  const state = await readState();
  if (!state.accounts.some((a) => a.email.toLowerCase() === email)) await db.auth.admin.deleteUser(user.id);
  const meta = user.user_metadata as { custom_claims?: { hd?: string }; full_name?: string; name?: string; avatar_url?: string; picture?: string };
  const google = user.identities?.find((i) => i.provider === "google")?.identity_data as { custom_claims?: { hd?: string }; email_verified?: boolean; full_name?: string; name?: string; avatar_url?: string; picture?: string } | undefined;
  const hd = (meta.custom_claims?.hd ?? google?.custom_claims?.hd ?? "").toLowerCase();
  const university = state.security.sso.domains.map((d) => d.toLowerCase()).includes(hd);
  if (back) {
    if (!google) return done("google");
    if (university) await keepDirectoryTokens(email, data.session?.provider_token, data.session?.provider_refresh_token);
    return done("ok", formWhoFor(email, (meta.full_name ?? meta.name ?? google.full_name ?? google.name ?? "").replace(/\s+/g, " ").trim(), google.avatar_url ?? google.picture ?? meta.avatar_url ?? meta.picture));
  }
  // only the University's own Google Workspace counts, not a personal Google account registered with a UST address
  if (!google || !domainAllowed(state, email) || !university) return done("not-ust");
  if (email !== expected) return done("other-account");
  return done("ok", proofFor(email));
}
