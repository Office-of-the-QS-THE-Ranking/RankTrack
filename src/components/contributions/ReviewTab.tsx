"use client";

/*
 * The Review tab of a submission's record, for the people who validate it (docs/evidence-review.md). Each file is
 * read in this browser (its own text first, OCR for scans) and only the text is sent. Rules then suggest the
 * indicators the pages support, with the terms found, a sentence to read and any figures; they also check the SDGs
 * the unit chose, the year, and copies among other submissions. Accepting a suggestion links the evidence to the
 * indicator; a figure chosen with it is only offered beside that indicator. The AI check, when the Office has turned
 * it on, gives a second opinion on the open suggestions and decides nothing.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { addReviewTerm, decideFinding, forgetReading, openReview, removeReviewTerm, reviewTerms, sendPages, startReading } from "@/app/actions/review";
import { Hint } from "@/components/command-control/ui";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { cx } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import type { EvidenceItem } from "@/lib/data";
import { batches, readEvidenceFile, ReadError, type ReadProgress } from "@/lib/review/extract/browser";
import { pagesLabel } from "@/lib/review/files";
import { pageRanges } from "@/lib/review/text";
import type { FindingStatus, FindingView, ReviewDesk, ReviewFile, TermView, Verdict } from "@/lib/review/types";
import { fileKind } from "./parts";
import { usePending } from "@/components/ui/ButtonBusy";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

const UNIT_WORD = { page: "page", part: "part", slide: "slide", image: "image" } as const;

const VERDICT: Record<Verdict, { label: string; tone: string; icon: IconName }> = {
  supports: { label: "Supports it", tone: "ok", icon: "check-circle" },
  partial: { label: "Partly", tone: "review", icon: "minus" },
  no: { label: "Doesn’t support it", tone: "revise", icon: "x-circle" },
  unverified: { label: "Couldn’t confirm", tone: "missing", icon: "help" },
};

type TermScope = { key: string; title: string; sdg?: number; ranking?: string; code?: string };

/** What a file says of itself once read: "86 pages · 12 by OCR". */
function readLine(f: ReviewFile) {
  const what = f.unit === "image" ? "Read by OCR" : plural(f.pages, UNIT_WORD[f.unit]);
  return f.unit !== "image" && f.ocrPages ? `${what} · ${f.ocrPages} by OCR` : what;
}

function progressLine(p: ReadProgress) {
  if (p.phase === "open") return "Opening";
  if (p.phase === "text") return `Reading ${p.done} of ${p.total}`;
  return p.total > 1 ? `OCR ${p.done} of ${p.total}` : "OCR";
}

/** The words and phrases the rules look for, for an SDG or an indicator, with a field to add one. */
function Terms({ scope, evidenceId, canEdit, onDesk, onClose }: { scope: TermScope; evidenceId: string; canEdit: boolean; onDesk: (d: ReviewDesk) => void; onClose: () => void }) {
  const [terms, setTerms] = useState<TermView[] | null>(null);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  usePending(busy);
  const target = useMemo(() => (scope.sdg !== undefined ? { sdg: scope.sdg } : { ranking: scope.ranking, code: scope.code }), [scope]);

  useEffect(() => {
    let live = true;
    setTerms(null);
    void reviewTerms(target).then((r) => {
      if (!live) return;
      if (r.ok) setTerms(r.data ?? []);
      else toast(r.message, "error");
    });
    return () => {
      live = false;
    };
  }, [target]);

  const after = (r: Awaited<ReturnType<typeof addReviewTerm>>) => {
    setBusy(false);
    toast(r.message, r.ok ? "ok" : "error");
    if (!r.ok || !r.data) return false;
    setTerms(r.data.terms);
    if (r.data.desk) onDesk(r.data.desk);
    return true;
  };
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    if (after(await addReviewTerm({ ...target, term, evidenceId }))) setTerm("");
  };
  const remove = async (id: string) => {
    setBusy(true);
    after(await removeReviewTerm({ id, evidenceId }));
  };

  return (
    <div className="rv-terms" role="group" aria-label={`Terms for ${scope.title}`}>
      <p className="rv-terms__head">
        <b>{scope.title}</b>
        <Hint text="Words and phrases the rules look for, on top of the indicator’s own name and guidance. Adding one checks this submission again." label="About terms" />
        <button type="button" className="rv-x" aria-label="Close terms" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </p>
      {terms === null ? (
        <p className="rv-muted">Loading…</p>
      ) : terms.length ? (
        <ul className="rv-chips">
          {terms.map((t) => (
            <li key={t.id} className="rv-chip" title={`Added by ${t.by}`}>
              {t.term}
              {canEdit && (
                <button type="button" className="rv-chip__x" aria-label={`Remove ${t.term}`} disabled={busy} onClick={() => void remove(t.id)}>
                  <Icon name="close" size={11} strokeWidth={2.4} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rv-muted">No added terms yet.</p>
      )}
      {canEdit && (
        <form className="rv-terms__add" onSubmit={add}>
          <input className="input input--sm" value={term} onChange={(e) => setTerm(e.target.value)} required minLength={2} maxLength={80} placeholder="Add a word or phrase" aria-label="New term" data-missing="Enter a word or phrase." />
          <button type="submit" className="btn btn--sm" disabled={busy}>
            <Icon name="plus" size={15} /> Add
          </button>
        </form>
      )}
    </div>
  );
}

export function ReviewTab({ item }: { item: EvidenceItem }) {
  const { sdgNames, sdgIcons } = useViews();
  const [desk, setDesk] = useState<ReviewDesk | null>(null);
  const [failed, setFailed] = useState("");
  const [progress, setProgress] = useState<Record<string, ReadProgress>>({});
  const [show, setShow] = useState<FindingStatus>("suggested");
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState("");
  usePending(busy);
  const [checking, setChecking] = useState(false);
  usePending(checking);
  const [scope, setScope] = useState<TermScope | null>(null);
  const stop = useRef<AbortController | null>(null);
  const id = item.id;

  useEffect(() => {
    let live = true;
    setDesk(null);
    setFailed("");
    void openReview(id).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setDesk(r.data);
      else setFailed(r.ok ? "The review couldn’t be opened." : r.message);
    });
    return () => {
      live = false;
      // Leaving the record stops a read in progress: nothing half-read is kept.
      stop.current?.abort();
    };
  }, [id]);

  const reading = Object.keys(progress).length > 0;

  const read = useCallback(
    async (file: ReviewFile, signal: AbortSignal) => {
      const step = (p: ReadProgress) => setProgress((all) => ({ ...all, [file.src]: p }));
      step({ phase: "open", done: 0, total: 1 });
      try {
        const started = await startReading({ evidenceId: id, src: file.src });
        if (!started.ok) return toast(started.message, "error");
        if (started.data?.cached) {
          if (started.data.desk) setDesk(started.data.desk);
          return;
        }
        const result = await readEvidenceFile(file.src, file.name, step, signal);
        const sets = batches(result.pages);
        for (let i = 0; i < sets.length; i++) {
          if (signal.aborted) return;
          const sent = await sendPages({ evidenceId: id, src: file.src, pages: sets[i], last: i === sets.length - 1, truncated: result.truncated });
          if (!sent.ok) return toast(sent.message, "error");
          if (sent.data) setDesk(sent.data);
        }
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        toast(e instanceof ReadError ? e.message : `${file.name} couldn’t be read.`, "error");
      } finally {
        setProgress((all) => {
          const { [file.src]: _done, ...rest } = all;
          return rest;
        });
      }
    },
    [id],
  );

  /** One file after another: OCR already uses the computer's spare cores for a single file. */
  const readFiles = async (files: ReviewFile[]) => {
    if (reading) return;
    const controller = new AbortController();
    stop.current = controller;
    for (const f of files) {
      if (controller.signal.aborted) break;
      await read(f, controller.signal);
    }
    if (!controller.signal.aborted && files.length) toast(files.length > 1 ? "Files read." : "File read.", "ok");
    stop.current = null;
  };

  const act = async (key: string, work: Promise<{ ok: boolean; message: string; data?: ReviewDesk }>) => {
    setBusy(key);
    const r = await work;
    setBusy("");
    if (r.message) toast(r.message, r.ok ? "ok" : "error");
    if (r.ok && r.data) setDesk(r.data);
    return r.ok;
  };

  const check = async (files: ReviewFile[]) => {
    setChecking(true);
    for (const f of files) {
      try {
        const res = await fetch("/api/review/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId: id, src: f.src }) });
        const r = (await res.json()) as { ok: boolean; message: string; data?: ReviewDesk };
        toast(r.message, r.ok ? "ok" : "error");
        if (r.ok && r.data) setDesk(r.data);
        if (!r.ok) break;
      } catch {
        toast("The AI check couldn’t be reached. Try again in a moment.", "error");
        break;
      }
    }
    setChecking(false);
  };

  if (failed) {
    return (
      <div className="cv-blank">
        <span className="cv-blank__art" aria-hidden="true">
          <Icon name="lock" size={24} strokeWidth={1.6} />
        </span>
        <b>Review isn’t open</b>
        <span>{failed}</span>
      </div>
    );
  }
  if (!desk) {
    return (
      <div className="rv-loading" role="status" aria-label="Opening the review">
        <span />
        <span />
        <span />
      </div>
    );
  }

  const unread = desk.files.filter((f) => f.state === "unread");
  const ready = desk.files.filter((f) => f.state === "ready");
  const shown = desk.findings.filter((f) => f.status === show);
  const counts = { suggested: 0, accepted: 0, dismissed: 0 } satisfies Record<FindingStatus, number>;
  for (const f of desk.findings) counts[f.status]++;
  const several = ready.length > 1;
  const checkable = ready.filter((f) => desk.findings.some((x) => x.src === f.src && x.status === "suggested"));
  const termsOpen = (key: string) => scope?.key === key;
  const toggle = (next: TermScope) => setScope((cur) => (cur?.key === next.key ? null : next));

  return (
    <>
      {/* ---------- Files: read each one here, in the browser ---------- */}
      <section className="rv-sec" aria-label="Files">
        <header className="rv-head">
          <h3 className="cv-sec__title">
            Files <span className="cv-count">{desk.files.length}</span>
            <Hint text="A file is read in your browser: its own text first, then OCR for scanned pages. Only the text is kept, for the people who review this submission." label="About reading files" />
          </h3>
          {reading ? (
            <button type="button" className="btn btn--sm" onClick={() => stop.current?.abort()}>
              <Icon name="close" size={15} /> Stop
            </button>
          ) : (
            unread.length > 0 && (
              <button type="button" className="btn btn--dark btn--sm" onClick={() => void readFiles(unread)}>
                <Icon name="eye" size={15} /> {unread.length > 1 ? `Read ${unread.length} files` : "Read file"}
              </button>
            )
          )}
        </header>
        {desk.files.length ? (
          <ul className="rv-files">
            {desk.files.map((f) => {
              const { ext, kind } = fileKind(f.name);
              const p = progress[f.src];
              return (
                <li key={f.src} className={cx("rv-file", `is-${f.state}`, p && "is-reading")}>
                  <span className={`cv-file__ext is-${kind}`} aria-hidden="true">
                    {ext}
                  </span>
                  <span className="rv-file__text">
                    <span className="rv-file__name">{f.name}</span>
                    <span className="rv-file__meta" role={p ? "status" : undefined}>
                      {p ? progressLine(p) : f.state === "ready" ? readLine(f) : f.state === "unread" ? `${f.kind} · not read` : f.why}
                    </span>
                    {p && p.phase !== "open" && (
                      <span className="rv-bar" aria-hidden="true">
                        <i style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
                      </span>
                    )}
                  </span>
                  {f.state === "ready" && !p && (
                    <>
                      <span className="rv-tick" aria-label="Read">
                        <Icon name="check" size={13} strokeWidth={2.8} />
                      </span>
                      <button type="button" className="rv-iconbtn" aria-label={`Remove the text read from ${f.name}`} title="Remove text" disabled={!!busy || reading} onClick={() => void act(`forget:${f.src}`, forgetReading({ evidenceId: id, src: f.src }))}>
                        <Icon name="trash" size={15} />
                      </button>
                    </>
                  )}
                  {f.state === "unread" && !p && (
                    <button type="button" className="btn btn--sm" disabled={reading} onClick={() => void readFiles([f])}>
                      Read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rv-muted">No files are attached. Links aren’t read.</p>
        )}
      </section>

      {/* ---------- What the rules noticed across the files ---------- */}
      {ready.length > 0 && (desk.sdgs.length > 0 || desk.flags.length > 0) && (
        <section className="rv-sec" aria-label="Checks">
          {desk.sdgs.length > 0 && (
            <div className="rv-goals">
              {desk.sdgs.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  className={cx("rv-goal", s.found ? "is-found" : "is-missing", !s.chosen && "is-extra")}
                  aria-pressed={termsOpen(`sdg:${s.n}`)}
                  title={s.found ? (s.terms.length ? `Found: ${s.terms.join(", ")}` : "Found in the text") : "Not found in the files read"}
                  onClick={() => toggle({ key: `sdg:${s.n}`, title: `SDG ${s.n} · ${sdgNames[s.n] ?? ""}`, sdg: s.n })}
                >
                  <img src={sdgIcons[s.n]} alt="" width={28} height={28} loading="lazy" draggable={false} />
                  <span>
                    <b>SDG {s.n}</b>
                    {s.chosen ? (s.found ? "In the text" : "Not in the text") : "Also in the text"}
                  </span>
                  <Icon name={s.found ? "check" : "alert"} size={13} strokeWidth={2.6} className="rv-goal__mark" />
                </button>
              ))}
            </div>
          )}
          {scope?.sdg !== undefined && <Terms scope={scope} evidenceId={id} canEdit={desk.can.terms} onDesk={setDesk} onClose={() => setScope(null)} />}
          {desk.flags.length > 0 && (
            <ul className="rv-flags">
              {desk.flags.map((f, i) => (
                <li key={`${f.kind}-${i}`} className={`rv-flag is-${f.tone}`}>
                  <Icon name={f.kind === "copy" || f.kind === "similar" ? "copy" : f.kind === "period" ? "calendar" : f.kind === "sdg" ? "target" : "info"} size={15} />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Suggestions ---------- */}
      {ready.length > 0 ? (
        <section className="rv-sec" aria-label="Suggestions">
          <header className="rv-head">
            <Segmented
              variant="pills"
              className="cv-kinds rv-show"
              label="Show suggestions"
              value={show}
              onChange={setShow}
              options={[
                { value: "suggested", label: "Suggested", count: counts.suggested },
                { value: "accepted", label: "Linked", count: counts.accepted },
                { value: "dismissed", label: "Dismissed", count: counts.dismissed },
              ]}
            />
            {desk.ai.state === "ready" && checkable.length > 0 && (
              <button type="button" className="btn btn--sm rv-ai" disabled={checking || reading} onClick={() => void check(checkable)} title={`A second opinion from ${desk.ai.model}. It decides nothing.`}>
                <Icon name="spark" size={15} /> {checking ? "Checking…" : "Check with AI"}
              </button>
            )}
            {desk.ai.state === "blocked" && (
              <span className="rv-muted rv-ai-off">
                AI check unavailable <Hint text={desk.ai.why} label="Why the AI check is unavailable" />
              </span>
            )}
          </header>

          {shown.length ? (
            <ul className="rv-list">
              {shown.map((f) => (
                <Finding
                  key={f.id}
                  f={f}
                  several={several}
                  can={desk.can}
                  busy={!!busy}
                  pick={picked[f.id] ?? null}
                  onPick={(k) => setPicked((all) => ({ ...all, [f.id]: k }))}
                  onDecide={(decision) => void act(f.id, decideFinding({ evidenceId: id, id: f.id, decision, ...(decision === "accept" && { figure: picked[f.id] ?? null }) }))}
                  termsOpen={termsOpen(`ind:${f.edition}:${f.code}`)}
                  onTerms={() => toggle({ key: `ind:${f.edition}:${f.code}`, title: `${f.ranking} · ${f.label}`, ranking: rankingOf(f), code: f.code })}
                >
                  {termsOpen(`ind:${f.edition}:${f.code}`) && scope && <Terms scope={scope} evidenceId={id} canEdit={desk.can.terms} onDesk={setDesk} onClose={() => setScope(null)} />}
                </Finding>
              ))}
            </ul>
          ) : (
            <div className="cv-blank rv-blank">
              <span className="cv-blank__art" aria-hidden="true">
                <Icon name={show === "suggested" ? "search" : show === "accepted" ? "link" : "archive"} size={22} strokeWidth={1.6} />
              </span>
              <b>{show === "suggested" ? (desk.findings.length ? "Nothing left to decide" : "No indicator matched") : show === "accepted" ? "Nothing linked yet" : "Nothing dismissed"}</b>
              {show === "suggested" && !desk.findings.length && <span>The text doesn’t match an indicator this submission counts toward.</span>}
            </div>
          )}

          {desk.indicators.length > 0 && (
            <div className="rv-missing">
              <Select
                className="select select--sm"
                value={scope?.code && !desk.findings.some((f) => termsOpen(`ind:${f.edition}:${f.code}`)) ? scope.key : ""}
                placeholder="Terms for another indicator"
                aria-label="Terms for another indicator"
                onChange={(v) => {
                  const ind = desk.indicators.find((i) => `pick:${i.ranking}:${i.code}` === v);
                  setScope(ind ? { key: `pick:${ind.ranking}:${ind.code}`, title: `${ind.edition} · ${ind.label}`, ranking: ind.ranking, code: ind.code } : null);
                }}
              >
                {[...new Set(desk.indicators.map((i) => i.edition))].map((edition) => (
                  <optgroup key={edition} label={edition}>
                    {desk.indicators
                      .filter((i) => i.edition === edition)
                      .map((i) => (
                        <option key={`${i.ranking}:${i.code}`} value={`pick:${i.ranking}:${i.code}`}>
                          {i.label} {i.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
              {scope?.key.startsWith("pick:") && <Terms scope={scope} evidenceId={id} canEdit={desk.can.terms} onDesk={setDesk} onClose={() => setScope(null)} />}
            </div>
          )}
        </section>
      ) : (
        desk.files.length > 0 && (
          <div className="cv-blank rv-blank">
            <span className="cv-blank__art" aria-hidden="true">
              <Icon name="eye" size={24} strokeWidth={1.6} />
            </span>
            <b>{unread.length ? "Read the files to see what they support" : "Nothing here can be read"}</b>
            {!unread.length && <span>Photos and older Office formats aren’t read.</span>}
          </div>
        )
      )}
    </>
  );

  /** The ranking a suggestion's indicator belongs to, as terms are kept: by ranking, not by edition. */
  function rankingOf(f: FindingView) {
    return desk!.indicators.find((i) => i.editionId === f.edition)?.ranking ?? f.edition.replace(/-\d{4}$/, "");
  }
}

function Finding({
  f,
  several,
  can,
  busy,
  pick,
  onPick,
  onDecide,
  termsOpen,
  onTerms,
  children,
}: {
  f: FindingView;
  several: boolean;
  can: ReviewDesk["can"];
  busy: boolean;
  pick: number | null;
  onPick: (k: number | null) => void;
  onDecide: (decision: "accept" | "dismiss" | "reopen") => void;
  termsOpen: boolean;
  onTerms: () => void;
  children?: React.ReactNode;
}) {
  const where = pagesLabel(f.unit, f.pages, pageRanges(f.pages));
  const verdict = f.ai ? VERDICT[f.ai.verdict] : null;
  const open = f.status === "suggested";
  return (
    <li className={cx("rv-item", `is-${f.status}`)}>
      <header className="rv-item__head">
        <span className="rv-item__rank">{f.ranking}</span>
        <span className={cx("rv-conf", `is-${f.confidence}`)} title={f.confidence === "high" ? "Much of what the indicator asks for is in the text" : "Some of what the indicator asks for is in the text"}>
          {f.confidence === "high" ? "Strong" : "Possible"}
        </span>
        {where && <span className="rv-where">{where}</span>}
        {several && (
          <span className="rv-where rv-where--file" title={f.file}>
            {f.file}
          </span>
        )}
      </header>
      <p className="rv-item__name">
        <b className="num">{f.label}</b> {f.name}
      </p>

      {f.quote && (
        <blockquote className="rv-quote">
          {f.quote}
          {f.negated && (
            <span className="rv-warn">
              <Icon name="alert" size={13} /> Says no or not. Read it first.
            </span>
          )}
        </blockquote>
      )}

      {f.terms.length > 0 && (
        <p className="rv-found">
          <span className="sr-only">Found: </span>
          {f.terms.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </p>
      )}

      {f.ai && verdict && (
        <p className={cx("rv-verdict", `is-${verdict.tone}`)}>
          <Icon name="spark" size={14} />
          <span>
            <b>
              <Icon name={verdict.icon} size={13} strokeWidth={2.2} /> {verdict.label}
            </b>
            {f.ai.reason && ` ${f.ai.reason}`}
            {f.ai.quote && <q>{f.ai.quote}</q>}
            <small>
              {f.ai.model}
              {f.ai.page ? ` · ${UNIT_WORD[f.unit]} ${f.ai.page}` : ""}
            </small>
          </span>
        </p>
      )}

      {open && f.numeric && f.figures.length > 0 && can.decide && (
        <div className="rv-figs" role="radiogroup" aria-label="Figure to offer beside the indicator">
          {f.figures.map((fig, k) => (
            <label key={`${fig.text}-${k}`} className="rv-fig" title={fig.quote}>
              <input type="radio" name={`fig-${f.id}`} checked={pick === k} onChange={() => onPick(k)} />
              <b className="num">{fig.text}</b>
              {f.unit !== "image" && (
                <span>
                  {UNIT_WORD[f.unit]} {fig.page}
                </span>
              )}
            </label>
          ))}
          <label className="rv-fig rv-fig--none">
            <input type="radio" name={`fig-${f.id}`} checked={pick === null} onChange={() => onPick(null)} />
            <span>No figure</span>
          </label>
        </div>
      )}

      {f.status === "accepted" && f.figure && (
        <p className="rv-offered">
          <Icon name="data" size={14} /> Offers <b className="num">{f.figure.text}</b> beside the indicator
        </p>
      )}

      <footer className="rv-item__foot">
        {open ? (
          <>
            <button type="button" className="btn btn--dark btn--sm" disabled={busy || !can.decide || !!f.locked} title={f.locked ?? (!can.decide ? "Your role can’t link evidence to indicators" : undefined)} onClick={() => onDecide("accept")}>
              <Icon name="link" size={15} /> Link to indicator
            </button>
            <button type="button" className="btn btn--sm" disabled={busy || !can.decide} onClick={() => onDecide("dismiss")}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <span className={cx("rv-state", `is-${f.status}`)}>
              <Icon name={f.status === "accepted" ? "check" : "minus"} size={13} strokeWidth={2.6} />
              {f.status === "accepted" ? "Linked" : "Dismissed"}
              {f.decidedBy ? ` by ${f.decidedBy}` : ""}
            </span>
            <button type="button" className="btn btn--sm" disabled={busy || !can.decide} onClick={() => onDecide("reopen")}>
              <Icon name="undo" size={15} /> Undo
            </button>
          </>
        )}
        <span className="rv-item__more">
          <button type="button" className="rv-textbtn" aria-expanded={termsOpen} onClick={onTerms}>
            Terms
          </button>
          <Link className="rv-textbtn" href={f.href}>
            Indicator <Icon name="arrow-up-right" size={13} />
          </Link>
        </span>
      </footer>
      {children}
    </li>
  );
}
