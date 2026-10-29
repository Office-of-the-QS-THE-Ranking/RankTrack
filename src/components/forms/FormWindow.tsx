"use client";

/*
 * One digital form in a full-size window. Its head names it and holds its content tabs and actions.
 * Details: the responder link (or, for a form filled in as copies, the Student Portal) with the response control
 * and the Publish to Student Portal switch, the numbers, and a map of the questions it asks with the sign-offs its
 * responses go through. Responses and Analytics are for the people who may read them (Responses.tsx,
 * Analytics.tsx); its responses load once, when the window opens. Everything offered follows form.may.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { closeModal } from "@/components/ui/modal-motion";
import { loadFormResponses } from "@/app/actions/forms";
import { RowMenu } from "@/components/publications/PostManager";
import { Icon, isIconName, type IconName } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { DateField, Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { FolderModal, Sheet } from "@/components/workspace/parts";
import type { Command, CommandResult } from "@/lib/governance/commands";
import { isSent, type FormItem, type FormResponseItem, type FormsDesk } from "@/lib/governance/hub-types";
import { HOLDER_KINDS, PORTAL_KINDS, publishes } from "@/lib/forms/access";
import { dayLabel, plural } from "@/lib/forms/format";
import { FORM_KINDS, FORM_LIMITS, MODULE_NAMES, formKindLabel } from "@/lib/forms/kinds";
import type { FieldType, FormKind } from "@/lib/forms/types";
import { FormAnalytics } from "./Analytics";
import { FormArt } from "./art";
import { ago, StatusMark } from "./marks";
import { FormResponses } from "./Responses";

type Tab = "Details" | "Responses" | "Analytics";
const TABS: Tab[] = ["Details", "Responses", "Analytics"];

/** A glyph per module, for the map of a form's questions. */
export const MODULE_ICON: Record<FieldType, IconName> = {
  text: "pen",
  paragraph: "comment",
  choice: "check-circle",
  yesno: "swap",
  unit: "building",
  sdgs: "globe",
  date: "calendar",
  daterange: "calendar",
  number: "hash",
  money: "wallet",
  link: "link",
  people: "users",
  table: "layers",
  counts: "users",
  budget: "wallet",
  budgetsummary: "reports",
  consent: "shield-check",
  signature: "pen",
  note: "info",
};

export function FormWindow({
  form,
  desk,
  link,
  onCopy,
  act,
  onRemove,
  onBuild,
  onPublish,
  onClose,
}: {
  form: FormItem;
  desk: FormsDesk;
  link: string;
  onCopy: () => void;
  act: (cmd: Command) => Promise<CommandResult>;
  onRemove: () => void;
  /** Opens the Forms Builder on a draft's questions. */
  onBuild: () => void;
  /** Asks before publishing an Evaluation or Registration Form, which fixes it. */
  onPublish: () => void;
  onClose: () => void;
}) {
  const tabsId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("Details");
  const [responses, setResponses] = useState<FormResponseItem[] | null>(null);
  const [editing, setEditing] = useState(false);

  const reads = form.may.read;
  const load = useCallback(async () => {
    if (!reads) return;
    const r = await loadFormResponses(form.id).catch(() => ({ ok: false as const, message: "The server could not be reached. Check your connection and try again." }));
    if (r.ok) setResponses(r.responses);
    else toast(r.message, "error");
  }, [form.id, reads]);

  useEffect(() => {
    void load();
  }, [load]);

  const draft = form.status === "draft";
  // A team copy is a response from the moment it's built; analytics read the sent ones.
  const sent = useMemo(() => responses?.filter(isSent) ?? null, [responses]);
  const details = (
    <Details
      form={form}
      desk={desk}
      link={link}
      onCopy={onCopy}
      onEdit={() => setEditing(true)}
      onBuild={form.may.edit && draft ? onBuild : undefined}
      responses={responses}
      onStatus={(status) => (status === "open" && publishes(form) ? (onPublish(), Promise.resolve({ ok: true, message: "" })) : act({ type: "form.status", id: form.id, status }))}
      onPortal={(on) => act({ type: "form.portal", id: form.id, on })}
    />
  );

  return (
    <FolderModal label={form.title} onClose={onClose} className="fm-window" dialogRef={dialog}>
      <header className="fm-window__head">
        <span className="fm-window__art">
          <FormArt kind={form.kind} size="sm" />
        </span>
        <div className="fm-window__titles">
          <span className="fm-window__eyebrow">
            {formKindLabel(form.kind)}
            {form.reference && <span className="fm-window__ref">{form.reference}</span>}
          </span>
          <h2 className="fm-window__title">{form.title}</h2>
        </div>
        {reads && (
          <div className="fm-window__tabs">
            <Tabs<Tab>
              label="Form"
              idBase={tabsId}
              tabs={[
                { key: "Details", label: "Details", icon: "clipboard" },
                { key: "Responses", label: "Responses", icon: "inbox", count: (responses?.length ?? form.responses?.total) || undefined },
                { key: "Analytics", label: "Analytics", icon: "rankings" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
        )}
        <div className="fm-window__actions">
          {(draft || form.copies) && (form.may.edit || reads) && (
            <a className="btn content-tabs__action" href={link} target="_blank" rel="noopener noreferrer">
              <Icon name="arrow-up-right" size={15} /> Preview
            </a>
          )}
          {(form.may.edit || form.may.duplicate || form.may.remove) && (
            <RowMenu
              label={`More for ${form.title}`}
              items={[
                form.may.edit && draft && { label: "Edit questions", icon: "layers", onSelect: onBuild },
                form.may.edit && { label: "Edit details", icon: "pen", onSelect: () => setEditing(true) },
                form.may.duplicate && { label: "Duplicate as a draft", icon: "copy", onSelect: () => void act({ type: "form.duplicate", id: form.id }) },
                form.may.remove && { label: "Delete draft", icon: "trash", danger: true, onSelect: onRemove },
              ]}
            />
          )}
          <button type="button" className="ws-modal__x" aria-label="Close form" onClick={() => closeModal(dialog.current)}>
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      {reads ? (
        <TabPanel idBase={tabsId} index={TABS.indexOf(tab)} className="fm-window__body">
          {tab === "Details" && details}
          {tab === "Responses" && <FormResponses form={form} desk={desk} responses={responses} onChange={setResponses} reload={load} link={link} onCopy={onCopy} />}
          {tab === "Analytics" && <FormAnalytics form={form} desk={desk} responses={sent} onCopy={onCopy} />}
        </TabPanel>
      ) : (
        <div className="fm-window__body">{details}</div>
      )}

      {editing && <DetailsSheet form={form} desk={desk} onSave={(fields) => act({ type: "form.save", id: form.id, ...fields })} onClose={() => setEditing(false)} />}
    </FolderModal>
  );
}

/* ---------- Details ---------- */

/** A switch in a tile's row: Taking responses, Student Portal. */
function SwitchButton({ on, label, children, busy, onClick }: { on: boolean; label: string; children: ReactNode; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="btn btn--sm fm-btn-glass fm-response-control" disabled={busy} aria-busy={busy || undefined} onClick={onClick}>
      {children}
      <span className="fm-response-control__switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function Details({
  form,
  desk,
  link,
  onCopy,
  onEdit,
  onBuild,
  responses,
  onStatus,
  onPortal,
}: {
  form: FormItem;
  desk: FormsDesk;
  link: string;
  onCopy: () => void;
  onEdit: () => void;
  onBuild?: () => void;
  responses: FormResponseItem[] | null;
  onStatus: (status: "open" | "closed") => Promise<CommandResult>;
  onPortal: (on: boolean) => Promise<CommandResult>;
}) {
  const [changing, setChanging] = useState(false);
  const change = async (run: () => Promise<CommandResult>) => {
    if (changing) return;
    setChanging(true);
    try {
      await run();
    } catch {
      toast("Could not update response settings. Try again.", "error");
    } finally {
      setChanging(false);
    }
  };
  const { may } = form;
  const sections = form.schema.sections;
  const questions = sections.reduce((n, s) => n + s.fields.filter((f) => f.type !== "note").length, 0);
  const stages = form.schema.review?.stages ?? [];
  const total = responses?.length ?? form.responses?.total ?? 0;
  const week = responses ? responses.filter((r) => Date.now() - Date.parse(r.submittedAt) < 7 * 86_400_000).length : (form.responses?.week ?? 0);
  const approved = responses?.filter((r) => r.status === "approved").length ?? 0;
  const last = responses?.[0]?.submittedAt ?? form.responses?.lastAt;
  const draft = form.status === "draft";
  const portalKind = PORTAL_KINDS.includes(form.kind);
  const status = may.status && (draft ? (
    <button type="button" className="btn btn--sm fm-btn-glass" disabled={changing} aria-busy={changing || undefined} onClick={() => void change(() => onStatus("open"))}>
      <Icon name={publishes(form) ? "send" : "play"} size={14} /> {publishes(form) ? "Publish" : "Open for responses"}
    </button>
  ) : (
    <SwitchButton on={form.status === "open"} label="Taking responses" busy={changing} onClick={() => void change(() => onStatus(form.status === "open" ? "closed" : "open"))}>
      {form.status === "open" ? "Taking responses" : "Closed"}
    </SwitchButton>
  ));
  const portal = may.portal && (
    <SwitchButton on={form.students} label="Published to the Student Portal" busy={changing} onClick={() => void change(() => onPortal(!form.students))}>
      <Icon name="education" size={14} /> Student Portal
    </SwitchButton>
  );
  const portalNote = form.students
    ? form.status === "open"
      ? form.kind === "survey"
        ? "In students’ Assignments"
        : "Students build copies from it"
      : "Shows to students once it takes responses"
    : "Not on the Student Portal";
  return (
    <div className="fm-bento">
      {form.copies ? (
        // A Proposal or Terminal Report: Students build its copies from the Student Portal, so its own link is only a preview.
        <section className="fm-tile fm-tile--link" aria-label="Student Portal">
          <span className="fm-tile__label">Student Portal</span>
          <p className="fm-linkbox">
            <Icon name="education" size={16} />
            <span className="fm-linkbox__url">{form.students ? "Published: student secretaries build copies from it" : "Not published to students yet"}</span>
          </p>
          <div className="fm-tile__row">
            {portal}
            {status}
            <a className="btn btn--sm fm-btn-glass" href={link} target="_blank" rel="noopener noreferrer">
              Preview <Icon name="arrow-up-right" size={14} />
            </a>
          </div>
          <p className="fm-tile__note">
            {!may.status && <StatusMark status={form.status} />}
            {form.closesOn ? `Until ${dayLabel(form.closesOn)}` : "One copy per project, each with its own link"}
          </p>
        </section>
      ) : (
        <section className="fm-tile fm-tile--link" aria-label="Responder link">
          <span className="fm-tile__label">Responder link</span>
          <p className="fm-linkbox">
            <Icon name="link" size={16} />
            <span className="fm-linkbox__url">{link.replace(/^https?:\/\//, "")}</span>
          </p>
          <div className="fm-tile__row">
            {!draft && (
              <button type="button" className="btn btn--sm fm-btn-gold" onClick={onCopy}>
                <Icon name="copy" size={15} /> Copy link
              </button>
            )}
            <a className="btn btn--sm fm-btn-glass" href={link} target="_blank" rel="noopener noreferrer">
              {draft ? "Preview" : "Open"} <Icon name="arrow-up-right" size={14} />
            </a>
            {status}
            {portal}
          </div>
          <p className="fm-tile__note">
            {!may.status && <StatusMark status={form.status} />}
            {draft
              ? publishes(form)
                ? "Once published, it’s fixed and its responses reach the Office."
                : "Only the people who run it can open it."
              : form.status === "open"
                ? form.closesOn
                  ? `Until ${dayLabel(form.closesOn)}`
                  : portalKind && form.students
                    ? portalNote
                    : "Anyone with the link"
                : "Responses are kept"}
          </p>
        </section>
      )}

      {may.read && (
        <section className="fm-tile fm-tile--stats" aria-label="Responses at a glance">
          <div className="fm-stat">
            <span className="fm-stat__label">{form.copies ? "Copies" : "Responses"}</span>
            <span className="fm-stat__value">{total}</span>
          </div>
          {week > 0 && (
            <div className="fm-stat">
              <span className="fm-stat__label">This week</span>
              <span className="fm-stat__value">{week}</span>
            </div>
          )}
          {stages.length > 0 && approved > 0 && (
            <div className="fm-stat">
              <span className="fm-stat__label">Approved</span>
              <span className="fm-stat__value">{approved}</span>
            </div>
          )}
          {last && (
            <div className="fm-stat">
              <span className="fm-stat__label">Last response</span>
              <span className="fm-stat__value fm-stat__value--text">{ago(last)}</span>
            </div>
          )}
        </section>
      )}

      <section className="fm-tile fm-tile--about" aria-labelledby={`about-${form.id}`}>
        <header className="fm-tile__head">
          <h3 id={`about-${form.id}`}>About</h3>
          {may.edit && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onEdit}>
              <Icon name="pen" size={14} /> Edit
            </button>
          )}
        </header>
        {form.description && <p className="fm-tile__lead">{form.description}</p>}
        <dl className="fm-facts">
          <div>
            <dt>Kind</dt>
            <dd>{formKindLabel(form.kind)}</dd>
          </div>
          {form.reference && (
            <div>
              <dt>Form number</dt>
              <dd>{form.reference}</dd>
            </div>
          )}
          {form.issuer && (
            <div>
              <dt>Issued by</dt>
              <dd>{form.issuer.name}</dd>
            </div>
          )}
          <div>
            <dt>Run by</dt>
            <dd>{form.shared ? "The Office (shared with every unit)" : form.holder.kind === "office" ? "The Office" : desk.holder === "office" ? form.holder.name : form.holder.kind === "student" ? "You" : "Your unit"}</dd>
          </div>
          {portalKind && (
            <div>
              <dt>Student Portal</dt>
              <dd>{portalNote}</dd>
            </div>
          )}
          {form.locked && (
            <div>
              <dt>Changes</dt>
              <dd>Fixed since it was published</dd>
            </div>
          )}
          {form.closesOn && (
            <div>
              <dt>Closes</dt>
              <dd>{dayLabel(form.closesOn)}</dd>
            </div>
          )}
          <div>
            <dt>Responses read as</dt>
            <dd>
              {form.prefix}-0001, {form.prefix}-0002…
            </dd>
          </div>
          <div>
            <dt>Answered as</dt>
            <dd>{form.copies ? "Team copies, built in the Student Portal" : "One response at a time"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              {ago(form.updatedAt)} · {form.updatedBy}
            </dd>
          </div>
        </dl>
      </section>

      <section className="fm-tile fm-tile--map" aria-labelledby={`map-${form.id}`}>
        <header className="fm-tile__head">
          <h3 id={`map-${form.id}`}>What it asks</h3>
          <span className="fm-tile__meta">
            {plural(sections.length, "section")} · {plural(questions, "question")}
          </span>
          {onBuild && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={onBuild}>
              <Icon name="layers" size={14} /> Edit questions
            </button>
          )}
        </header>
        <ol className="fm-map">
          {sections.map((s, i) => (
            <li key={s.id}>
              <span className="fm-map__icon" aria-hidden="true">
                {isIconName(s.icon) ? <Icon name={s.icon} size={15} /> : i + 1}
              </span>
              <span className="fm-map__name">{s.title}</span>
              <span className="fm-map__qs">
                {s.fields
                  .filter((f) => f.type !== "note")
                  .map((f) => (
                    <span key={f.id} className="fm-map__q" title={`${MODULE_NAMES[f.type]}${f.required ? "" : " · optional"}`}>
                      <Icon name={MODULE_ICON[f.type]} size={12} />
                      {f.label}
                    </span>
                  ))}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {stages.length > 0 && (
        <section className="fm-tile fm-tile--chain" aria-labelledby={`chain-${form.id}`}>
          <header className="fm-tile__head">
            <h3 id={`chain-${form.id}`}>Sign-offs</h3>
            <span className="fm-tile__meta">Recorded here, no paper signatures</span>
          </header>
          <ol className="fm-chain">
            {stages.map((s, i) => (
              <li key={s.id}>
                <span className="fm-chain__num">{i + 1}</span>
                <span className="fm-chain__verb">{s.verb}</span>
                <span className="fm-chain__role">{s.role}</span>
                {s.showIf && <span className="fm-chain__when">When it applies</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/* ---------- Edit details ---------- */

type DetailsFields = { title: string; description: string; kind: FormKind; reference: string; issuerId: string; closesOn: string; prefix: string };

export function DetailsSheet({ form, desk, onSave, onClose }: { form: FormItem; desk: FormsDesk; onSave: (f: DetailsFields) => Promise<CommandResult>; onClose: () => void }) {
  const [f, setF] = useState<DetailsFields>({
    title: form.title,
    description: form.description,
    kind: form.kind,
    reference: form.reference ?? "",
    issuerId: form.issuer?.id ?? "",
    closesOn: form.closesOn ?? "",
    prefix: form.prefix,
  });
  // The kinds its holder may make; the kind is set while it's a draft (it decides copies and the Student Portal).
  const kinds = FORM_KINDS.filter((k) => HOLDER_KINDS[form.holder.kind].includes(k.key));
  const [busy, setBusy] = useState(false);
  const sectionId = useId();
  const set = (change: Partial<DetailsFields>) => setF((x) => ({ ...x, ...change }));
  return (
    <Sheet title="Edit details" onClose={onClose} className="fm-sheet">
      {(close) => (
        <form
          className="ws-sheet__body fm-sheet__body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if ((await onSave(f)).ok) close();
            else setBusy(false);
          }}
        >
          <div className="fm-sheet__scroll">
            <p className="fm-sheet__intro">Update the form’s identity and how people respond.</p>
            <div className="fm-sheet__grid">
              <section className="fm-sheet__identity" aria-labelledby={`${sectionId}-identity`}>
                <h3 className="fm-sheet__section-title" id={`${sectionId}-identity`}>Form identity</h3>
                <label className="field">
                  <span className="field__label">Title</span>
                  <input className="input" title="" value={f.title} maxLength={FORM_LIMITS.title} required data-missing="Give the form a title." onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">Description <em>· optional</em></span>
                  <textarea className="textarea" rows={4} title="" value={f.description} maxLength={FORM_LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">Form number <em>· optional</em></span>
                  <input className="input" title="" value={f.reference} maxLength={FORM_LIMITS.reference} placeholder="UST:S040-00-FO21" onChange={(e) => set({ reference: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">Issued by <em>· optional</em></span>
                  <Select className="select" value={f.issuerId} onChange={(v) => set({ issuerId: v })} searchable placeholder="No office named">
                    <option value="">No office named</option>
                    {desk.issuers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </label>
              </section>
              <section className="fm-sheet__settings" aria-labelledby={`${sectionId}-settings`}>
                <h3 className="fm-sheet__section-title" id={`${sectionId}-settings`}>Settings</h3>
                <label className="field">
                  <span className="field__label">Kind</span>
                  <Select className="select" value={f.kind} onChange={(v) => set({ kind: v as FormKind })} disabled={form.status !== "draft" || kinds.length < 2}>
                    {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </Select>
                </label>
                <label className="field">
                  <span className="field__label">Reference prefix</span>
                  <input className="input" title="" value={f.prefix} maxLength={FORM_LIMITS.prefix} pattern="[A-Za-z]{1,6}" required data-missing="Use 1 to 6 letters." onChange={(e) => set({ prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
                  <small className="fm-sheet__hint">Example: {f.prefix || "…"}-0001</small>
                </label>
                <label className="field">
                  <span className="field__label">Closes on <em>· optional</em></span>
                  <DateField displayFormat="long" className="input" value={f.closesOn} onChange={(d) => set({ closesOn: d })} placeholder="Stays open" aria-label="Closes on" />
                </label>
                {f.closesOn && <button type="button" className="fr-link fm-sheet__clear" onClick={() => set({ closesOn: "" })}>Keep it open with no closing day</button>}
              </section>
            </div>
          </div>
          <footer className="ws-sheet__foot">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={busy} aria-busy={busy || undefined}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}
