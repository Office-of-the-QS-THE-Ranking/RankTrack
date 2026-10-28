"use client";

/*
 * A form's responses, for the people who run it. A table (reference, the questions the form marks as columns,
 * when it came, its status) with a status filter, search and CSV export. A team copy is a row from the moment it's
 * built, Incomplete until it's sent; it can be read but not reviewed or removed. A row opens the response in place, read
 * back section by section, with the previous and next ones a click away. Beside it, the review: the sign-offs
 * in order (each recorded with the signatory's name, the day and a note, the latest one undoable) and the fields
 * only the office fills in. Every review is checked and audited on the server (app/actions/forms.ts).
 */
import { useMemo, useState } from "react";
import { deleteFormResponses, exportFormResponses, reviewFormResponse } from "@/app/actions/forms";
import { download } from "@/components/admin/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { DateField } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { budgetTotals, partsOf } from "@/lib/forms/budget";
import { fieldShows, shownSections } from "@/lib/forms/check";
import { dayLabel, manilaDay, peso, stampLabel } from "@/lib/forms/format";
import { fieldMap, moduleOf, type FormContext } from "@/lib/forms/modules";
import { decisionLabel, INCOMPLETE, roleWords, standing, STATUS_LABEL, STATUSES } from "@/lib/forms/review";
import type { Answers, BudgetValue, FieldSpec, ResponseStatus, StageDecision } from "@/lib/forms/types";
import { isSent, type FormItem, type FormResponseItem, type FormsDesk } from "@/lib/governance/hub-types";
import { AnswerSections } from "./answers";
import { FormArt } from "./art";
import { NameInput } from "./controls";
import { FieldInput } from "./fields";
import { ResponseMark } from "./marks";

type Shown = "draft" | ResponseStatus | "all";

/** A question's answer squeezed into a table cell. */
function ColumnCell({ spec, value, ctx }: { spec: FieldSpec; value: Answers[string] | undefined; ctx: FormContext }) {
  const { sdgIcons, sdgNames } = useViews();
  if (!moduleOf(spec).filled(spec, value)) return <span className="ws-none-mark">—</span>;
  if (spec.type === "sdgs")
    return (
      <span className="fm-cell-sdgs">
        {(value as number[]).slice(0, 4).map((n) => (
          <img key={n} src={sdgIcons[n]} alt={`SDG ${n}: ${sdgNames[n] ?? ""}`} title={`SDG ${n}`} width={466} height={466} loading="lazy" />
        ))}
      </span>
    );
  if (spec.type === "budget") {
    const t = budgetTotals(spec, value as BudgetValue, partsOf(spec, ctx.answers));
    const lead = spec.sources[0];
    return (
      <span className="fm-cell-money">
        <b>{peso(t.total, true)}</b>
        {lead && spec.sources.length > 1 && (
          <small>
            {lead.label} {peso(t.bySource[lead.id] ?? 0, true)}
          </small>
        )}
      </span>
    );
  }
  const text = moduleOf(spec).text(spec, value, ctx);
  return <span className="fm-cell-text" title={text.length > 60 ? text : undefined}>{text}</span>;
}

export function FormResponses({
  form,
  desk,
  responses,
  onChange,
  reload,
  link,
  onCopy,
}: {
  form: FormItem;
  desk: FormsDesk;
  responses: FormResponseItem[] | null;
  onChange: (list: FormResponseItem[]) => void;
  reload: () => Promise<void>;
  link: string;
  onCopy: () => void;
}) {
  const { sdgNames } = useViews();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Shown>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FormResponseItem | null>(null);
  const [exporting, setExporting] = useState(false);
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

  const replace = (next: FormResponseItem) => onChange(list.map((r) => (r.id === next.id ? next : r)));
  const at = openId ? shown.findIndex((r) => r.id === openId) : -1;
  const open = at >= 0 ? shown[at] : openId ? list.find((r) => r.id === openId) : undefined;

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

  if (open)
    return (
      <ResponseView
        key={open.id}
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
    );

  return (
    <div className="fm-responses">
      <div className="content-tabs">
        <div className="content-tabs__controls">
          <div className="content-tabs__actions">
            {statused && list.length > 0 && (
              <Segmented<Shown>
                label="Filter by status"
                variant="pills"
                className="fm-statusfilter"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "All", count: list.length },
                  ...(["draft", ...STATUSES] as const)
                    .filter((s) => list.some((r) => r.status === s))
                    .map((s) => ({ value: s, label: s === "draft" ? INCOMPLETE : STATUS_LABEL[s], count: list.filter((r) => r.status === s).length })),
                ]}
              />
            )}
            {list.some(isSent) && (
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
        </div>
      </div>

      {!list.length ? (
        <div className="ws-empty fm-empty">
          <span className="ws-empty__art">
            <FormArt kind={form.kind} size="lg" />
          </span>
          <p className="ws-empty__title">No responses yet</p>
          {form.status === "open" ? (
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
        <div className="ws-card">
          <table className="ws-table fm-rtable">
            <caption className="sr-only">Responses to {form.title}</caption>
            <thead>
              <tr>
                <th scope="col">Response</th>
                {columns.length ? columns.map((c) => <th key={c.id} scope="col" data-type={c.type}>{c.label}</th>) : <th scope="col">From</th>}
                {statused && <th scope="col">Status</th>}
                <th scope="col" className="ws-col-menu">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="ws-row fm-row-click" onClick={(e) => !(e.target as Element).closest("button, a") && setOpenId(r.id)}>
                  <td>
                    <span className="fm-rtable__ref">
                      <button type="button" className="ws-name__link" onClick={() => setOpenId(r.id)}>
                        {r.ref}
                      </button>
                      <span className="ws-name__sub">
                        {r.status === "draft" ? (
                          <>
                            {r.copy?.label && `${r.copy.label} · `}Edited <time dateTime={r.updatedAt}>{stampLabel(r.updatedAt)}</time>
                          </>
                        ) : (
                          <time dateTime={r.submittedAt}>{stampLabel(r.submittedAt)}</time>
                        )}
                      </span>
                    </span>
                  </td>
                  {columns.length ? (
                    columns.map((c) => (
                      <td key={c.id} data-type={c.type}>
                        <ColumnCell spec={c} value={r.answers[c.id]} ctx={ctxOf(r)} />
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
                  {statused && (
                    <td>
                      <ResponseMark status={r.status} />
                    </td>
                  )}
                  <td className="ws-col-menu">
                    <RowMenu
                      label={`Actions for ${r.ref}`}
                      items={[
                        { label: "Open", icon: "arrow-up-right", onSelect: () => setOpenId(r.id) },
                        ...(isSent(r) ? [{ label: "Remove", icon: "trash" as const, danger: true, onSelect: () => setRemoving(r) }] : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}

/* ---------- One response ---------- */

function ResponseView({
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
  const fields = useMemo(() => fieldMap(form.schema.sections, form.schema.review?.fields), [form.schema]);
  const ctx: FormContext = { units: desk.units, answers: response.answers, fields, sdgNames };
  const sent = isSent(response);
  const reviewing = !!form.schema.review && sent;
  return (
    <div className="fm-resp">
      <header className="fm-resp__head">
        <button type="button" className="fm-back" onClick={onBack}>
          <Icon name="arrow-left" size={16} /> Responses
        </button>
        <div className="fm-resp__titles">
          <h3 className="fm-resp__ref">{response.ref}</h3>
          {(form.schema.review || !sent) && <ResponseMark status={response.status} />}
          <span className="fm-resp__when">
            {sent ? (
              <>
                {response.respondent.name && `${response.respondent.name} · `}
                {stampLabel(response.submittedAt)}
              </>
            ) : (
              <>
                {response.copy && `${response.copy.label}${response.copy.owner ? `, by ${response.copy.owner}` : ""} · `}
                Edited {stampLabel(response.updatedAt)}
              </>
            )}
          </span>
        </div>
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
          {sent && <RowMenu label={`More for ${response.ref}`} items={[{ label: "Remove", icon: "trash", danger: true, onSelect: onRemove }]} />}
        </div>
      </header>
      <div className={`fm-resp__grid${reviewing ? "" : " fm-resp__grid--single"}`}>
        <div className="fm-resp__answers">
          <AnswerSections sections={shownSections(form.schema, response.answers)} ctx={ctx} />
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
