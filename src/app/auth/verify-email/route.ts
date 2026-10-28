import { NextResponse, type NextRequest } from "next/server";
import { formBack } from "@/lib/forms/copies";
import { domainAllowed } from "@/lib/governance/derive";
import { clean, isEmail } from "@/lib/governance/engine/core";
import { COOKIE_OPTIONS, STATE_COOKIE, VERIFY_MINUTES, VERIFY_REASON, randomToken, statePack } from "@/lib/governance/server/email-verify";
import { DIRECTORY_SIGNIN } from "@/lib/governance/server/google-directory";
import { allow, clientKey } from "@/lib/governance/server/limits";
import { siteOrigin } from "@/lib/governance/server/origin";
import { readState } from "@/lib/governance/server/store";
import { adminDb, authClient } from "@/lib/supabase/server";

/** How many verifications one network may start in an hour. */
const PER_CLIENT_HOUR = 20;

/**
 * The request form comes here, as sign-in goes to Google, with the UST email typed (lib/governance/server/email-verify.ts).
 * It goes to Google's account chooser through Supabase Auth, for that address and the University's Workspace
 * only, and comes back to /auth/callback, which knows it by the state cookie set here. A digital form's pages come
 * with `back` (the form or copy to return to); Google supplies the selected account's email.
 */
export async function GET(request: NextRequest) {
  const back = formBack(request.nextUrl.searchParams.get("back"));
  const done = (result: string) => NextResponse.redirect(new URL(back ? `${back}?signin=${result}` : `/signin?verified=${result}`, request.nextUrl));
  const email = back ? "" : clean(request.nextUrl.searchParams.get("email") ?? "").toLowerCase();
  if (!back && (!isEmail(email) || !domainAllowed(await readState(), email))) return done("not-ust");
  if (!(await allow(`verify-email:${await clientKey()}`, 3600, PER_CLIENT_HOUR, true, false))) return done("busy");

  // Let the address past Supabase's sign-in gate for the next few minutes; addresses left from abandoned tries go.
  if (!back) {
    const db = adminDb();
    await db.from("hub_auth_allow").delete().eq("reason", VERIFY_REASON).lt("created_at", new Date(Date.now() - VERIFY_MINUTES * 60_000).toISOString());
    const { error: allowError } = await db.from("hub_auth_allow").upsert({ email, reason: VERIFY_REASON }, { onConflict: "email", ignoreDuplicates: true });
    if (allowError) return done("unavailable");
  }

  // the exact callback Supabase allows; the state cookie tells it this is a verification, not a sign-in
  const callback = new URL("/auth/callback", await siteOrigin());
  const { data, error } = await (await authClient()).auth.signInWithOAuth({
    provider: "google",
    // From a form, the University directory too, for finding the people it names (server/google-directory.ts).
    options: { redirectTo: callback.toString(), ...(back && { scopes: DIRECTORY_SIGNIN.scopes }), queryParams: { prompt: "select_account", ...(back ? DIRECTORY_SIGNIN.queryParams : { login_hint: email, hd: email.split("@")[1] }) } },
  });
  if (error || !data.url) return done("unavailable");
  const res = NextResponse.redirect(data.url);
  res.cookies.set(STATE_COOKIE, statePack(randomToken(), randomToken(), email, back ?? undefined), { ...COOKIE_OPTIONS, maxAge: VERIFY_MINUTES * 60 });
  return res;
}
