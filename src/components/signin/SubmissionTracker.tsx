"use client";

/*
 * The Submission Tracker: someone who asked for access enters the reference code and the email they sent it
 * with, and follows the request down a vertical progress bar. While the page is open and the request is still
 * moving, it asks the Hub again every few seconds, and says so in a toast when the standing changes.
 */
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { trackAccessRequest } from "@/app/actions/session";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { normalizeReference, type Track, type TrackStatus } from "@/lib/governance/request-tracker";

/** How often an open tracker asks again. */
const POLL_MS = 10_000;

/** Standings that no longer change: the tracker stops asking. */
const SETTLED: TrackStatus[] = ["Signed in", "Not approved", "Withdrawn"];

/** What a change of standing says, as a toast. */
const NEWS: Partial<Record<TrackStatus, [string, "ok" | "error" | "info"]>> = {
  "Under review": ["Your request is now under review.", "info"],
  Approved: ["Your request was approved. You can sign in now.", "ok"],
  "Not approved": ["Your request was not approved.", "error"],
  Withdrawn: ["Your request was withdrawn.", "info"],
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });

const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function SubmissionTracker({ reference: givenRef = "", email: givenEmail = "", onSignIn }: { reference?: string; email?: string; onSignIn: () => void }) {
  const [form, setForm] = useState({ reference: givenRef, email: givenEmail });
  const [track, setTrack] = useState<Track | null>(null);
  const [checked, setChecked] = useState<Date | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef({ reference: "", email: "" });
  const last = useRef<TrackStatus | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const clearLookupError = () => {
    const reference = referenceInput.current;
    reference?.setCustomValidity(reference.value && !normalizeReference(reference.value) ? "Enter the reference code from your request, like RQ-0001." : "");
    emailInput.current?.setCustomValidity("");
  };

  const look = useCallback(async (q: { reference: string; email: string }, quiet: boolean) => {
    const r = await trackAccessRequest(q).catch(() => null);
    if (!r) {
      if (!quiet) toast("The tracker can’t reach the Hub right now. Try again in a moment.", "error");
      return;
    }
    if (!r.ok) {
      if (!quiet) {
        for (const field of ["reference", "email"] as const) {
          const message = r.errors[field];
          if (!message) continue;
          const input = field === "reference" ? referenceInput.current : emailInput.current;
          input?.setCustomValidity(message);
          input?.reportValidity();
        }
      }
      return;
    }
    if (quiet && last.current && r.track.status !== last.current) {
      const news = NEWS[r.track.status];
      if (news) toast(...news);
    }
    last.current = r.track.status;
    asked.current = q;
    setTrack(r.track);
    setChecked(new Date());
  }, []);

  // sent here straight from a request: look it up at once
  useEffect(() => {
    if (givenRef && givenEmail) start(() => look({ reference: givenRef, email: givenEmail }, false));
  }, [givenRef, givenEmail, look]);

  // keep asking while the page is in view and the request can still move
  const live = !!track && !SETTLED.includes(track.status);
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === "visible") void look(asked.current, true);
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live, look]);

  if (!track)
    return (
      <form
        className="si__form"
        onSubmit={(e) => {
          e.preventDefault();
          start(() => look(form, false));
        }}
      >
        <p className="si__sub">Enter the reference code from your request and the email you sent it with.</p>
        <label className="field">
          <span className="field__label">Reference Code</span>
          <input
            ref={referenceInput}
            className="input si__code"
            value={form.reference}
            onChange={(e) => {
              clearLookupError();
              setForm({ ...form, reference: e.target.value.toUpperCase() });
            }}
            placeholder="RQ-0001"
            pattern="\s*(?:[Rr][Qq])?[\s\-]*\d{1,6}\s*"
            title=""
            data-missing="Enter the reference code from your request, like RQ-0001."
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Email Address</span>
          <input
            ref={emailInput}
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => {
              clearLookupError();
              setForm({ ...form, email: e.target.value });
            }}
            title=""
            data-missing="Enter the email address you sent the request with."
            placeholder="name@institution.org"
            autoComplete="email"
            required
          />
        </label>
        <button type="submit" className="si__primary" disabled={pending}>
          <Icon name="search" size={16} /> {pending ? "Looking…" : "Track request"}
        </button>
      </form>
    );

  return (
    <>
      <div className="si-track__head">
        <span className="si-track__ref">
          <small>Reference</small>
          <b>{track.reference}</b>
        </span>
        <span className={`si-track__live${live ? " is-on" : ""}`} aria-live="polite">
          <i aria-hidden="true" />
          {live ? "Live" : "Final"}
          {checked && <small>· {clock(checked)}</small>}
        </span>
      </div>

      <ol className="si-track" aria-label="Request progress">
        {track.stages.map((s, i) => (
          <li
            key={s.key}
            className={`si-track__stage is-${s.state}`}
            // the bar below this stage fills once the next stage is reached
            data-on={track.stages[i + 1] && track.stages[i + 1].state !== "upcoming" ? "" : undefined}
            aria-current={s.state === "current" ? "step" : undefined}
            style={{ ["--i" as string]: i } as CSSProperties}
          >
            <span className="si-track__dot" aria-hidden="true">
              {s.state === "done" ? <Icon name="check" size={13} strokeWidth={2.6} /> : s.state === "stopped" ? <Icon name="close" size={13} strokeWidth={2.6} /> : null}
            </span>
            <div className="si-track__body">
              <b>{s.label}</b>
              {s.at && <time dateTime={s.at}>{when(s.at)}</time>}
              {s.detail && <p>{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      {track.status === "Approved" && (
        <button type="button" className="si__primary" onClick={onSignIn}>
          <Icon name="arrow" size={16} /> Go to sign in
        </button>
      )}
      <div className="si__foot">
        <span>Another request?</span>
        <button
          type="button"
          className="si__link"
          onClick={() => {
            setTrack(null);
            last.current = null;
            setForm({ reference: "", email: "" });
          }}
        >
          <Icon name="refresh" size={15} /> Track another
        </button>
      </div>
    </>
  );
}
