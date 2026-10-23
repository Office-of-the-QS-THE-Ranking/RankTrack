"use client";

/*
 * Sign-in: University Google Workspace (startGoogleSignIn), then a second factor where the security policy
 * asks for one. Until Google is connected, the portal demo (DemoSignIn) opens in its own modal, apart from
 * this flow; the Hub applies the real checks either way: account status, allowed domains, active roles,
 * two-step verification and the lockout policy.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { requestAccess, signOut, startGoogleSignIn } from "@/app/actions/session";
import { DemoSignIn, Head, type ChooserAccount } from "@/components/signin/DemoSignIn";
import { Icon } from "@/components/ui/Icon";
import { toast, type ToastTone } from "@/components/ui/toast";

export type { ChooserAccount };

/** Why the last session ended (?ended=…), told once as a toast. */
const ENDED: Record<string, [string, ToastTone]> = {
  expired: ["Signed out after a period of inactivity.", "info"],
  ended: ["Your session ended.", "info"],
  suspended: ["This account is no longer active.", "error"],
  reauth: ["Please sign in again.", "info"],
  "signed-out": ["You signed out.", "ok"],
  "no-access": ["No workspace yet. Ask your unit coordinator for a role.", "info"],
};

type Step = "start" | "request";

/** Google's "G", on the Workspace button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function SignInFlow({
  accounts,
  next,
  ended,
  units,
  current,
}: {
  accounts: ChooserAccount[];
  next?: string;
  ended?: string;
  units: { id: string; name: string }[];
  current: { name: string; role: string; workspaces: string[] } | null;
}) {
  const [step, setStep] = useState<Step>("start");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [req, setReq] = useState({ name: "", email: "", unitId: "", title: "", justification: "" });
  const [sent, setSent] = useState("");

  const go = (to: Step) => setStep(to);

  // Say it once, then drop it from the address so a reload doesn't repeat it.
  useEffect(() => {
    const why = ended && ENDED[ended];
    if (!why) return;
    toast(...why);
    const url = new URL(location.href);
    url.searchParams.delete("ended");
    history.replaceState(history.state, "", url);
  }, [ended]);

  const [demo, setDemo] = useState(false);
  const closeDemo = useCallback(() => setDemo(false), []);

  const google = () => {
    start(async () => {
      const r = await startGoogleSignIn(next);
      if (r && !r.ok) toast(r.message, "info");
    });
  };

  if (current && step === "start") {
    return (
      <div className="si" data-step="signed-in">
        <div className="si__intro">
          <h1 className="signin__title">Welcome back</h1>
          <p className="si__sub">
            {current.name} · {current.role}
          </p>
        </div>
        <div className="signin__choices">
          {current.workspaces.includes("office") && (
            <Link href="/admin" className="signin__choice signin__choice--dark">
              <span className="signin__icon">
                <Icon name="dashboard" />
              </span>
              <span>
                <b>Office workspace</b>
                <span>Dashboards, rankings and reports</span>
              </span>
              <Icon name="arrow" />
            </Link>
          )}
          {current.workspaces.includes("portal") && (
            <Link href="/portal" className="signin__choice signin__choice--gold">
              <span className="signin__icon">
                <Icon name="contribute" />
              </span>
              <span>
                <b>Contributor workspace</b>
                <span>Requirements and submissions</span>
              </span>
              <Icon name="arrow" />
            </Link>
          )}
        </div>
        <form action={signOut} className="si__foot">
          <span>Not you?</span>
          <button type="submit" className="si__link">
            <Icon name="swap" size={15} /> Use another account
          </button>
        </form>
      </div>
    );
  }

  // keyed by step, so each step enters afresh
  return (
    <div className="si" data-step={step} key={step}>
      {step === "start" && (
        <>
          <div className="si__intro">
            <h1 className="signin__title">Sign in</h1>
            <p className="si__sub">Use your UST Google account.</p>
          </div>
          <button type="button" className="si__google" onClick={google} disabled={pending} aria-busy={pending}>
            <span className="si__google-mark">
              <GoogleMark />
            </span>
            Log in with Google
            {pending && <span className="si__spin" aria-hidden="true" />}
          </button>
          <p className="si__or" aria-hidden="true">
            or
          </p>
          <button type="button" className="si__alt" onClick={() => setDemo(true)}>
            <Icon name="play" size={15} /> Open the portal demo
          </button>
          <DemoSignIn open={demo} onClose={closeDemo} accounts={accounts} next={next} />
          <div className="si__foot">
            <span>New to the Hub?</span>
            <button type="button" className="si__link" onClick={() => go("request")}>
              Request access <Icon name="arrow" size={14} />
            </button>
          </div>
        </>
      )}

      {step === "request" && (
        <>
          <Head
            title="Request access"
            back="Back to sign in"
            onBack={() => {
              go("start");
              setSent("");
            }}
          />
          {sent ? (
            <div className="si__done" role="status">
              <span className="si__done-mark" aria-hidden="true">
                <Icon name="check" size={22} />
              </span>
              <p>{sent}</p>
            </div>
          ) : (
            <form
              className="si__form"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await requestAccess(req);
                  if (r.ok) setSent(r.message);
                  else toast(r.message, "error");
                });
              }}
            >
              <p className="si__sub">An administrator reviews each request.</p>
              <div className="si__pair">
                <label className="field">
                  <span className="field__label">Full name</span>
                  <input className="input" value={req.name} onChange={(e) => setReq({ ...req, name: e.target.value })} autoComplete="name" required />
                </label>
                <label className="field">
                  <span className="field__label">
                    Position <em>Optional</em>
                  </span>
                  <input className="input" value={req.title} onChange={(e) => setReq({ ...req, title: e.target.value })} autoComplete="organization-title" />
                </label>
              </div>
              <label className="field">
                <span className="field__label">UST email</span>
                <input
                  className="input"
                  type="email"
                  value={req.email}
                  onChange={(e) => setReq({ ...req, email: e.target.value })}
                  placeholder="name@ust.edu.ph"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Unit</span>
                <select className="select" value={req.unitId} onChange={(e) => setReq({ ...req, unitId: e.target.value })} required>
                  <option value="">Choose your unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Reason</span>
                <textarea
                  className="textarea"
                  rows={3}
                  value={req.justification}
                  onChange={(e) => setReq({ ...req, justification: e.target.value })}
                  placeholder="What do you need access for?"
                  required
                />
              </label>
              <button type="submit" className="si__primary" disabled={pending}>
                <Icon name="send" size={16} /> {pending ? "Sending…" : "Send request"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
