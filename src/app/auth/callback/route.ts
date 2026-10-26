import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, STAY_COOKIE } from "@/lib/governance/server/session";
import { completeSignIn, deviceOf, safeNext } from "@/lib/governance/server/signin";
import { adminDb, authClient } from "@/lib/supabase/server";
import { STATE_COOKIE } from "@/lib/governance/server/email-verify";
import { finishVerification } from "./verify";

/**
 * Where Google sends people back, through Supabase Auth. The code becomes a verified Google identity, the
 * Hub decides whether that person may come in, and it opens its own session. The Supabase session is only
 * the proof of who signed in, so it is closed at once: the Hub's session, with its timeout and revocation
 * policies, is the one that counts.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // the request form's email check comes back here too (the one address Supabase lets Google return to)
  if (request.cookies.has(STATE_COOKIE)) return finishVerification(request);
  const next = safeNext(url.searchParams.get("next") ?? undefined);
  // "Keep me signed in" from the sign-in screen: read once, whatever the outcome
  const kept = request.cookies.get(STAY_COOKIE)?.value;
  const stay = kept === "1" ? true : kept === "0" ? false : undefined;
  const back = (error: string) => {
    const to = new URL("/signin", url);
    to.searchParams.set("error", error);
    if (next) to.searchParams.set("next", next);
    const res = NextResponse.redirect(to);
    res.cookies.delete(STAY_COOKIE);
    return res;
  };

  const code = url.searchParams.get("code");
  if (!code) {
    // The sign-in gate (supabase/migrations/20261026200000_sign_in_gate.sql) refuses with "hub:<reason>".
    const gate = /hub:(not-registered|pending)\b/.exec(url.searchParams.get("error_description") ?? "")?.[1];
    return back(gate ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "google"));
  }
  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data.user;
  if (error || !user?.email || !user.identities?.some((i) => i.provider === "google")) return back("google");
  await supabase.auth.signOut({ scope: "local" });

  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string; picture?: string; custom_claims?: { hd?: string } };
  const google = user.identities?.find((i) => i.provider === "google")?.identity_data as { custom_claims?: { hd?: string } } | undefined;
  const hd = meta.custom_claims?.hd ?? google?.custom_claims?.hd;
  const r = await completeSignIn({ email: user.email, name: meta.full_name ?? meta.name, avatar: meta.avatar_url ?? meta.picture, device: deviceOf(request.headers.get("user-agent") ?? ""), next, hd, stay });
  if (!r.ok) {
    // Someone the Hub has never heard of leaves nothing behind in Supabase Auth either.
    if (r.why === "not-registered" || r.why === "pending") await adminDb().auth.admin.deleteUser(user.id);
    return back(r.why);
  }
  const res = NextResponse.redirect(new URL(r.dest, url));
  res.cookies.set(SESSION_COOKIE, r.token, r.staySeconds ? { ...SESSION_COOKIE_OPTIONS, maxAge: r.staySeconds } : SESSION_COOKIE_OPTIONS);
  res.cookies.delete(STAY_COOKIE);
  return res;
}
