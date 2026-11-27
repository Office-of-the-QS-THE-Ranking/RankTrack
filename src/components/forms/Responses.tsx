"use client";

/*
 * A form's responses, for the people who run it. A table (reference, the questions the form marks as columns,
 * when it came or was last edited, its status) with a status picker, search and CSV export beside the window's tabs. A team copy is a row from the moment it's
 * built, Incomplete until it's sent; it can be read but not reviewed or removed. A row opens the response in place, read
 * back section by section, with the previous and next ones a click away. Beside it, the review: the sign-offs
 * in order (each recorded with the signatory's name, the day and a note, the latest one undoable) and the fields
 * only the office fills in. Every review is checked and audited on the server (app/actions/forms.ts).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";
import { deleteFormResponses, exportFormResponses, reviewFormResponse } from "@/app/actions/forms";
import { download } from "@/components/command-control/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { Segmented, TabPanel, Tabs } from "@/components/ui/interactive";
import { DateField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { budgetTotals, partsOf } from "@/lib/forms/budget";
import { copyPath } from "@/lib/forms/copies";
import { fieldShows, shownSections } from "@/lib/forms/check";
import { dayLabel, manilaDay, peso, stampLabel, stampParts } from "@/lib/forms/format";
import { formPath } from "@/lib/forms/kinds";
import { fieldMap, moduleOf, type FormContext } from "@/lib/forms/modules";
import { decisionLabel, INCOMPLETE, roleWords, standing, STATUS_LABEL, STATUSES } from "@/lib/forms/review";
import type { Answers, BudgetValue, FieldSpec, ResponseStatus, SectionSpec, StageDecision } from "@/lib/forms/types";
import { isSent, type FormItem, type FormResponseItem, type FormsDesk } from "@/lib/governance/hub-types";
import { AnswerSections } from "./answers";
import { FormArt } from "./art";
import { NameInput } from "./controls";
import { FieldInput } from "./fields";
import { ResponseMark } from "./marks";
import { usePending } from "@/components/ui/ButtonBusy";

/** The swap between the responses table and one response (and their bars): a soft rise and fade in, a quicker lift and fade out. */
export function useSwap(rise = 10): MotionProps {
  const reduce = useReducedMotion();
  if (reduce) return { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.12 } }, exit: { opacity: 0, transition: { duration: 0.08 } } };
  return {
    initial: { opacity: 0, y: rise, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, y: -rise / 2, filter: "blur(3px)", transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
  };
}

type Shown = "draft" | ResponseStatus | "all";

/** A source of funds by its short name when its label ends with one: "Community Service Fund (CSF)" reads CSF. */
const shortName = (label: string) => /\(([^()]{2,12})\)\s*$/.exec(label)?.[1] ?? label;

/** A question's answer squeezed into a table cell; the first column leads the row. */
function ColumnCell({ spec, value, ctx, lead: leads = false }: { spec: FieldSpec; value: Answers[string] | undefined; ctx: FormContext; lead?: boolean }) {
  const { sdgIcons, sdgNames } = useViews();
  if (!moduleOf(spec).filled(spec, value)) return <span className="ws-none-mark">—</span>;
  if (spec.type === "sdgs")
    return (
      <span className="fm-cell-sdgs">
        {(value as number[]).slice(0, 4).map((n) => (
          <img key={n} src={sdgIcons[n]} alt={`SDG ${n}: ${sdgNames[n] ?? ""}`} title={`SDG ${n}`} width={466} height={466} loading="lazy" />
        ))}
        {(value as number[]).length > 4 && <small>+{(value as number[]).length - 4}</small>}
      </span>
    );
  if (spec.type === "budget") {
    const t = budgetTotals(spec, value as BudgetValue, partsOf(spec, ctx.answers));
    const lead = spec.sources[0];
    return (
      <span className="fm-cell-money">
        <b>{peso(t.total, true)}</b>
        {lead && spec.sources.length > 1 && (
          <small title={lead.label}>
            {shortName(lead.label)} {peso(t.bySource[lead.id] ?? 0, true)}
          </small>
        )}
      </span>
    );
  }
  const text = moduleOf(spec).text(spec, value, ctx);
  return <span className={`fm-cell-text${leads ? " fm-cell-text--lead" : ""}`} title={text.length > 60 ? text : undefined}>{text}</span>;
}

export function FormResponses({
  form,
  desk,
  responses,
  onChange,
  reload,
  link,
  onCopy,
  toolbar,
  bar,
  onOpen,
}: {
  /** The window's toolbar beside its content tabs, where the filters, export and search go. */
  toolbar: HTMLElement | null;
  /** The window's bar while a response is open: the response's own back button, part tabs and controls go there. */
  bar: HTMLElement | null;
  /** Tells the window a response opened or closed, so it swaps its tabs for the response's. */
  onOpen: (open: boolean) => void;
  form: FormItem;
  desk: FormsDesk;
  responses: FormResponseItem[] | null;
  onChange: (list: FormResponseItem[]) => void;
  reload: () => Promise<void>;
  link: string;
  onCopy: () => void;
}) {
  const { sdgNames } = useViews();
  const swap = useSwap();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Shown>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FormResponseItem | null>(null);
  const [exporting, setExporting] = useState(false);
  usePending(exporting);
  const fields = useMemo(() => fieldMap(form.schema.sections, form.schema.review?.fields), [form.schema]);
  const reviewed = (form.schema.review?.stages.length ?? 0) > 0;
  // Without sign-offs a sent response is just Submitted; with copies some aren't sent yet.
  const statused = reviewed || !!form.copies;
  const columns = useMemo(() => form.schema.sections.flatMap((s) => s.fields).filter((f) => f.column).slice(0, 4), [form.schema]);
  const ctxOf = (r: FormResponseItem): FormContext => ({ units: desk.units, answers: r.answers, fields, sdgNames });
  const term = q.trim().toLowerCase();
  const list = responses ?? [];
  const shown = list.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!term || [r.ref, r.respondent.name, r.respondent.email, r.copy?.label ?? "", r.copy?.owner ?? "", ...columns.map((c) => moduleOf(c).text(c, r.answers[c.id], ctxOf(r)))].some((t) => t.toLowerCase().includes(term))),
  );

  // A reviewed response comes back without its copy link; it keeps the one it had.
  const replace = (next: FormResponseItem) => onChange(list.map((r) => (r.id === next.id ? { ...next, token: next.token ?? r.token } : r)));
  const at = openId ? shown.findIndex((r) => r.id === openId) : -1;
  const open = at >= 0 ? shown[at] : openId ? list.find((r) => r.id === openId) : undefined;
  const isOpen = !!open;
  useEffect(() => {
    onOpen(isOpen);
  }, [isOpen, onOpen]);
  useEffect(() => () => onOpen(false), [onOpen]);

  const exportAll = async () => {
    setExporting(true);
    const r = await exportFormResponses(form.id).catch(() => ({ ok: false as const, message: "The server could not be reached. Try again." }));
    setExporting(false);
    if (!r.ok) return toast(r.message, "error");
    download(r.name, `﻿${r.csv}`);
    toast("Responses exported.", "ok");
  };

  if (responses === null)
    return (
      <div className="fm-loading" role="status">
        <span className="fm-loading__bar" />
        Loading responses
      </div>
    );

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div key="response" {...swap}>
            <ResponseView
        key={open.id}
        bar={bar}
        form={form}
        desk={desk}
        response={open}
        place={at >= 0 ? { at, of: shown.length } : null}
        onPrev={at > 0 ? () => setOpenId(shown[at - 1].id) : undefined}
        onNext={at >= 0 && at < shown.length - 1 ? () => setOpenId(shown[at + 1].id) : undefined}
        onBack={() => setOpenId(null)}
        onChanged={replace}
        onRemove={() => setRemoving(open)}
      />
          </motion.div>
        ) : (
    <motion.div key="list" className="fm-responses" {...swap}>
      {toolbar &&
        createPortal(
          <>
          <div className="content-tabs__actions">
            {statused && list.length > 0 && (
              <Select className="content-tabs__action fm-statuspick" value={status} onChange={(v) => setStatus(v as Shown)} aria-label="Show by status">
                <option value="all">All statuses</option>
                {(["draft", ...STATUSES] as const)
                  .filter((s) => list.some((r) => r.status === s))
                  .map((s) => (
                    <option key={s} value={s}>
                      {s === "draft" ? INCOMPLETE : STATUS_LABEL[s]} · {list.filter((r) => r.status === s).length}
                    </option>
                  ))}
              </Select>
            )}
            {form.may.export && list.some(isSent) && (
              <button type="button" className="btn content-tabs__action" onClick={() => void exportAll()} disabled={exporting} aria-busy={exporting || undefined}>
                <Icon name="download" size={15} /> Export CSV
              </button>
            )}
            <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label="Refresh responses" onClick={() => void reload()}>
              <Icon name="refresh" size={15} />
            </button>
          </div>
          {list.length > 0 && (
            <div className="content-tabs__search">
              <SearchField value={q} onChange={setQ} placeholder="Search responses" label="Search responses" examples={["Search by reference", "Search by name", "Search by title"]} />
            </div>
          )}
          </>,
          toolbar,
        )}

      {!list.length ? (
        <div className="ws-empty fm-empty">
          <span className="ws-empty__art">
            <FormArt kind={form.kind} size="lg" />
          </span>
          <p className="ws-empty__title">{form.copies ? "No copies yet" : "No responses yet"}</p>
          {form.status === "open" && !form.copies ? (
            <button type="button" className="btn btn--dark" onClick={onCopy}>
              <Icon name="copy" size={16} /> Copy responder link
            </button>
          ) : (
            <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
              <Icon name="eye" size={16} /> Preview the form
            </a>
          )}
        </div>
      ) : !shown.length ? (
        <div className="ws-card ws-none">
          <p>No responses match.</p>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
          >
            Show all responses
          </button>
        </div>
      ) : (
        <div className="ws-card fm-rtable-wrap">
          <table className="ws-table fm-rtable">
            <caption className="sr-only">Responses to {form.title}</caption>
            <thead>
              <tr>
                <th scope="col">Response</th>
                {columns.length ? columns.map((c) => <th key={c.id} scope="col" data-type={c.type}>{c.label}</th>) : <th scope="col">From</th>}
                <th scope="col" className="fm-col-when">
                  Last activity
                </th>
                {statused && (
                  <th scope="col" className="fm-col-status">
                    Status
                  </th>
                )}
                <th scope="col" className="ws-col-menu">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const sent = isSent(r);
                const when = stampParts(sent ? r.submittedAt : r.updatedAt);
                return (
                  <tr key={r.id} className="ws-row fm-row-click" onClick={(e) => !(e.target as Element).closest("button, a") && setOpenId(r.id)}>
                    <td>
                      <span className="fm-rtable__ref">
                        <button type="button" className="ws-name__link" onClick={() => setOpenId(r.id)}>
                          {r.ref}
                        </button>
                        {r.copy?.label && (
                          <span className="fm-rtable__sub" title={r.copy.label}>
                            {r.copy.label}
                          </span>
                        )}
                      </span>
                    </td>
                    {columns.length ? (
                      columns.map((c, i) => (
                        <td key={c.id} data-type={c.type}>
                          <ColumnCell spec={c} value={r.answers[c.id]} ctx={ctxOf(r)} lead={i === 0} />
                        </td>
                      ))
                    ) : (
                      <td>
                        <span className="ws-name">
                          {r.respondent.name || "—"}
                          <span className="ws-name__sub">{r.respondent.email}</span>
                        </span>
                      </td>
                    )}
                    <td className="fm-col-when">
                      <time className="fm-when" dateTime={sent ? r.submittedAt : r.updatedAt}>
                        {when.day}
                        <small>
                          {sent ? "Sent" : "Edited"} {when.time}
                        </small>
                      </time>
                    </td>
                    {statused && (
                      <td className="fm-col-status">
                        <ResponseMark status={r.status} />
                      </td>
                    )}
                    <td className="ws-col-menu">
                      <RowMenu
                        label={`Actions for ${r.ref}`}
                        items={[
                          { label: "Open", icon: "arrow-up-right", onSelect: () => setOpenId(r.id) },
                          ...(sent && form.may.clear ? [{ label: "Remove", icon: "trash" as const, danger: true, onSelect: () => setRemoving(r) }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
        )}
      </AnimatePresence>

      {removing && (
        <Sheet title={`Remove ${removing.ref}?`} onClose={() => setRemoving(null)} className="ws-sheet--confirm">
          {(close) => (
            <div className="ws-sheet__body">
              <p className="ws-sheet__text">The response and its review are deleted for good. Export first if you need a copy.</p>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={async () => {
                    const r = await deleteFormResponses({ formId: form.id, ids: [removing.id] });
                    toast(r.message, r.ok ? "ok" : "error");
                    if (!r.ok) return;
                    onChange(list.filter((x) => x.id !== removing.id));
                    if (openId === removing.id) setOpenId(null);
                    close();
                  }}
                >
                  <Icon name="trash" size={16} /> Remove
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/* ---------- One response ---------- */

/** The project flow (presets.ts projectFlow), the one question read back in a tab of its own. */
const isFlow = (f: FieldSpec) => f.type === "table" && f.id === "flow";

function ResponseView({
  bar,
  form,
  desk,
  response,
  place,
  onPrev,
  onNext,
  onBack,
  onChanged,
  onRemove,
}: {
  bar: HTMLElement | null;
  form: FormItem;
  desk: FormsDesk;
  response: FormResponseItem;
  place: { at: number; of: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
  onBack: () => void;
  onChanged: (r: FormResponseItem) => void;
  onRemove: () => void;
}) {
  const { sdgNames } = useViews();
  const partsId = useId();
  const barSwap = useSwap(6);
  const fields = useMemo(() => fieldMap(form.schema.sections, form.schema.review?.fields), [form.schema]);
  const ctx: FormContext = { units: desk.units, answers: response.answers, fields, sdgNames };
  const sent = isSent(response);
  // The sign-offs and office fields are for those who may review; others read the answers only.
  const reviewing = !!form.schema.review && sent && form.may.review;
  // The response's parts: each section that shows something in it, with the project flow split off into a part of
  // its own right after its section.
  const parts = useMemo(() => {
    const shows = (s: SectionSpec, f: FieldSpec) => f.type !== "note" && fieldShows(s, f, response.answers, fields);
    return shownSections(form.schema, response.answers).flatMap((s) => {
      const rest = s.fields.filter((f) => !isFlow(f));
      const own = rest.some((f) => shows(s, f)) ? [{ key: s.id, label: s.title, section: { ...s, fields: rest } }] : [];
      const tables = s.fields.filter((f) => isFlow(f) && shows(s, f)).map((f) => ({ key: `${s.id}:${f.id}`, label: f.label, section: { ...s, fields: [f] } }));
      return [...own, ...tables];
    });
  }, [form.schema, response.answers, fields]);
  const [partId, setPartId] = useState(parts[0]?.key ?? "");
  const part = parts.find((p) => p.key === partId) ?? parts[0];
  const index = part ? parts.indexOf(part) : 0;
  const panel = useRef<HTMLDivElement>(null);

  const controls = (
    <div className="fm-resp__nav">
      {place && (
        <span className="fm-resp__place">
          {place.at + 1} of {place.of}
        </span>
      )}
      <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label="Previous response" disabled={!onPrev} onClick={onPrev}>
        <Icon name="chevron-left" size={16} />
      </button>
      <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label="Next response" disabled={!onNext} onClick={onNext}>
        <Icon name="chevron" size={16} />
      </button>
      <button type="button" className="btn content-tabs__action content-tabs__action--icon" aria-label="Print this response" onClick={() => window.print()}>
        <Icon name="download" size={15} />
      </button>
      {sent && form.may.clear && <RowMenu label={`More for ${response.ref}`} items={[{ label: "Remove", icon: "trash", danger: true, onSelect: onRemove }]} />}
    </div>
  );

  // The back button leads the window's bar, then the response's parts as content tabs, then its controls.
  const head = (
    <motion.div className="content-tabs fm-resp-bar" {...barSwap}>
      <button type="button" className="btn content-tabs__action fm-resp-bar__back" onClick={onBack}>
        <Icon name="arrow-left" size={16} /> Return
      </button>
      {parts.length > 0 ? (
        <Tabs<string> label={`Parts of ${response.ref}`} idBase={partsId} tabs={parts.map((p) => ({ key: p.key, label: p.label }))} value={part?.key ?? ""} onChange={setPartId} actions={controls} />
      ) : (
        <div className="fm-resp-bar__end">{controls}</div>
      )}
    </motion.div>
  );

  // The hero is the response's working card: its reference, where it stands, its sign-offs, its last change, its links.
  const signoffs = form.schema.review && sent ? standing(form.schema, response.answers, response.review) : null;
  const signed = signoffs ? signoffs.stages.filter((st) => response.review.stages[st.id]?.decision === "approved").length : 0;
  const editedAt = response.edited?.at ?? (sent ? response.submittedAt : response.updatedAt);
  const editedBy = response.edited?.by || (sent ? response.respondent.name : response.copy?.owner) || "";
  const links = [
    ...(response.token ? [{ key: "copy", label: "Team copy", url: new URL(copyPath(form.code, response.token), desk.origin).href }] : []),
    { key: "form", label: "Form", url: new URL(formPath(form.code), desk.origin).href },
  ];
  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`, "ok");
    } catch {
      toast(`Couldn’t copy the ${what.toLowerCase()}.`, "error");
    }
  };
  const prev = index > 0 ? parts[index - 1] : undefined;
  const next = index < parts.length - 1 ? parts[index + 1] : undefined;
  const turn = (key: string) => {
    setPartId(key);
    panel.current?.closest(".fm-window__body")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="fm-resp">
      {bar && createPortal(head, bar)}
      {/* The hero sums the response up once, on its first part (the project); the other parts read without it. */}
      {index === 0 && (
      <header className="fm-hero fm-hero--card">
        <div className="fm-hero__head">
          <div className="fm-hero__id">
            <span className="fm-hero__cap">Reference number</span>
            <button type="button" className="fm-hero__ref fm-hero__ref--lg" onClick={() => copyText(response.ref, "Reference number")} aria-label={`Copy reference number ${response.ref}`}>
              {response.ref}
              <Icon name="copy" size={14} />
            </button>
          </div>
          <div className="fm-hero__links" aria-label="Links">
            {links.map((l) => (
              <span key={l.key} className="fm-hero__link">
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="link" size={14} />
                  {l.label} link
                  <Icon name="arrow-up-right" size={13} />
                </a>
                <button type="button" aria-label={`Copy the ${l.label.toLowerCase()} link`} onClick={() => copyText(l.url, `${l.label} link`)}>
                  <Icon name="copy" size={14} />
                </button>
              </span>
            ))}
          </div>
        </div>
        <dl className="fm-hero__facts">
          <div className="fm-hero__fact">
            <dt>Status</dt>
            <dd>
              <span className="fm-hero__state" data-state={sent ? "done" : "open"}>
                <i aria-hidden="true" />
                {sent ? "Accomplished" : "Incomplete"}
              </span>
            </dd>
          </div>
          <div className="fm-hero__fact fm-hero__fact--signoffs">
            <dt>Approval status</dt>
            <dd>
              {signoffs ? (
                <>
                  <span className="fm-hero__approval">
                    <ResponseMark status={response.status} />
                    <small>
                      {signed} of {signoffs.stages.length} signed
                    </small>
                  </span>
                  <span className="fm-hero__meter" aria-hidden="true">
                    {signoffs.stages.map((st) => (
                      <i key={st.id} data-state={response.review.stages[st.id]?.decision ?? (signoffs.next?.id === st.id ? "next" : "waiting")} />
                    ))}
                  </span>
                </>
              ) : (
                <span className="fm-hero__quiet">{sent ? "No sign-offs needed" : "Not sent for approval"}</span>
              )}
            </dd>
          </div>
          <div className="fm-hero__fact">
            <dt>Last edited</dt>
            <dd>
              <time dateTime={editedAt}>{stampLabel(editedAt)}</time>
            </dd>
          </div>
          <div className="fm-hero__fact">
            <dt>Last edited by</dt>
            <dd>{editedBy ? <span className="fm-hero__who"><Icon name="user" size={14} />{editedBy}</span> : <span className="fm-hero__quiet">Not recorded</span>}</dd>
          </div>
        </dl>
      </header>
      )}
      <div className={`fm-resp__grid${reviewing ? "" : " fm-resp__grid--single"}`}>
        <div ref={panel} className="fm-resp__answers">
          {part ? (
            <TabPanel idBase={partsId} index={index} className="fm-resp__part" key={part.key}>
              <AnswerSections sections={[part.section]} ctx={ctx} feature step={{ at: index, of: parts.length }} />
              {(prev || next) && (
                <nav className="fm-pager" aria-label="Parts of this response">
                  {prev ? (
                    <button type="button" className="fm-pager__link" onClick={() => turn(prev.key)}>
                      <Icon name="arrow-left" size={16} />
                      <span>
                        <small>Previous</small>
                        {prev.label}
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <button type="button" className="fm-pager__link fm-pager__link--next" onClick={() => turn(next.key)}>
                      <span>
                        <small>Next</small>
                        {next.label}
                      </span>
                      <Icon name="arrow" size={16} />
                    </button>
                  )}
                </nav>
              )}
            </TabPanel>
          ) : (
            <p className="fm-a-none">Nothing to read back yet.</p>
          )}
        </div>
        {reviewing && <ReviewPanel form={form} desk={desk} response={response} onChanged={onChanged} />}
      </div>
    </div>
  );
}

/* ---------- Its review ---------- */

const DECISION_ICON = { approved: "check", returned: "undo", declined: "x-circle" } as const;

function ReviewPanel({ form, desk, response, onChanged }: { form: FormItem; desk: FormsDesk; response: FormResponseItem; onChanged: (r: FormResponseItem) => void }) {
  const { sdgNames } = useViews();
  const review = form.schema.review!;
  const fields = useMemo(() => fieldMap(form.schema.sections, review.fields), [form.schema, review.fields]);
  const { next, stages } = standing(form.schema, response.answers, response.review);
  const latest = stages.filter((s) => response.review.stages[s.id]).at(-1);
  const today = manilaDay();
  const [recording, setRecording] = useState(false);
  const [decision, setDecision] = useState<StageDecision>("approved");
  const [name, setName] = useState("");
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [office, setOffice] = useState<Answers>(response.review.fields);
  const [busy, setBusy] = useState(false);
  usePending(busy);
  const officeChanged = JSON.stringify(office) !== JSON.stringify(response.review.fields);
  const scope = { ...response.answers, ...office };
  const ctx: FormContext = { units: desk.units, answers: scope, fields, sdgNames };
  const officeSection = { id: "office", title: "Office use", fields: review.fields };

  const save = async (input: Parameters<typeof reviewFormResponse>[0]) => {
    setBusy(true);
    const r = await reviewFormResponse(input).catch(() => ({ ok: false as const, message: "The server could not be reached. Try again." }));
    setBusy(false);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) onChanged(r.response);
    return r.ok;
  };

  return (
    <aside className="fm-review" aria-label="Review">
      <section className="fm-review__part">
        <h3 className="fm-review__title">Sign-offs</h3>
        <ol className="fm-signoffs">
          {stages.map((s, i) => {
            const rec = response.review.stages[s.id];
            const isNext = next?.id === s.id;
            return (
              <li key={s.id} className="fm-signoff" data-state={rec ? rec.decision : isNext ? "next" : "waiting"}>
                <span className="fm-signoff__dot" aria-hidden="true">
                  {rec ? <Icon name={DECISION_ICON[rec.decision]} size={13} strokeWidth={2.4} /> : i + 1}
                </span>
                <div className="fm-signoff__body">
                  <span className="fm-signoff__role">
                    <b>{s.verb}</b> by {roleWords(s.role)}
                  </span>
                  {rec && (
                    <span className="fm-signoff__rec">
                      <span className="fm-signoff__decision">{decisionLabel(s, rec)}</span>
                      {rec.name} · {dayLabel(rec.on)}
                      {rec.note && <q className="fm-signoff__note">{rec.note}</q>}
                      <small>Recorded by {rec.by}</small>
                    </span>
                  )}
                  {rec && latest?.id === s.id && (
                    <button type="button" className="fr-link fm-signoff__undo" disabled={busy} onClick={() => void save({ formId: form.id, id: response.id, stage: { id: s.id, clear: true } })}>
                      Undo
                    </button>
                  )}
                  {isNext && !recording && (
                    <button type="button" className="btn btn--sm btn--dark fm-signoff__record" onClick={() => setRecording(true)}>
                      <Icon name="pen" size={14} /> Record sign-off
                    </button>
                  )}
                  {isNext && recording && (
                    <form
                      className="fm-record"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await save({ formId: form.id, id: response.id, stage: { id: s.id, decision, name, on, note } })) {
                          setRecording(false);
                          setName("");
                          setNote("");
                          setDecision("approved");
                        }
                      }}
                    >
                      <Segmented<StageDecision>
                        label="Decision"
                        value={decision}
                        onChange={setDecision}
                        options={[
                          { value: "approved", label: s.verb },
                          { value: "returned", label: "Return" },
                          { value: "declined", label: "Decline" },
                        ]}
                      />
                      <NameInput caps value={name} placeholder="Signatory’s full name" aria-label={`Name of the ${roleWords(s.role)}`} maxLength={80} required data-missing="Enter their name." onChange={setName} />
                      <DateField displayFormat="long" className="input" value={on} onChange={setOn} max={today} required aria-label="Day of the decision" />
                      <textarea
                        className="textarea"
                        rows={2}
                        title=""
                        value={note}
                        placeholder={decision === "approved" ? "Note (optional)" : "Why? The proponents will be told."}
                        aria-label="Note"
                        maxLength={600}
                        required={decision !== "approved"}
                        data-missing="Say why, in a note."
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <footer className="fm-record__foot">
                        <button type="button" className="btn btn--sm" onClick={() => setRecording(false)}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn--sm btn--dark" disabled={busy} aria-busy={busy || undefined}>
                          Save
                        </button>
                      </footer>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {review.fields.length > 0 && (
        <form
          className="fm-review__part fm-review__office"
          onSubmit={async (e) => {
            e.preventDefault();
            await save({ formId: form.id, id: response.id, fields: office });
          }}
        >
          <h3 className="fm-review__title">Office use</h3>
          <div className="fm-fields fm-fields--tight">
            {review.fields
              .filter((f) => fieldShows(officeSection, f, scope, fields))
              .map((f) => (
                <FieldInput
                  key={f.id}
                  spec={f}
                  value={office[f.id]}
                  onChange={(v) =>
                    setOffice((o) => {
                      const nextOffice = { ...o };
                      if (v === undefined) delete nextOffice[f.id];
                      else nextOffice[f.id] = v;
                      return nextOffice;
                    })
                  }
                  ctx={ctx}
                  id={`rv-${response.id}-${f.id}`}
                />
              ))}
          </div>
          <footer className="fm-review__foot">
            <button type="submit" className="btn btn--sm btn--dark" disabled={busy || !officeChanged}>
              Save
            </button>
          </footer>
        </form>
      )}
    </aside>
  );
}
