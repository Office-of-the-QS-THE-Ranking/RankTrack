"use client";

/*
 * Sign-in: the University's Google Workspace (startGoogleSignIn), through Supabase Auth. Google answers at
 * /auth/callback, where the Hub applies its own checks (account status, allowed domains, active roles) and
 * sends anyone it turns away back here with the reason.
 */
import { useEffect, useState, useTransition } from "react";
import { startGoogleSignIn } from "@/app/actions/session";
import { Icon } from "@/components/ui/Icon";
import { toast, type ToastTone } from "@/components/ui/toast";
import type { RequestUnit } from "@/lib/governance/access-requests";
import { EMPTY_DRAFT, RequestAccessForm } from "./RequestAccessForm";
import { SubmissionTracker } from "./SubmissionTracker";

/** Why the last session ended (?ended=…), told once as a toast. */
const ENDED: Record<string, [string, ToastTone]> = {
  expired: ["Signed out after a period of inactivity.", "info"],
  ended: ["Your session ended.", "info"],
  suspended: ["This account is no longer active.", "error"],
  reauth: ["Please sign in again.", "info"],
  "signed-out": ["You signed out.", "ok"],
  "no-access": ["No workspace yet. Ask your unit coordinator for a role.", "info"],
};

/** Why sign-in was turned away (?error=…, from /auth/callback), told once as a toast. */
const REFUSED: Record<string, [string, ToastTone]> = {
  "not-registered": ["That account doesn’t have access to the Hub yet. Request access below.", "error"],
  pending: ["Your access request is still being reviewed. Track it below.", "info"],
  suspended: ["This account is suspended. Ask the Office to review it.", "error"],
  deactivated: ["This account is deactivated.", "error"],
  domain: ["Sign in with your UST Google account.", "error"],
  guests: ["Guest sign-in is switched off.", "error"],
  "no-role": ["This account has no active role. Its access may have expired.", "error"],
  cancelled: ["Sign-in was cancelled.", "info"],
  google: ["Google sign-in didn’t complete. Try again.", "error"],
};

type Step = "start" | "request" | "track";

/** Each step's heading: an ivory line over a gold one. */
const HEADINGS: Record<Step, [string, string]> = {
  start: ["Global Rankings", "and Impact Portal"],
  request: ["Request", "Access"],
  track: ["Submission", "Tracker"],
};

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

/** The active step keeps the sidebar's ivory and gold serif heading. */
function FlowHeading({ step = "start" }: { step?: Step }) {
  const [first, second] = HEADINGS[step];
  return (
    <h1 className="signin__display">
      <span className="signin__row">
        <span>{first}</span>
      </span>{" "}
      <span className="signin__row signin__row--gold">
        <span>{second}</span>
      </span>
    </h1>
  );
}

export function SignInFlow({
  next,
  ended,
  error,
  track,
  domains,
  units,
}: {
  next?: string;
  ended?: string;
  error?: string;
  /** A reference code from a receipt's tracker link (?track=…): the page opens on the tracker. */
  track?: string;
  /** The University's sign-in domains: a Thomasian's email must be on one. */
  domains: string[];
  /** The colleges, faculties and offices a Thomasian can name, by Directory heading. */
  units: { label: string; units: RequestUnit[] }[];
}) {
  const [step, setStep] = useState<Step>(track ? "track" : "start");
  // once the viewer has moved between steps, each new step enters at once rather than after the page's entrance
  const [moved, setMoved] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  // the request to look up when the tracker opens: from a receipt, or from its link
  const [tracking, setTracking] = useState({ reference: track ?? "", email: "" });

  const go = (to: Step) => {
    setMoved(true);
    setStep(to);
  };

  // Say it once, then drop it from the address so a reload doesn't repeat it.
  useEffect(() => {
    const why = (ended && ENDED[ended]) || (error && (REFUSED[error] ?? REFUSED.google));
    if (!why) return;
    toast(...why);
    const url = new URL(location.href);
    url.searchParams.delete("ended");
    url.searchParams.delete("error");
    history.replaceState(history.state, "", url);
  }, [ended, error]);

  const google = () => {
    start(async () => {
      const r = await startGoogleSignIn(next);
      if (r && !r.ok) toast(r.message, "info");
    });
  };

  // keyed by step, so each step enters afresh
  return (
    <>
      {step !== "start" ? (
        <div className="si__heading">
          <button
            type="button"
            className="si__back si__back--seam"
            aria-label="Back to sign in"
            title=""
            onClick={() => go("start")}
            autoFocus
          >
            <Icon name="arrow-left" size={18} />
          </button>
          <FlowHeading step={step} />
        </div>
      ) : <FlowHeading step={step} />}
    <div className="si" data-step={step} data-moved={moved || undefined} key={step}>
      {step === "start" && (
        <>
          <div className="si__actions">
            <button type="button" className="si__google" onClick={google} disabled={pending} aria-busy={pending}>
              <span className="si__google-mark">
                <GoogleMark />
              </span>
              Sign in via Institution Account
              {pending && <span className="si__spin" aria-hidden="true" />}
            </button>
            <button type="button" className="si__alt" onClick={() => go("request")}>
              <span className="si__alt-mark" aria-hidden="true">
                <Icon name="key" size={17} />
              </span>
              Request access
              <span className="si__alt-go" aria-hidden="true">
                <Icon name="arrow" size={14} strokeWidth={1.8} />
              </span>
            </button>
          </div>
          <p className="si__note">
            <Icon name="lock" size={14} />
            No separate password. Google signs you in.
          </p>
          <p className="si__note si__note--track">
            <Icon name="clock" size={14} />
            <span>
              Already submitted your request?{" "}
              <button type="button" className="si__link si__link--inline" onClick={() => go("track")}>
                Track your status here
              </button>
            </span>
          </p>
        </>
      )}

      {step === "request" && (
        <RequestAccessForm
          draft={draft}
          onDraft={setDraft}
          domains={domains}
          units={units}
          onTrack={(reference, email) => {
            setTracking({ reference, email });
            go("track");
          }}
          onSignIn={() => go("start")}
        />
      )}

      {step === "track" && <SubmissionTracker reference={tracking.reference} email={tracking.email} onSignIn={() => go("start")} />}
    </div>
    </>
  );
}
