"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { STAGES, formatDate, type EvidenceItem, type EvidenceStatus } from "@/lib/data";
import { bodyOfMapping } from "@/lib/governance/catalog";
import type { BodyKey } from "@/lib/governance/types";
import { useCan, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { useReference, useViews } from "@/components/reference/ReferenceProvider";
import { Avatar, Hint } from "@/components/admin/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Sdg, Status, Swatch, cx } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { Mark, fileKind, fileSize } from "./parts";

const STAGE_ICON: IconName[] = ["inbox", "eye", "check", "layers", "flag"];
const STAGE_SHORT = ["Received", "Under review", "Accepted", "Included", "Result achieved"];

/* Rankings that commonly accept the same kind of evidence, by SDG. */
const SUGGEST: Record<number, string[]> = {
  3: ["THE Impact · SDG 3", "QS Sustainability · Social Impact", "WURI · Social Responsibility"],
  4: ["THE Impact · SDG 4", "QS Sustainability · Social Impact"],
  6: ["UI GreenMetric · Water", "QS Sustainability · Environmental Impact", "THE Impact · SDG 6"],
  7: ["UI GreenMetric · Energy and Climate Change", "THE Impact · SDG 7"],
  9: ["THE WUR · Industry", "WURI · Industrial Application"],
  10: ["THE Impact · SDG 10", "QS Sustainability · Social Impact"],
  11: ["THE Impact · SDG 11", "WURI · Social Responsibility"],
  13: ["THE Impact · SDG 13", "QS Sustainability · Environmental Impact"],
  17: ["THE Impact · SDG 17", "QS WUR · International Research Network", "THE WUR · International Outlook"],
};

export const bodiesOf = (mapped: string[]) => [...new Set(mapped.map(bodyOfMapping).filter((b): b is BodyKey => !!b))];

/** Received → Under review → Accepted → Included → Result achieved, as a stepper. */
function Journey({ stage, status }: { stage: number; status: EvidenceStatus }) {
  const flagged = status === "Needs revision";
  return (
    <ol className={cx("cv-journey", status === "For review" && "is-live")} aria-label="Progress of this submission">
      {STAGES.map((s, k) => {
        const state = k < stage ? "done" : k === stage ? (flagged ? "flag" : "now") : "next";
        return (
          <li key={s} className={`is-${state}`} aria-current={k === stage ? "step" : undefined}>
            <span className="cv-journey__dot">
              <Icon name={state === "done" ? "check" : state === "flag" ? "alert" : STAGE_ICON[k]} size={15} strokeWidth={state === "done" ? 2.6 : 2} />
            </span>
            <span className="cv-journey__label" title={s}>
              {state === "flag" ? "Needs revision" : STAGE_SHORT[k]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The impact evidence ladder: one rising step per rung, lit up to this submission's. */
function Ladder({ level, steps }: { level: number; steps: string[] }) {
  return (
    <div className="cv-ladder">
      <span className="cv-ladder__steps" aria-hidden="true">
        {steps.map((s, k) => (
          <i key={s} className={k < level ? "is-on" : undefined} style={{ ["--k" as string]: k } as CSSProperties} title={s} />
        ))}
      </span>
      <span className="cv-ladder__text">
        <b>{steps[level - 1]}</b>
        <span>
          Level {level} of {steps.length}
        </span>
      </span>
    </div>
  );
}

/**
 * One contribution in full. Accepting, returning and remapping go to the server, which checks the reviewer's
 * role and their ranking-body scope, refuses self-review, notifies the unit and writes the decision to the
 * audit log. `locked` is the Overview's preview: the same record with every decision left out.
 */
export function ContributionRecord({ item: sel, locked = false }: { item: EvidenceItem; locked?: boolean }) {
  const { evidenceLevels } = useViews();
  const ref = useReference();
  const hub = useHub();
  const viewer = useViewer();
  const can = useCan();
  const rankings = useRankings();
  const { run, pending } = useGovern();
  const tracked = useMemo(() => new Set(rankings.map((r) => r.short)), [rankings]);
  const [note, setNote] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();
  const hid = (part: string) => `${uid}-${part}`;

  const unit = hub?.units.find((u) => u.slug === sel.unitSlug);
  const target = { unitId: (sel as typeof sel & { programId?: string }).programId ?? sel.unitSlug, bodies: bodiesOf(sel.mappedTo) };
  const mayReview = can("evidence", "approve", target);
  const own = !!viewer && (sel.submittedById ? sel.submittedById === viewer.id : sel.submittedBy === viewer.name);
  const decide = !locked && mayReview && !own;
  const suggestions = useMemo(() => {
    const all = new Set(sel.sdgs.flatMap((s) => SUGGEST[s] ?? []));
    return [...all].filter((s) => !sel.mappedTo.includes(s) && tracked.has(s.split(" · ")[0]));
  }, [sel, tracked]);
  const lock: { icon: IconName; label: string; why: string } | null = !mayReview
    ? {
        icon: "lock",
        label: "View only",
        why: can("evidence", "approve") ? "Outside the ranking bodies or units you review. Another reviewer decides it." : "Your role can read submissions but not validate them.",
      }
    : own
      ? { icon: "user", label: "Your submission", why: "You sent this, so another reviewer must decide it." }
      : null;

  const act = async (cmd: Parameters<typeof run>[0], after?: () => void) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) after?.();
  };
  const accept = () => void act({ type: "evidence.review", id: sel.id, decision: "accept", note }, () => setNote(""));
  const revise = () => {
    const field = noteRef.current;
    if (!field || !formRef.current) return;
    field.setCustomValidity(note.trim() ? "" : "Say what the unit should change.");
    if (!formRef.current.reportValidity()) return;
    void act({ type: "evidence.review", id: sel.id, decision: "revise", note }, () => setNote(""));
  };

  return (
    <article className="cv-doc" aria-labelledby={hid("title")}>
      <header className="cv-doc__head">
        <div className="cv-doc__top">
          <Mark unit={unit} name={sel.unit} big />
          <div className="cv-doc__org">
            {unit ? (
              <Link href={`/admin/units/${unit.slug}`} className="cv-doc__unit">
                {sel.unit}
              </Link>
            ) : (
              <span className="cv-doc__unit">{sel.unit}</span>
            )}
            <span className="cv-doc__type">
              {sel.type} · {sel.period}
            </span>
          </div>
          <Status status={sel.status} />
        </div>
        <h2 id={hid("title")} className="cv-doc__title">
          {sel.title}
        </h2>
        <p className="cv-doc__by">
          <span className="num">{sel.id}</span>
          <span>
            Sent {formatDate(sel.submitted, { day: "numeric", month: "short", year: "numeric" })} by {sel.submittedBy}
          </span>
          {lock && (
            <span className={cx("cv-lock", own && mayReview && "is-own")}>
              <Icon name={lock.icon} size={13} />
              {lock.label}
              <Hint text={lock.why} label={lock.label} />
            </span>
          )}
        </p>
      </header>

      <Journey stage={sel.stage} status={sel.status} />

      {sel.summary && <p className="cv-doc__summary">{sel.summary}</p>}

      <div className="cv-facts">
        <section className="cv-fact cv-fact--result" aria-labelledby={hid("res")}>
          <span className="cv-fact__icon" aria-hidden="true">
            <Icon name="target" size={16} />
          </span>
          <h3 id={hid("res")} className="cv-eyebrow">
            Result
          </h3>
          <p className={cx("cv-result", !sel.result && "is-none")}>{sel.result || "Not stated yet"}</p>
          {sel.beneficiaries && (
            <p className="cv-reach">
              <Icon name="users" size={14} />
              {sel.beneficiaries}
            </p>
          )}
        </section>
        <section className="cv-fact" aria-labelledby={hid("lvl")}>
          <h3 id={hid("lvl")} className="cv-eyebrow">
            Evidence
          </h3>
          <Ladder level={sel.level} steps={evidenceLevels} />
        </section>
        <section className="cv-fact" aria-labelledby={hid("sdg")}>
          <h3 id={hid("sdg")} className="cv-eyebrow">
            SDGs
          </h3>
          <div className="cv-sdgs">
            {sel.sdgs.length ? sel.sdgs.map((n) => <Sdg key={n} n={n} withName={sel.sdgs.length === 1} />) : <span className="cv-none">None</span>}
          </div>
        </section>
      </div>

      {sel.files.length > 0 && (
        <section className="cv-sec" aria-labelledby={hid("files")}>
          <h3 id={hid("files")} className="cv-sec__title">
            Files <span className="cv-count">{sel.files.length}</span>
          </h3>
          <ul className="cv-files">
            {sel.files.map((f, i) => {
              const file = sel.attachments?.find((a) => a.name === f && !sel.files.slice(0, i).includes(f));
              const { ext, kind } = fileKind(f);
              const inner = (
                <>
                  <span className={`cv-file__ext is-${kind}`} aria-hidden="true">
                    {ext}
                  </span>
                  <span className="cv-file__name">{f}</span>
                  {file && <span className="cv-file__size">{fileSize(file.bytes)}</span>}
                  {file && !locked && <Icon name="download" size={16} className="cv-file__go" />}
                </>
              );
              return (
                <li key={`${f}-${i}`}>
                  {file && !locked ? (
                    <a className="cv-file" href={file.src} download={file.name}>
                      {inner}
                    </a>
                  ) : (
                    <span className="cv-file">{inner}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="cv-sec" aria-labelledby={hid("map")}>
        <h3 id={hid("map")} className="cv-sec__title">
          Counts toward <span className="cv-count">{sel.mappedTo.length}</span>
          <Hint text="The unit is credited in every ranking that keeps a mapping. Untick one to remove it." />
        </h3>
        <div className="cv-maps">
          {sel.mappedTo.map((m) => {
            const [head, ...rest] = m.split(" · ");
            const family = ref.rankings.find((r) => r.short === head)?.family;
            const off = !tracked.has(head);
            return (
              <label key={m} className={cx("cv-map", off && "is-off")} title={off ? "This ranking is not tracked at the moment" : undefined}>
                <input type="checkbox" checked disabled={!decide || pending} onChange={() => void act({ type: "evidence.map", id: sel.id, remove: m })} />
                {family && <Swatch family={family} />}
                <span className="cv-map__text">
                  <b>{head}</b>
                  {rest.length > 0 && <span>{rest.join(" · ")}</span>}
                </span>
                <Icon name="check" size={14} strokeWidth={2.6} className="cv-map__tick" />
              </label>
            );
          })}
        </div>
        {decide && suggestions.length > 0 && (
          <div className="cv-suggest">
            <p className="cv-suggest__label">
              <Icon name="spark" size={13} /> Also fits
            </p>
            <div className="cv-maps">
              {suggestions.map((m) => {
                const [head, ...rest] = m.split(" · ");
                const family = ref.rankings.find((r) => r.short === head)?.family;
                return (
                  <label key={m} className="cv-map cv-map--add">
                    <input type="checkbox" checked={false} disabled={pending} onChange={() => void act({ type: "evidence.map", id: sel.id, add: m })} />
                    <Icon name="plus" size={14} strokeWidth={2.4} className="cv-map__plus" />
                    {family && <Swatch family={family} />}
                    <span className="cv-map__text">
                      <b>{head}</b>
                      {rest.length > 0 && <span>{rest.join(" · ")}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="cv-sec" aria-labelledby={hid("notes")}>
        <h3 id={hid("notes")} className="cv-sec__title">
          Notes {sel.comments.length > 0 && <span className="cv-count">{sel.comments.length}</span>}
        </h3>
        {sel.comments.length > 0 && (
          <ol className="cv-thread">
            {sel.comments.map((c) => (
              <li key={c.date + c.text} className="cv-note">
                <Avatar name={c.by} size={30} />
                <div className="cv-note__body">
                  <p className="cv-note__who">
                    <b>{c.by}</b>
                    <span>
                      {c.role} · {formatDate(c.date)}
                    </span>
                  </p>
                  <p className="cv-note__text">{c.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {decide ? (
          <form ref={formRef} className="cv-compose" onSubmit={(e) => e.preventDefault()}>
            <textarea
              ref={noteRef}
              name="note"
              className="cv-compose__input"
              rows={3}
              value={note}
              placeholder="Add a note for the unit"
              aria-label="Note to the unit"
              onChange={(e) => {
                e.currentTarget.setCustomValidity("");
                setNote(e.target.value);
              }}
            />
            <div className="cv-compose__bar">
              <button type="button" className="btn btn--sm cv-compose__revise" disabled={pending} onClick={revise}>
                <Icon name="undo" size={16} /> Request revision
              </button>
              <button type="button" className="btn btn--dark btn--sm" disabled={pending || sel.status === "Validated"} onClick={accept}>
                <Icon name="check" size={16} /> Accept
              </button>
            </div>
          </form>
        ) : (
          !sel.comments.length && <p className="cv-none">No notes yet.</p>
        )}
      </section>
    </article>
  );
}
