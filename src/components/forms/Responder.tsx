"use client";

/*
 * A form as its responder link opens it: one step per section, a rail of the steps as a timeline under a ring of
 * how much is done, and the questions as the form's modules ask them, numbered by step (3.1, 3.2…). Answers stay on
 * this device as they're typed, so a closed tab loses nothing. Each step is its own <form>: Continue (in a bar that
 * stays in reach at the foot of the screen) lets the browser check the step in view, and the Hub's field messages
 * show what to fix. The last step reads everything back before it's signed; Submit checks every step, opens the
 * first that still needs something, and sends the response, which the server checks again by the same rules
 * (lib/forms). A receipt with the reference number takes the form's place once it's sent.
 *
 * A team copy (lib/forms/copies.ts) is the same page over the copy's answers: they're saved to the copy as people
 * type and others' changes come in every few seconds (useCopy.ts), the rail shows who else is here and, for the
 * copy's owner, Share. Once sent, the copy's link shows its receipt, where its sign-offs stand, and what it said.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { submitFormCopy } from "@/app/actions/form-copies";
import { submitFormResponse } from "@/app/actions/forms";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon, isIconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";
import { afterRowRemoved, checkAnswers, fieldShows, shownSections } from "@/lib/forms/check";
import { dayLabel, plural, stampLabel } from "@/lib/forms/format";
import { copyPath } from "@/lib/forms/copies";
import { studentPortalPath } from "@/lib/forms/kinds";
import { fieldMap, holds, moduleOf, type FormContext } from "@/lib/forms/modules";
import { PRIVACY_STATEMENTS, PRIVACY_VERSION, type PrivacyStatement } from "@/lib/forms/privacy";
import { roleWords } from "@/lib/forms/review";
import type { Answers, FormKind, Value } from "@/lib/forms/types";
import type { CopyStage, CopyView, FormWho, ResponderForm } from "@/lib/governance/hub-types";
import { AnswerSections } from "./answers";
import { useNoEmoji } from "./controls";
import { Faces, SharingSheet } from "./copy-parts";
import { FieldInput } from "./fields";
import { ago } from "./marks";
import { peerLocation } from "@/lib/forms/copies";
import { PrivacyStep } from "./PrivacyStep";
import { useAnswers, type Peer } from "./useCopy";
import { CopyLinkActions } from "./CopyLinkActions";

/** What the confirmation says, by what the form is for. */
const RECEIVED: Record<FormKind, string> = {
  survey: "Thank you for answering",
  registration: "You’re registered",
  application: "Application received",
  proposal: "Proposal received",
  evaluation: "Evaluation received",
  "terminal-report": "Terminal report received",
};

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 3 → "03": step numbers as the page sets them. */
const two = (n: number) => String(n).padStart(2, "0");

/** How much of the form is done, as a ring. */
function Ring({ share }: { share: number }) {
  const pct = Math.round(share * 100);
  return (
    <span className="fr-ring" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle className="fr-ring__track" cx="24" cy="24" r="20" pathLength={100} />
        <circle className="fr-ring__fill" cx="24" cy="24" r="20" pathLength={100} strokeDasharray={`${pct} 100`} opacity={pct ? 1 : 0} />
      </svg>
      <b>
        {pct}
        <small>%</small>
      </b>
    </span>
  );
}

/** Who else is on a step, as small faces in the rail. */
function StepPeers({ peers }: { peers: Peer[] }) {
  if (!peers.length) return null;
  return (
    <span className="fr-step__peers" title={peers.map((p) => p.name).join(", ")}>
      {peers.slice(0, 3).map((p) => (
        <i key={p.id} style={{ "--peer": p.color } as CSSProperties}>
          {p.name === "Guest" ? "" : (p.name.trim()[0] ?? "").toUpperCase()}
        </i>
      ))}
      <span className="sr-only">{peers.map((p) => p.name).join(", ")} here</span>
    </span>
  );
}

/** A receipt's heading, by where its sign-offs stand. */
function receivedTitle(kind: FormKind, stages: CopyStage[]) {
  if (stages.some((s) => s.state === "returned")) return "Returned";
  if (stages.some((s) => s.state === "declined")) return "Declined";
  if (stages.length && stages.every((s) => s.state === "done")) return "Approved";
  if (stages.some((s) => s.state === "done")) return "In review";
  return RECEIVED[kind];
}

/** The sent form: a seal, the reference on its stub, where the sign-offs stand, and what to do next. */
function Receipt({ kind, refNo, at, stages, actions, children }: { kind: FormKind; refNo: string; at: string; stages: CopyStage[]; actions: ReactNode; children?: ReactNode }) {
  const stopped = stages.find((s) => s.state === "returned" || s.state === "declined")?.state;
  return (
    <div className="fr-card fr-done" role="status" data-stopped={stopped}>
      <div className="fr-done__top">
        <span className="fr-done__seal" aria-hidden="true">
          <Icon name={stopped === "returned" ? "undo" : stopped ? "close" : "check"} size={30} strokeWidth={2.4} />
        </span>
        <h2 className="fr-done__title">{receivedTitle(kind, stages)}</h2>
        <p className="fr-done__when">Sent {stampLabel(at)}</p>
      </div>
      <p className="fr-done__ref">
        <span>Reference</span>
        <b>{refNo}</b>
        <button
          type="button"
          className="fr-done__copy"
          aria-label="Copy the reference"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(refNo);
              toast("Reference copied.", "ok");
            } catch {
              toast("Couldn’t copy. Select the reference and copy it instead.", "error");
            }
          }}
        >
          <Icon name="copy" size={15} />
        </button>
      </p>
      {stages.length > 0 && (
        <div className="fr-done__next">
          <h3>{stages.some((s) => s.state !== "next" && s.state !== "waiting") ? "Where it stands" : "What happens next"}</h3>
          <ol>
            {stages.map((s, i) => (
              <li key={i} data-state={s.state}>
                <span className="fr-done__num">
                  {s.state === "done" ? <Icon name="check" size={13} strokeWidth={2.6} /> : s.state === "returned" || s.state === "declined" ? <Icon name="close" size={13} strokeWidth={2.6} /> : i + 1}
                </span>
                <span className="fr-done__stage">
                  <b>{s.verb}</b>
                  <span>
                    {roleWords(s.role)}
                    {s.on && ` · ${dayLabel(s.on)}`}
                  </span>
                  {s.note && <q className="fr-done__note">{s.note}</q>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="fr-done__actions">{actions}</div>
      {children}
    </div>
  );
}

export function Responder({ form, copy, who, directory }: { form: ResponderForm; copy?: CopyView; who?: FormWho | null; directory?: boolean }) {
  useNoEmoji();
  const { sdgNames } = useViews();
  const fields = useMemo(() => fieldMap(form.schema.sections), [form.schema]);
  const { answers, update: setAnswers, live, setLive, flush, markSent, setHere } = useAnswers(form.code, copy, {
    name: who?.name ?? "Guest",
    avatar: who?.avatar,
    // A change typed on another page, as this one shows it: the form's own rules, as the copy is filled in.
    accept: (key, raw) => {
      const spec = fields.get(key);
      return spec && spec.type !== "note" ? { value: moduleOf(spec).clean(spec, raw, { units: form.units, answers: {}, fields, draft: true }) } : null;
    },
  });
  const [field, setField] = useState<string | null>(null);
  const [jump, setJump] = useState<{ step: number; field: string | null } | null>(null);
  const [sharing, setSharing] = useState(copy ? { label: copy.label, access: copy.access, members: copy.members ?? [] } : null);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [requests, setRequests] = useState(copy?.requests ?? []);
  const [faces, setFaces] = useState(copy?.faces ?? {});
  // Told once on arrival: people are waiting to be let in.
  useEffect(() => {
    const n = copy?.access === "private" ? (copy.requests?.length ?? 0) : 0;
    if (n) toast(n === 1 ? `${copy!.requests![0].name} asked to open this copy. Open Share to answer.` : `${n} people asked to open this copy. Open Share to answer.`, "info");
  }, [copy]);
  // Step 0, the data privacy notice, is -1: no other step opens until both statements are agreed to.
  const [consent, setConsent] = useState<PrivacyStatement[]>([]);
  const [step, setStep] = useState(-1);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ ref: string; at: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const forms = useRef<(HTMLFormElement | null)[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const trap = useRef<HTMLInputElement>(null);
  // A copy's answers live in the copy; this device keeps only its consent and the step it was on.
  const key = copy ? `hub-form:${form.code}:${copy.token}` : `hub-form:${form.code}`;
  const shared = !!copy;

  const sections = shownSections(form.schema, answers);
  const last = sections.length - 1;
  const agreed = PRIVACY_STATEMENTS.every((s) => consent.includes(s.id));
  const at = agreed ? Math.min(step, last) : -1;
  const ctx: FormContext = { units: form.units, answers, fields, sdgNames, directory: directory ? form.code : undefined };
  const peers: Peer[] = live?.peers ?? [];
  const peersIn = (step: number, id?: string) => peers.filter((p) => p.step === step && (id === undefined || p.field === id));
  const problems = useMemo(() => checkAnswers(form.schema.sections, answers, { units: form.units }).problems, [form.schema, form.units, answers]);
  const open = form.status === "open" || form.preview;

  // A draft kept on this device comes back.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const draft = raw ? (JSON.parse(raw) as { answers?: Answers; step?: number; at?: number; consent?: { version?: string; agreed?: PrivacyStatement[] } }) : null;
      // A consent given to an older notice is asked again.
      const kept = draft?.consent?.version === PRIVACY_VERSION && Array.isArray(draft.consent.agreed) ? draft.consent.agreed : [];
      setConsent(kept);
      if (shared) {
        // Agreed before on this device: back to the step it was on.
        if (kept.length === PRIVACY_STATEMENTS.length) {
          const at = Math.max(0, Number(draft?.step) || 0);
          setStep(at);
          setVisited(new Set(Array.from({ length: at + 1 }, (_, i) => i)));
        }
      } else if (draft?.answers && typeof draft.answers === "object" && Object.keys(draft.answers).length) {
        setAnswers(draft.answers);
        setStep(Math.max(0, Number(draft.step) || 0));
        setVisited(new Set(Array.from({ length: (Number(draft.step) || 0) + 1 }, (_, i) => i)));
        setSavedAt(draft.at ?? null);
        toast("Picked up where you left off.", "info");
      }
    } catch {}
    setLoaded(true);
  }, [key, shared]);

  // The others see where this page is: its step, and the question with the cursor in it.
  useEffect(() => setHere({ step: at, field }), [at, field, setHere]);

  // Wait for the destination step to render before moving keyboard focus and scrolling to its question.
  useEffect(() => {
    if (!jump || at !== jump.step) return;
    const frame = requestAnimationFrame(() => {
      const form = forms.current[jump.step];
      const question = jump.field ? Array.from(form?.querySelectorAll<HTMLElement>("[data-field]") ?? []).find((el) => el.dataset.field === jump.field) : undefined;
      const target = question ?? (jump.step < 0 ? card.current : form);
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      }
      setJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, at]);


  // And every change goes back to it, a moment after typing stops.
  useEffect(() => {
    if (!loaded || done || form.preview) return;
    const t = setTimeout(() => {
      try {
        if (shared) {
          if (consent.length) localStorage.setItem(key, JSON.stringify({ step: at, consent: { version: PRIVACY_VERSION, agreed: consent } }));
        } else if (Object.keys(answers).length || consent.length) {
          const stamp = Date.now();
          localStorage.setItem(key, JSON.stringify({ answers, step: at, at: stamp, consent: { version: PRIVACY_VERSION, agreed: consent } }));
          if (Object.keys(answers).length) setSavedAt(stamp);
        }
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [answers, consent, at, loaded, done, form.preview, key, shared]);

  const setAnswer = (id: string, v: Value | undefined) =>
    setAnswers((a) => {
      const next = { ...a };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });

  const go = (i: number) => {
    const to = Math.max(-1, Math.min(i, last));
    setJump(null);
    setStep(to);
    setField(null);
    setVisited((v) => new Set(v).add(to));
    requestAnimationFrame(() => card.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }));
  };

  const goToPerson = (person: Peer) => {
    if (!agreed) {
      go(-1);
      toast("Agree to the data privacy notice first.", "info");
      return;
    }
    const location = peerLocation(person, sections.map((s) => ({ fields: s.fields.filter((f) => fieldShows(s, f, answers, fields)) })));
    if (!location) {
      toast(`${person.name}’s editing location isn’t available yet. Try again in a moment.`, "info");
      return;
    }
    setField(null);
    setStep(location.step);
    setVisited((v) => new Set(v).add(location.step));
    setJump(location);
  };

  const send = async () => {
    setTried(true);
    if (!agreed) {
      go(-1);
      return toast("Agree to the data privacy notice first.", "error");
    }
    // Every step must pass: the first that doesn't opens, its problems marked.
    for (let i = 0; i < sections.length; i++) {
      const f = forms.current[i];
      if (f && !f.checkValidity()) {
        flushSync(() => setStep(i));
        f.reportValidity();
        return;
      }
    }
    const first = problems[0];
    if (first) {
      const i = sections.findIndex((s) => s.id === first.section);
      if (i >= 0) go(i);
      toast(`${fields.get(first.field)?.label ?? "A question"}: ${first.message}`, "error");
      return;
    }
    if (form.preview) return toast("This is a preview: nothing was sent.", "info");
    setSending(true);
    // A copy sends what it holds on the server, so every change made here goes up first.
    if (copy && !(await flush())) {
      setSending(false);
      return toast("Your latest changes aren’t saved yet. Check your connection, then send again.", "error");
    }
    const agreedTo = { version: PRIVACY_VERSION, agreed: consent };
    const unreachable = () => ({ ok: false as const, message: "The Hub could not be reached. Check your connection and try again." });
    const r = copy
      ? await submitFormCopy({ code: form.code, token: copy.token, consent: agreedTo, trap: trap.current?.value ?? "" }).catch(unreachable)
      : await submitFormResponse({ code: form.code, answers, consent: agreedTo, trap: trap.current?.value ?? "" }).catch(unreachable);
    setSending(false);
    if (!r.ok) {
      toast(r.message, "error");
      if ("section" in r && r.section === "privacy") {
        setConsent([]);
        go(-1);
        return;
      }
      const i = "section" in r && r.section ? sections.findIndex((s) => s.id === r.section) : -1;
      if (i >= 0) go(i);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {}
    if (copy) markSent({ ref: r.ref, at: r.at, stages: firstStages() });
    else setDone({ ref: r.ref, at: r.at });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }));
  };

  /** The sign-offs a response just sent goes through: the first is next. */
  const firstStages = (): CopyStage[] => form.stages.filter((s) => holds(s.showIf, answers, fields)).map((s, i) => ({ verb: s.verb, role: s.role, state: i ? "waiting" : "next" }));

  const startOver = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setAnswers({});
    setConsent([]);
    setVisited(new Set([0]));
    setTried(false);
    setSavedAt(null);
    setClearing(false);
    go(-1);
  };

  if (live?.lost) {
    return (
      <div className="fr-body fr-body--single">
        <div className="fr-card fr-shut">
          <span className="fr-shut__icon" aria-hidden="true">
            <Icon name={live.lost === "gone" ? "x-circle" : "lock-keyhole"} size={22} />
          </span>
          <h2 className="fr-shut__title">{live.lost === "gone" ? "This copy is no longer here" : "This copy is private now"}</h2>
          <p className="fr-shut__text">{live.lost === "gone" ? "Its link changed or it was removed. Ask the person who started it for its link." : "Its owner chose who can open it. Reload to sign in with an account they added."}</p>
          {live.lost !== "gone" && (
            <a className="w-btn w-btn--ink w-btn--sm" href={copyPath(form.code, copy!.token)}>
              Reload
            </a>
          )}
        </div>
      </div>
    );
  }

  if (copy && live?.sent) {
    return (
      <div className="fr-body fr-body--single">
        <CopyLinkActions code={form.code} copy={copy} beforeReplace={flush} />
        <Receipt
          kind={form.kind}
          refNo={live.sent.ref}
          at={live.sent.at}
          stages={live.sent.stages}
          actions={
            <>
              <button type="button" className="w-btn w-btn--ink w-btn--sm" onClick={() => window.print()}>
                <Icon name="download" size={16} /> Download
              </button>
              {copy.mine && (
                <a className="w-btn w-btn--light w-btn--sm fr-done__again" href={studentPortalPath(form.kind)}>
                  Back to the Student Portal
                </a>
              )}
            </>
          }
        >
          <details className="fr-readback fr-done__answers">
            <summary>
              <Icon name="eye" size={16} />
              <span>Read what was sent</span>
              <Icon name="chevron-down" size={16} className="fr-readback__chev" />
            </summary>
            <AnswerSections sections={shownSections(form.schema, answers)} ctx={ctx} />
          </details>
        </Receipt>
        <div className="fr-print" aria-hidden="true">
          <h2>{form.title}</h2>
          <p>
            {live.sent.ref} · {live.label} · {stampLabel(live.sent.at)}
          </p>
          <AnswerSections sections={shownSections(form.schema, answers)} ctx={ctx} compact />
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="fr-body fr-body--single">
        {copy && <CopyLinkActions code={form.code} copy={copy} beforeReplace={flush} />}
        <div className="fr-card fr-shut">
          <span className="fr-shut__icon" aria-hidden="true">
            <Icon name="lock" size={22} />
          </span>
          <h2 className="fr-shut__title">This form isn’t taking responses</h2>
          <p className="fr-shut__text">{form.status === "closed" && form.closesOn ? `It closed on ${dayLabel(form.closesOn)}.` : "Check with the office that shared the link."}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="fr-body fr-body--single">
        <Receipt
          kind={form.kind}
          refNo={done.ref}
          at={done.at}
          stages={firstStages()}
          actions={
            <>
              <button type="button" className="w-btn w-btn--ink w-btn--sm" onClick={() => window.print()}>
                <Icon name="download" size={16} /> Download
              </button>
              <button
                type="button"
                className="w-btn w-btn--light w-btn--sm fr-done__again"
                onClick={() => {
                  setDone(null);
                  startOver();
                }}
              >
                Send another
              </button>
            </>
          }
        />
        <div className="fr-print" aria-hidden="true">
          <h2>{form.title}</h2>
          <p>
            {done.ref} · {stampLabel(done.at)}
          </p>
          <AnswerSections sections={shownSections(form.schema, answers)} ctx={ctx} compact />
        </div>
      </div>
    );
  }

  const count = (i: number) => problems.filter((p) => p.section === sections[i]?.id).length;
  const complete = (i: number) => visited.has(i) && !count(i) && i !== at;
  const finished = sections.filter((_, i) => complete(i)).length;

  return (
    <div className="fr-body">
      {copy && <CopyLinkActions code={form.code} copy={copy} beforeReplace={flush} />}
      {form.preview && (
        <p className="fr-preview" role="status">
          <Icon name="eye" size={15} /> Preview.{" "}
          {form.copies && form.status === "open" ? "Copies of this form are built in the Student Portal, so nothing is sent here." : `${form.status === "draft" ? "This draft" : "This form"} isn’t taking responses, so nothing is sent.`}
        </p>
      )}

      <div className="fr-sidebar">
        <aside className="fr-rail" aria-label="Steps">
          <div className="fr-rail__top">
            <Ring share={finished / Math.max(1, sections.length)} />
            <span className="fr-rail__count">
              <span>
                Step {at + 1} <em>of {sections.length}</em>
              </span>
              <span className="fr-rail__now">{at < 0 ? "Data privacy" : sections[at]?.title}</span>
            </span>
          </div>
          <ol className="fr-steps">
            <li data-state={at < 0 ? "current" : "done"}>
              <button type="button" className="fr-step" data-state={at < 0 ? "current" : "done"} aria-current={at < 0 ? "step" : undefined} onClick={() => go(-1)}>
                <span className="fr-step__dot" aria-hidden="true">
                  {at < 0 ? <Icon name="shield-check" size={15} /> : <Icon name="check" size={14} strokeWidth={2.6} />}
                </span>
                <span className="fr-step__name">Data privacy</span>
                <span className="fr-step__num" aria-hidden="true">
                  00
                </span>
              </button>
            </li>
            {sections.map((s, i) => {
              const n = count(i);
              const state = i === at ? "current" : complete(i) ? "done" : tried && n ? "error" : visited.has(i) ? "seen" : "todo";
              return (
                <li key={s.id} data-state={state}>
                  <button type="button" className="fr-step" data-state={state} aria-current={i === at ? "step" : undefined} disabled={!agreed} title={agreed ? undefined : "Agree to the data privacy notice first"} onClick={() => go(i)}>
                    <span className="fr-step__dot" aria-hidden="true">
                      {state === "done" ? <Icon name="check" size={14} strokeWidth={2.6} /> : isIconName(s.icon) ? <Icon name={s.icon} size={15} /> : i + 1}
                    </span>
                    <span className="fr-step__name">{s.title}</span>
                    <StepPeers peers={peersIn(i)} />
                    {state === "error" ? (
                      <span className="fr-step__count" aria-label={plural(n, "answer")}>
                        {n}
                      </span>
                    ) : (
                      <span className="fr-step__num" aria-hidden="true">
                        {two(i + 1)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {copy && live && sharing ? (
            <div className="fr-rail__foot fr-team">
              <Faces you={who?.name ?? "You"} avatar={who?.avatar} here={peers} onGo={goToPerson} />
              <b className="fr-team__count">{peers.length ? `${peers.length + 1} here` : "Only you"}</b>
              {!copy.mine && (
                <span className="fr-team__access" title={sharing.access === "private" ? "Only the people its owner added" : "Anyone with the link"}>
                  <Icon name={sharing.access === "private" ? "lock-keyhole" : "link"} size={14} />
                </span>
              )}
              <span className="fr-saved fr-team__sync" data-on={live.sync === "saved" ? "" : undefined} data-sync={live.sync} data-live={live.realtime && live.sync !== "offline" ? "" : undefined} role="status">
                {live.realtime && live.sync !== "offline" ? <i className="fr-saved__live" aria-hidden="true" /> : <Icon name={live.sync === "offline" ? "alert" : live.sync === "saving" ? "refresh" : "check-circle"} size={14} />}
                <span>{live.sync === "offline" ? "Can’t reach the copy. Retrying…" : live.sync === "saving" ? (live.realtime ? "Live · saving…" : "Saving…") : live.realtime ? "Live · saved for your team" : "Saved for your team"}</span>
              </span>
            </div>
          ) : !copy && Object.keys(answers).length > 0 && (
            <div className="fr-rail__foot">
              {clearing ? (
                <div className="fr-clear">
                  <span>Clear every answer?</span>
                  <div className="fr-clear__actions">
                    <button type="button" onClick={() => setClearing(false)}>
                      Keep
                    </button>
                    <button type="button" className="fr-clear__yes" onClick={startOver}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="fr-link" onClick={() => setClearing(true)}>
                  <Icon name="close" size={13} /> Start over
                </button>
              )}
            </div>
          )}
        </aside>
        <nav className="fr-sidebar__actions" aria-label="Form actions">
          {copy?.mine && sharing && (
            <button type="button" className="fr-team__share" onClick={() => setSharingOpen(true)} aria-label={sharing.access === "private" && requests.length ? `Share this copy, ${requests.length} asking for access` : "Share this copy"}>
              <Icon name={sharing.access === "private" ? "lock-keyhole" : "user-plus"} size={14} />
              <span>Share</span>
              {sharing.access === "private" && requests.length > 0 && (
                <span className="fr-team__asks" title={`${requests.length} asking for access`}>
                  {requests.length}
                </span>
              )}
            </button>
          )}
          <Link href={`/f/${encodeURIComponent(form.code)}`} className="fr-team__share">
            <Icon name="home" size={14} />
            <span>Home</span>
          </Link>
        </nav>
      </div>

      <div
        ref={card}
        className="fr-main"
        onFocus={(e) => {
          // The question the cursor is in; a step's buttons count as none. Pickers open outside, so keep the last.
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field ?? null;
          setField(id);
        }}
      >
        {at < 0 && <PrivacyStep steps={sections.length} agreed={consent} maker={form.maker} onChange={setConsent} onContinue={() => go(Math.max(0, step))} />}
        {sections.map((s, i) => {
          const shown = s.fields.filter((f) => fieldShows(s, f, answers, fields));
          const questions = shown.filter((f) => f.type !== "note").length;
          return (
            <form
              key={s.id}
              ref={(el) => {
                forms.current[i] = el;
              }}
              className="fr-card fr-step-card"
              style={{ "--step": i + 1 } as CSSProperties}
              hidden={i !== at}
              aria-labelledby={`fr-title-${s.id}`}
              onSubmit={(e) => {
                e.preventDefault();
                if (i < last) go(i + 1);
                else void send();
              }}
            >
              <header className="fr-card__head">
                <span className="fr-card__eyebrow">
                  {isIconName(s.icon) && <Icon name={s.icon} size={15} />}
                  Step {i + 1} of {sections.length}
                  <span className="fr-card__dot" aria-hidden="true" />
                  {plural(questions, "question")}
                </span>
                <h2 className="fr-card__title" id={`fr-title-${s.id}`}>
                  {s.title}
                </h2>
                <span className="fr-card__num" aria-hidden="true">
                  {two(i + 1)}
                </span>
              </header>

              {i === last && i > 0 && (
                <details className="fr-readback">
                  <summary>
                    <Icon name="eye" size={16} />
                    <span>Read your answers before you sign</span>
                    <Icon name="chevron-down" size={16} className="fr-readback__chev" />
                  </summary>
                  <AnswerSections sections={sections.slice(0, last)} ctx={ctx} onEdit={(id) => go(sections.findIndex((x) => x.id === id))} />
                </details>
              )}

              <div className="fm-fields">
                {shown.map((f) => (
                  <FieldInput
                    key={f.id}
                    spec={f}
                    value={answers[f.id]}
                    onChange={(v) => setAnswer(f.id, v)}
                    ctx={ctx}
                    id={`fr-${f.id}`}
                    onRowRemoved={f.type === "table" ? (row) => setAnswers((a) => afterRowRemoved(form.schema, a, f.id, row)) : undefined}
                    peers={copy ? peersIn(i, f.id) : undefined}
                  />
                ))}
              </div>

              {i === last && <input ref={trap} className="fr-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" defaultValue="" />}

              <footer className="fr-dock">
                <button type="button" className="fr-back" onClick={() => go(i - 1)} aria-label={i > 0 ? "Back" : "Back to the data privacy notice"}>
                  <Icon name="arrow-left" size={16} />
                  <span>Back</span>
                </button>
                {live ? (
                  <span className="fr-dock__fill">
                    {live.edited && (
                      <small className="fr-dock__audit">
                        Last edit by {live.edited.by} · {ago(live.edited.at) === "today" ? new Date(live.edited.at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : ago(live.edited.at)}
                      </small>
                    )}
                  </span>
                ) : (
                  <span className="fr-saved" data-on={savedAt ? "" : undefined}>
                    <Icon name={savedAt ? "check-circle" : "hard-drive"} size={14} />
                    <span>{savedAt ? "Saved on this device" : "Saves as you type"}</span>
                  </span>
                )}
                <button type="submit" className="w-btn w-btn--ink fr-go" disabled={sending} aria-busy={sending || undefined}>
                  {i < last ? "Continue" : sending ? "Sending…" : form.preview ? "Check answers" : "Submit"}
                  <span className="fr-go__disc" aria-hidden="true">
                    <Icon name={i < last ? "arrow" : "send"} size={15} />
                  </span>
                </button>
              </footer>
            </form>
          );
        })}
      </div>

      {sharingOpen && copy && sharing && who && (
        <SharingSheet
          code={form.code}
          token={copy.token}
          owner={who}
          sharing={sharing}
          requests={requests}
          faces={faces}
          onRequests={(next, members, admitted) => {
            // Keep the photos already shown: the server's list has only those given when asking.
            setRequests(next.map((q) => ({ ...q, avatar: q.avatar ?? requests.find((p) => p.email === q.email)?.avatar })));
            // Someone let in keeps the full name and photo they asked with.
            if (admitted) setFaces((f) => ({ ...f, [admitted.email]: { name: f[admitted.email]?.name ?? admitted.name, photo: f[admitted.email]?.photo ?? admitted.avatar } }));
            if (members) setSharing((s) => s && { ...s, members });
          }}
          onSaved={(next) => {
            setSharing(next);
            setLive((l) => l && { ...l, label: next.label, access: next.access });
          }}
          onClose={() => setSharingOpen(false)}
        />
      )}
    </div>
  );
}
