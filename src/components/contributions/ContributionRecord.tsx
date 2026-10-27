"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { STAGES, formatDate, type EvidenceItem, type EvidenceStatus } from "@/lib/data";
import { bodyOfMapping } from "@/lib/governance/catalog";
import { EVIDENCE_FILE_KINDS, type EvidenceFileKind } from "@/lib/governance/evidence-files";
import type { BodyKey } from "@/lib/governance/types";
import { useCan, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { useReference, useViews } from "@/components/reference/ReferenceProvider";
import { Avatar, Hint } from "@/components/admin/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented, TabPanel, Tabs } from "@/components/ui/interactive";
import { Status, Swatch, cx } from "@/components/ui/primitives";
import { RichText } from "@/components/ui/RichText";
import { isRich, plainText } from "@/lib/rich-text";
import { toast } from "@/components/ui/toast";
import { KIND, Mark, SUBMISSION_TABS, fileKind, fileSize, filesOf, hostOf, linksOf, splitReach, splitResult, type ShownFile, type SubmissionTab as Tab } from "./parts";

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

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** Received → Under review → Accepted → Included → Result achieved, as a stepper. */
function Journey({ stage, status }: { stage: number; status: EvidenceStatus }) {
  const flagged = status === "Needs revision";
  return (
    <ol className={cx("cv-journey", status === "For review" && "is-live")} aria-label="Progress of this submission" style={{ ["--at" as string]: Math.min(stage, STAGES.length - 1) } as CSSProperties}>
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
    <span className="cv-ladder">
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
    </span>
  );
}

/** A part with nothing in it: a mark and a few words. */
function Blank({ icon, title, sub }: { icon: IconName; title: string; sub?: string }) {
  return (
    <div className="cv-blank">
      <span className="cv-blank__art" aria-hidden="true">
        <Icon name={icon} size={24} strokeWidth={1.6} />
      </span>
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/** A web address as a reader scans it: the site in full, the rest of the address quieter. */
function Address({ url }: { url: string }) {
  const { host, rest } = hostOf(url);
  return (
    <span className="cv-addr">
      {host}
      {rest && <span>{rest}</span>}
    </span>
  );
}

function FileCard({ file, locked }: { file: ShownFile; locked: boolean }) {
  const { ext, kind } = fileKind(file.name);
  const inner = (
    <>
      <span className={`cv-file__ext is-${kind}`} aria-hidden="true">
        {ext}
      </span>
      <span className="cv-file__text">
        <span className="cv-file__name">{file.name}</span>
        <span className="cv-file__meta">
          {file.kind}
          {file.bytes !== undefined && ` · ${fileSize(file.bytes)}`}
        </span>
      </span>
      {file.src && !locked && <Icon name="download" size={16} className="cv-file__go" />}
    </>
  );
  return file.src && !locked ? (
    <a className="cv-file" href={file.src} download={file.name} title={`Download ${file.name}`}>
      {inner}
    </a>
  ) : (
    <span className="cv-file">{inner}</span>
  );
}

/**
 * One contribution in full, in four tabs: the Overview (where it stands, its background and its figures), the
 * narrative, the evidence (files by kind, links and how it was verified) and the references it cites. Accepting,
 * returning and remapping go to the server, which checks the reviewer's role and their ranking-body scope, refuses
 * self-review, notifies the unit and writes the decision to the audit log. `locked` is the Overview's preview: the
 * same record with every decision left out.
 */
export function ContributionRecord({ item: sel, locked = false }: { item: EvidenceItem; locked?: boolean }) {
  const { evidenceLevels, sdgNames, sdgIcons } = useViews();
  const ref = useReference();
  const hub = useHub();
  const viewer = useViewer();
  const can = useCan();
  const rankings = useRankings();
  const { run, pending } = useGovern();
  const tracked = useMemo(() => new Set(rankings.map((r) => r.short)), [rankings]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [shownKind, setShownKind] = useState<"All" | EvidenceFileKind>("All");
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

  const files = useMemo(() => filesOf(sel), [sel]);
  const links = useMemo(() => linksOf(sel), [sel]);
  const refs = sel.references ?? [];
  const groups = EVIDENCE_FILE_KINDS.map((kind) => ({ kind, items: files.filter((f) => f.kind === kind) })).filter((g) => g.items.length);
  const story = sel.summary ? plainText(sel.summary).trim() : "";
  const words = story ? story.split(/\s+/).length : 0;
  const { figure, measure } = splitResult(sel.result);
  const reach = splitReach(sel.beneficiaries, sel.verifiedBy);
  const sentBack = sel.status === "Needs revision" ? sel.comments.at(-1) : undefined;
  const evidenceCount = files.length + links.length;

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

  const tabsId = hid("tabs");

  /* ---------- Overview: where it stands, why it was done, and its figures ---------- */
  const overview = (
    <>
      <Journey stage={sel.stage} status={sel.status} />

      {sentBack && (
        <aside className="cv-callout" aria-label="What to change">
          <Icon name="undo" size={16} />
          <span>
            <b>Sent back by {sentBack.by}</b>
            {sentBack.text}
          </span>
        </aside>
      )}

      {sel.background ? (
        <section className="cv-block" aria-labelledby={hid("bg")}>
          <h3 id={hid("bg")} className="cv-eyebrow">
            Background
          </h3>
          <p className="cv-lede">{sel.background}</p>
        </section>
      ) : (
        story && (
          <section className="cv-block" aria-labelledby={hid("bg")}>
            <h3 id={hid("bg")} className="cv-eyebrow">
              Summary
            </h3>
            <p className="cv-lede cv-lede--clip">{story}</p>
            <button type="button" className="cv-more" onClick={() => setTab("Narrative")}>
              Read the narrative <Icon name="arrow" size={14} />
            </button>
          </section>
        )
      )}

      <div className="cv-facts">
        <section className="cv-card cv-card--gold" aria-labelledby={hid("res")}>
          <span className="cv-card__icon" aria-hidden="true">
            <Icon name="target" size={16} />
          </span>
          <h3 id={hid("res")} className="cv-eyebrow">
            Result
          </h3>
          {sel.result ? (
            <p className="cv-figure">
              {figure && <b className="num">{figure}</b>}
              {measure && <span>{measure}</span>}
            </p>
          ) : (
            <p className="cv-none">Not stated yet</p>
          )}
        </section>

        <section className="cv-card" aria-labelledby={hid("who")}>
          <span className="cv-card__icon cv-card__icon--soft" aria-hidden="true">
            <Icon name="users" size={16} />
          </span>
          <h3 id={hid("who")} className="cv-eyebrow">
            Beneficiaries
          </h3>
          {reach.who || reach.count ? (
            <p className={cx("cv-figure", "cv-figure--sm", !reach.count && "is-words")}>
              {reach.count && <b className="num">{reach.count}</b>}
              {reach.who && <span>{reach.who}</span>}
            </p>
          ) : (
            <p className="cv-none">Not stated</p>
          )}
        </section>

        <button type="button" className="cv-card cv-card--go" onClick={() => setTab("Evidence")}>
          <span className="cv-eyebrow">Evidence</span>
          <Ladder level={sel.level} steps={evidenceLevels} />
          <span className="cv-card__foot">
            {evidenceCount ? [files.length ? plural(files.length, "file") : "", links.length ? plural(links.length, "link") : ""].filter(Boolean).join(" · ") : "Nothing attached"}
            <Icon name="chevron" size={14} />
          </span>
        </button>

        <section className="cv-card" aria-labelledby={hid("sdg")}>
          <h3 id={hid("sdg")} className="cv-eyebrow">
            SDGs
          </h3>
          {sel.sdgs.length ? (
            <div className={cx("cv-goals", sel.sdgs.length === 1 && "is-one")}>
              {sel.sdgs.map((n) => (
                <span key={n} className="cv-goal" title={`SDG ${n} · ${sdgNames[n] ?? ""}`}>
                  <img src={sdgIcons[n]} alt={`SDG ${n}: ${sdgNames[n] ?? ""}`} width={48} height={48} loading="lazy" draggable={false} />
                  {sel.sdgs.length === 1 && <span>{sdgNames[n]}</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="cv-none">None</p>
          )}
        </section>
      </div>

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

      {sel.comments.length > 0 && (
        <section className="cv-sec" aria-labelledby={hid("notes")}>
          <h3 id={hid("notes")} className="cv-sec__title">
            Notes <span className="cv-count">{sel.comments.length}</span>
          </h3>
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
        </section>
      )}
    </>
  );

  /* ---------- Narrative: what the unit did, as they wrote it ---------- */
  const narrative = story ? (
    <article className="cv-narr" aria-label="Narrative">
      <p className="cv-narr__meta">
        <Icon name="clock" size={14} />
        {Math.max(1, Math.round(words / 200))} min read · {plural(words, "word")}
      </p>
      {isRich(sel.summary) ? (
        <div className="cv-narr__body rt">
          <RichText html={sel.summary} />
        </div>
      ) : (
        <p className="cv-narr__body">{sel.summary}</p>
      )}
    </article>
  ) : (
    <Blank icon="pen" title="No narrative" sub="The unit didn’t write one." />
  );

  /* ---------- Evidence: how strong it is, how it was checked, then the files by kind and the links ---------- */
  const evidence = (
    <>
      <div className="cv-facts">
        <section className="cv-card" aria-labelledby={hid("lvl")}>
          <h3 id={hid("lvl")} className="cv-eyebrow">
            Strength
          </h3>
          <Ladder level={sel.level} steps={evidenceLevels} />
        </section>
        <section className="cv-card" aria-labelledby={hid("ver")}>
          <span className="cv-card__icon cv-card__icon--soft" aria-hidden="true">
            <Icon name="shield-check" size={16} />
          </span>
          <h3 id={hid("ver")} className="cv-eyebrow">
            How it was verified
          </h3>
          {reach.verified ? <p className="cv-verified">{reach.verified}</p> : <p className="cv-none">Not stated</p>}
        </section>
      </div>

      {groups.length > 0 && (
        <section className="cv-sec" aria-labelledby={hid("files")}>
          <h3 id={hid("files")} className="cv-sec__title">
            Files <span className="cv-count">{files.length}</span>
          </h3>
          {groups.length > 1 && (
            <Segmented
              variant="pills"
              className="cv-kinds"
              label="Show files by kind"
              value={shownKind}
              onChange={setShownKind}
              options={[
                { value: "All", label: "All", count: files.length },
                ...groups.map((g) => ({
                  value: g.kind,
                  label: (
                    <>
                      <Icon name={KIND[g.kind].icon} size={14} />
                      {KIND[g.kind].many}
                    </>
                  ),
                  count: g.items.length,
                })),
              ]}
            />
          )}
          <ul className="cv-files">
            {files.map((f, i) =>
              shownKind === "All" || f.kind === shownKind ? (
                <li key={`${f.name}-${i}`}>
                  <FileCard file={f} locked={locked} />
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      {links.length > 0 && (
        <section className="cv-sec" aria-labelledby={hid("links")}>
          <h3 id={hid("links")} className="cv-sec__title">
            Links <span className="cv-count">{links.length}</span>
          </h3>
          <ul className="cv-links">
            {links.map((l) => {
              const inner = (
                <>
                  <span className="cv-link__icon" aria-hidden="true">
                    <Icon name="globe" size={17} />
                  </span>
                  <span className="cv-link__text">
                    <b>{l.label || hostOf(l.url).host}</b>
                    <Address url={l.url} />
                  </span>
                  {!locked && <Icon name="external" size={15} className="cv-link__go" />}
                </>
              );
              return (
                <li key={l.url}>
                  {locked ? (
                    <span className="cv-link">{inner}</span>
                  ) : (
                    <a className="cv-link" href={l.url} target="_blank" rel="noopener noreferrer">
                      {inner}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!evidenceCount && <Blank icon="paperclip" title="Nothing attached" />}
    </>
  );

  /* ---------- References: what the submission cites ---------- */
  const references = refs.length ? (
    <ol className="cv-refs" aria-label="References">
      {refs.map((r, i) => (
        <li key={`${r.title}-${i}`} className="cv-ref">
          <span className="cv-ref__n num" aria-hidden="true">
            {i + 1}
          </span>
          <div className="cv-ref__body">
            <p className="cv-ref__title">{r.title}</p>
            {r.source && <p className="cv-ref__source">{r.source}</p>}
            {r.url &&
              (locked ? (
                <span className="cv-ref__url">
                  <Icon name="link" size={13} />
                  <Address url={r.url} />
                </span>
              ) : (
                <a className="cv-ref__url" href={r.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="link" size={13} />
                  <Address url={r.url} />
                </a>
              ))}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <Blank icon="quote" title="No references" sub="Nothing cited yet." />
  );

  const panes: Record<Tab, ReactNode> = { Overview: overview, Narrative: narrative, Evidence: evidence, References: references };

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

      <div className="cv-tabbar">
        <Tabs
          tabs={SUBMISSION_TABS.map((t) => ({
            key: t,
            label: t,
            count: t === "Evidence" ? evidenceCount || undefined : t === "References" ? refs.length || undefined : undefined,
          }))}
          value={tab}
          onChange={setTab}
          label="Parts of this submission"
          idBase={tabsId}
        />
      </div>

      <TabPanel idBase={tabsId} index={SUBMISSION_TABS.indexOf(tab)} className="cv-tab">
        <div key={tab} className="cv-pane">
          {panes[tab]}
        </div>
      </TabPanel>

      {decide && (
        <form ref={formRef} className="cv-dock" onSubmit={(e) => e.preventDefault()}>
          <textarea
            ref={noteRef}
            name="note"
            className="cv-dock__input"
            rows={1}
            value={note}
            placeholder="Add a note for the unit"
            aria-label="Note to the unit"
            onChange={(e) => {
              e.currentTarget.setCustomValidity("");
              setNote(e.target.value);
            }}
          />
          <div className="cv-dock__actions">
            <button type="button" className="btn btn--sm cv-dock__revise" disabled={pending} onClick={revise}>
              <Icon name="undo" size={16} /> Request revision
            </button>
            <button type="button" className="btn btn--dark btn--sm" disabled={pending || sel.status === "Validated"} onClick={accept}>
              <Icon name="check" size={16} /> Accept
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
