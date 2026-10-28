"use client";

/*
 * The research article and report form. On the right, the details in the order a reference is read: title, who
 * wrote it, where and when, the abstract, how to reach it, then what it serves. On the left, what the public
 * website will show (the citation card, or the cover made from the report's own details) and what publishing still
 * needs. The PDF uploads while the person fills in the rest; saving or publishing sends one governance command,
 * which the server checks, applies and audits.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type Ref, type CSSProperties } from "react";
import { discardDocumentUpload, startDocumentUpload } from "@/app/actions/documents";
import type { DocumentInput } from "@/lib/governance/commands";
import { citation, cleanDoi, cleanUrl, DOC_COVER_TONES, DOC_LIMITS, DOC_NOUN } from "@/lib/governance/documents";
import type { DocumentDesk, DocumentRow } from "@/lib/governance/hub-types";
import type { DocumentCoverTone, DocumentKind } from "@/lib/governance/types";
import { useGovern } from "@/components/hub/HubProvider";
import { useReference } from "@/components/reference/ReferenceProvider";
import { Switch } from "@/components/admin/ui";
import { DocCover } from "@/components/site/publications/DocCover";
import { byline, issuedDay } from "@/components/site/publications/doc-format";
import { Icon } from "@/components/ui/Icon";
import { DateField, Select } from "@/components/ui/pickers";
import { toast } from "@/components/ui/toast";
import { recheckField } from "@/components/ui/validation";
import { Dropzone, SdgPicker, UploadRow, sizeOf, sizePair, timeLeft } from "./ComposerPanels";
import { PostStatusPill } from "./PostComposer";
import { upload } from "./media";

const MB = 1_048_576;

type Pdf = {
  name: string;
  size: number;
  /** The saved upload, once it is in storage. */
  src?: string;
  /** 0–1 while uploading, and when the upload began. */
  progress?: number;
  started?: number;
  failed?: string;
  file?: File;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A text box as tall as what is written in it. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function DocumentForm({
  kind,
  row,
  types,
  units,
  needsApproval,
  canPublish,
  onClose,
}: {
  kind: DocumentKind;
  row: DocumentRow | null;
  types: string[];
  units: DocumentDesk["units"];
  needsApproval: boolean;
  canPublish: boolean;
  onClose: () => void;
}) {
  const ids = useId();
  const noun = DOC_NOUN[kind];
  const { office } = useReference();
  const { run } = useGovern();
  const dialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const abstractRef = useRef<HTMLTextAreaElement>(null);
  const doiRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const authorsProxy = useRef<HTMLInputElement>(null);
  const authorsBox = useRef<HTMLDivElement>(null);
  const armed = useRef(false);
  const sending = useRef<AbortController | null>(null);
  // Uploads made in this form: whatever isn't saved is cleared when it closes.
  const uploaded = useRef<string[]>([]);

  const [title, setTitle] = useState(row?.title ?? "");
  const [authors, setAuthors] = useState<string[]>(row?.authors ?? (kind === "report" ? [office.name] : []));
  const [venue, setVenue] = useState(row?.venue ?? "");
  const [type, setType] = useState(row?.type ?? types[0] ?? "");
  const [issued, setIssued] = useState(row?.issued ?? today());
  const [abstract, setAbstract] = useState(row?.abstract ?? "");
  const [doi, setDoi] = useState(row?.doi ?? "");
  const [url, setUrl] = useState(row?.url ?? "");
  const [pdf, setPdf] = useState<Pdf | null>(row?.file ? { name: row.file.name, size: row.file.sizeMB * MB, src: row.file.src } : null);
  const [sdgs, setSdgs] = useState<number[]>(row?.sdgs ?? []);
  const [keywords, setKeywords] = useState<string[]>(row?.keywords ?? []);
  const [unit, setUnit] = useState(row?.unitSlug ?? "");
  const [featured, setFeatured] = useState(row?.featured ?? false);
  const [coverTone, setCoverTone] = useState<DocumentCoverTone | undefined>(row?.coverTone);
  const [saving, setSaving] = useState<false | "draft" | "publish">(false);
  const [leaving, setLeaving] = useState(false);

  const status = row?.status ?? "Draft";
  const signature = () => JSON.stringify([title.trim(), authors, venue.trim(), type, issued, abstract.trim(), doi.trim(), url.trim(), pdf?.src ?? pdf?.name ?? null, sdgs, keywords, unit, featured, coverTone]);
  const [initial] = useState(signature);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    fit(titleRef.current);
    fit(abstractRef.current);
    if (!row) titleRef.current?.focus();
  }, [row]);

  useEffect(() => {
    if (leaving && leaveDialog.current && !leaveDialog.current.open) leaveDialog.current.showModal();
  }, [leaving]);

  /** Close, clearing uploads the saved document doesn't keep. */
  const finish = (kept?: string) => {
    sending.current?.abort();
    for (const src of uploaded.current) if (src !== kept) void discardDocumentUpload(src);
    uploaded.current = [];
    dialog.current?.close();
    onClose();
  };

  const requestClose = () => (signature() === initial ? finish(row?.file?.src) : setLeaving(true));

  /* ---------- Checks the browser runs on submit ---------- */

  const accessProblem = (publish: boolean, next: { doi?: string; url?: string; pdf?: Pdf | null } = {}) => {
    const d = next.doi ?? doi;
    const u = next.url ?? url;
    const p = next.pdf === undefined ? pdf : next.pdf;
    if (!publish || d.trim() || u.trim() || p) return "";
    return kind === "article" ? "Add the DOI, a link or the PDF." : "Add the PDF or a link.";
  };

  /** Where the "how to reach it" message sits: the DOI for an article, the link for a report. */
  const checkAccess = (next: { doi?: string; url?: string; pdf?: Pdf | null } = {}) => {
    const d = next.doi ?? doi;
    const u = next.url ?? url;
    const missing = accessProblem(armed.current, next);
    const doiBad = d.trim() && !cleanDoi(d) ? "Enter the DOI as printed, like 10.1016/j.jclepro.2026.01.004." : "";
    doiRef.current?.setCustomValidity(doiBad || (kind === "article" ? missing : ""));
    const urlBad = u.trim() && !cleanUrl(u) ? "Enter a link that starts with https://." : "";
    urlRef.current?.setCustomValidity(urlBad || (kind === "report" ? missing : ""));
  };

  /** Publishing asks for more than a draft: set the checks the browser runs on the next submit. */
  const arm = (publish: boolean) => {
    armed.current = publish;
    if (authorsProxy.current) authorsProxy.current.required = publish;
    abstractRef.current?.setCustomValidity(publish && abstract.trim().length < 40 ? `Write the ${noun.summary.toLowerCase()} in a few sentences.` : "");
    checkAccess();
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (pdf && !pdf.src) return toast(pdf.failed ? "Retry or remove the PDF that didn’t upload." : "Wait for the PDF to finish uploading.", "info");
    const publish = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.intent === "publish";
    const input: DocumentInput = {
      title,
      authors,
      venue,
      type,
      abstract,
      issued,
      doi,
      url,
      file: pdf?.src ? { src: pdf.src, name: pdf.name, sizeMB: Math.round((pdf.size / MB) * 10) / 10 } : null,
      sdgs,
      keywords,
      unitSlug: unit,
      featured,
      coverTone,
    };
    setSaving(publish ? "publish" : "draft");
    const r = await run({ type: "document.save", id: row?.id, kind, input, publish });
    setSaving(false);
    toast(r.message, r.ok ? "ok" : "error");
    if (r.ok) finish(input.file?.src);
  };

  /* ---------- The PDF ---------- */

  const send = async (file: File) => {
    sending.current?.abort();
    const ctl = new AbortController();
    sending.current = ctl;
    setPdf({ name: file.name, size: file.size, progress: 0, started: Date.now(), file });
    checkAccess({ pdf: { name: file.name, size: file.size } });
    const started = await startDocumentUpload({ name: file.name, size: file.size });
    if (ctl.signal.aborted) return;
    if (!started.ok) return setPdf((p) => (p?.file === file ? { ...p, progress: undefined, failed: started.message } : p));
    uploaded.current.push(started.src);
    try {
      await upload(started.url, { blob: file, type: "application/pdf", width: 0, height: 0 }, (x) => setPdf((p) => (p?.file === file ? { ...p, progress: x } : p)), ctl.signal);
      setPdf((p) => (p?.file === file ? { name: file.name, size: file.size, src: started.src } : p));
    } catch {
      if (!ctl.signal.aborted) setPdf((p) => (p?.file === file ? { ...p, progress: undefined, failed: "Didn’t upload. Check your connection and retry." } : p));
    }
  };

  const pick = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) return toast(`${file.name} isn’t a PDF.`, "error");
    if (file.size > DOC_LIMITS.fileMb * MB) return toast(`${file.name} is larger than ${DOC_LIMITS.fileMb} MB.`, "error");
    void send(file);
  };

  const removePdf = () => {
    sending.current?.abort();
    setPdf(null);
    checkAccess({ pdf: null });
  };

  /* ---------- What publishing needs ---------- */

  const steps: { label: string; done: boolean }[] = [
    { label: "Title", done: title.trim().length >= 4 },
    { label: noun.authors, done: authors.length > 0 },
    { label: noun.summary, done: abstract.trim().length >= 40 },
    { label: kind === "article" ? "DOI, link or PDF" : "PDF or link", done: !!(cleanDoi(doi) || cleanUrl(url) || pdf?.src) },
  ];
  const ready = steps.every((s) => s.done);

  const publishLabel = needsApproval ? "Send for approval" : "Publish";
  const actions: { label: string; busy: string; intent: "draft" | "publish"; primary?: boolean }[] =
    status === "Published"
      ? [{ label: "Update", busy: "Updating…", intent: "publish", primary: true }]
      : status === "In review" && row?.requestId
        ? [{ label: "Save changes", busy: "Saving…", intent: "draft", primary: true }]
        : [
            { label: status === "In review" ? "Save changes" : "Save draft", busy: "Saving…", intent: "draft", primary: !canPublish },
            ...(canPublish ? [{ label: publishLabel, busy: needsApproval ? "Sending…" : "Publishing…", intent: "publish" as const, primary: true }] : []),
          ];

  const groups = [...new Set(units.map((u) => u.group))];
  const year = issued.slice(0, 4) || String(new Date().getFullYear());

  return (
    <dialog
      ref={dialog}
      className="pc df"
      aria-labelledby={`${ids}-heading`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onKeyDown={(e) => {
        // Handled here so the browser never closes the form behind the person's back. A picker's Esc closes the picker.
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          requestClose();
        }
      }}
    >
      <form className="pc__form" onSubmit={submit}>
        <header className="pc-head">
          <span className="pc-head__spacer" />
          <h2 id={`${ids}-heading`} className="pc-head__title">
            {row ? `Edit ${noun.one}` : `New ${noun.one}`}
          </h2>
          <button type="button" className="pc-iconbtn" aria-label="Close" onClick={requestClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="df__body" inert={leaving}>
          {/* ---------- What the website will show ---------- */}
          <aside className="df__preview" aria-label="Preview">
            <div className="df__previewhead">
              <span className="df__eyebrow">On the website</span>
              <PostStatusPill status={status} />
            </div>
            {kind === "report" ? (
              <div className="df__cover">
                <DocCover tone={coverTone} title={title.trim() || "Report title"} type={type || "Report"} year={year} size="md" />
              </div>
            ) : (
              <article className="df__card">
                <p className="df__card-kicker">
                  {type || "Article"}
                  {venue.trim() && (
                    <>
                      {" · "}
                      <i>{venue.trim()}</i>
                    </>
                  )}
                </p>
                <p className={`df__card-title${title.trim() ? "" : " is-empty"}`}>{title.trim() || "Article title"}</p>
                <p className="df__card-by">{byline(authors) || "Authors"}</p>
                <p className="df__card-meta">
                  {issued && <span>{issuedDay(issued)}</span>}
                  {cleanDoi(doi) && <span className="df__chip">DOI</span>}
                  {pdf?.src && <span className="df__chip">PDF</span>}
                </p>
                {authors.length > 0 && title.trim() && issued && <p className="df__card-cite">{citation({ authors, issued, title: title.trim(), venue: venue.trim(), doi: cleanDoi(doi) ?? undefined, url: cleanUrl(url) ?? undefined })}</p>}
              </article>
            )}

            <section className="df__ready" aria-labelledby={`${ids}-ready`}>
              <h3 id={`${ids}-ready`} className="df__eyebrow">
                {ready ? "Ready to publish" : `To publish · ${steps.filter((s) => s.done).length} of ${steps.length}`}
              </h3>
              <ol className="df__steps">
                {steps.map((s) => (
                  <li key={s.label} className={s.done ? "is-done" : undefined}>
                    <span className="df__tick" aria-hidden="true">
                      {s.done && <Icon name="check" size={12} strokeWidth={3} />}
                    </span>
                    {s.label}
                    <span className="sr-only">{s.done ? ", done" : ", missing"}</span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>

          {/* ---------- The details ---------- */}
          <div className="df__fields">
            <label className="sr-only" htmlFor={`${ids}-title`}>
              Title
            </label>
            <textarea
              ref={titleRef}
              id={`${ids}-title`}
              className="pc-title df__title"
              rows={1}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value.replace(/\s*[\r\n]+\s*/g, " "));
                fit(e.target);
              }}
              placeholder={kind === "article" ? "Article title" : "Report title"}
              required
              minLength={4}
              maxLength={DOC_LIMITS.title}
              data-missing="Add a title."
              autoComplete="off"
            />

            <Field label={noun.authors} htmlFor={`${ids}-authors`}>
              <ChipInput
                boxRef={authorsBox}
                id={`${ids}-authors`}
                value={authors}
                onChange={(next) => {
                  setAuthors(next);
                  recheckField(authorsBox.current);
                }}
                max={DOC_LIMITS.authors}
                maxLength={DOC_LIMITS.author}
                split={/[;\n]+/}
                placeholder={authors.length ? "Add another" : kind === "article" ? "Type a name, then Enter" : "Who prepared it"}
                label={noun.authors}
              />
              <input ref={authorsProxy} className="pick-proxy" tabIndex={-1} aria-hidden="true" value={authors.join(";")} onChange={() => {}} data-missing={kind === "article" ? "Add at least one author." : "Say who prepared it."} />
            </Field>

            <div className="df__row">
              <Field label="Type" htmlFor={`${ids}-type`}>
                <Select id={`${ids}-type`} className="select" value={type} onChange={setType} required placeholder="Choose a type" aria-label="Type">
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Published" htmlFor={`${ids}-issued`}>
                <DateField id={`${ids}-issued`} value={issued} onChange={setIssued} min="1900-01-01" max={today()} required aria-label="Publication date" />
              </Field>
            </div>

            <Field label={noun.venue} htmlFor={`${ids}-venue`}>
              <input
                id={`${ids}-venue`}
                className="input"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                maxLength={DOC_LIMITS.venue}
                placeholder={kind === "article" ? "Journal of Cleaner Production" : office.name}
                autoComplete="off"
              />
            </Field>

            <Field label={noun.summary} htmlFor={`${ids}-abstract`} note={`${abstract.length.toLocaleString("en")} / ${DOC_LIMITS.abstract.toLocaleString("en")}`}>
              <textarea
                ref={abstractRef}
                id={`${ids}-abstract`}
                className="textarea df__abstract"
                value={abstract}
                onChange={(e) => {
                  setAbstract(e.target.value);
                  e.target.setCustomValidity("");
                  fit(e.target);
                }}
                maxLength={DOC_LIMITS.abstract}
                placeholder={kind === "article" ? "Paste the abstract as published." : "What the report found, in a few sentences."}
              />
            </Field>

            <section className="df__set" aria-labelledby={`${ids}-access`}>
              <h3 id={`${ids}-access`} className="df__setlabel">
                {kind === "article" ? "Where to read it" : "The report"}
              </h3>
              {pdf ? (
                <UploadRow
                  badge={
                    <span className="df__pdf" aria-hidden="true">
                      PDF
                    </span>
                  }
                  name={pdf.name}
                  meta={pdf.progress !== undefined ? `${sizePair(pdf.size * pdf.progress, pdf.size)} · ${timeLeft(pdf.progress, pdf.started)}` : sizeOf(pdf.size)}
                  progress={pdf.progress}
                  failed={pdf.failed}
                  onRetry={() => pdf.file && void send(pdf.file)}
                  onRemove={removePdf}
                  removeLabel={`Remove ${pdf.name}`}
                />
              ) : (
                <Dropzone
                  noun="the PDF"
                  accept="application/pdf,.pdf"
                  sheets={[
                    ["PDF", "#e5484d"],
                    ["PDF", "#b07d00"],
                  ]}
                  hint={<>PDF · up to {DOC_LIMITS.fileMb}&nbsp;MB · free to download once published</>}
                  onFiles={pick}
                />
              )}
              <div className={kind === "article" ? "df__row" : undefined}>
                {kind === "article" && (
                  <Field label="DOI" htmlFor={`${ids}-doi`}>
                    <input
                      ref={doiRef}
                      id={`${ids}-doi`}
                      className="input"
                      value={doi}
                      onChange={(e) => {
                        setDoi(e.target.value);
                        checkAccess({ doi: e.target.value });
                      }}
                      placeholder="10.1016/j.jclepro.2026.01.004"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                )}
                <Field label={kind === "article" ? "Link" : "Online version"} htmlFor={`${ids}-url`}>
                  <input
                    ref={urlRef}
                    id={`${ids}-url`}
                    className="input"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      checkAccess({ url: e.target.value });
                    }}
                    placeholder="https://"
                    maxLength={DOC_LIMITS.url}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </section>

            <section className="df__set" aria-labelledby={`${ids}-serves`}>
              <h3 id={`${ids}-serves`} className="df__setlabel">
                What it serves
              </h3>
              <Field label="Unit" htmlFor={`${ids}-unit`}>
                <Select id={`${ids}-unit`} className="select" value={unit} onChange={setUnit} searchable aria-label="Unit">
                  <option value="">University-wide</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {units
                        .filter((u) => u.group === g)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="SDGs" note={sdgs.length ? sdgs.map((n) => `SDG ${n}`).join(", ") : "Optional"}>
                <SdgPicker compact value={sdgs} onToggle={(n) => setSdgs((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))} />
              </Field>
              <Field label="Keywords" htmlFor={`${ids}-keys`} note={`${keywords.length} of ${DOC_LIMITS.keywords}`}>
                <ChipInput id={`${ids}-keys`} value={keywords} onChange={setKeywords} max={DOC_LIMITS.keywords} maxLength={DOC_LIMITS.keyword} split={/[,;\n]+/} placeholder="Type, then Enter" label="Keywords" />
              </Field>
            </section>

            <section className="df__set" aria-labelledby={`${ids}-display`}>
              <h3 id={`${ids}-display`} className="df__setlabel">Display</h3>
              {kind === "report" && (
                <fieldset className="df__cover-colors">
                  <legend>Book cover color</legend>
                  <div className="df__cover-options">
                    {[{ value: undefined, label: "Automatic", color: undefined }, ...DOC_COVER_TONES].map((tone) => (
                      <label key={tone.value ?? "auto"} className="df__cover-option">
                        <input type="radio" name={`${ids}-cover-color`} checked={coverTone === tone.value} onChange={() => setCoverTone(tone.value)} />
                        <span className={`df__cover-swatch${tone.value ? "" : " df__cover-swatch--auto"}`} style={tone.color ? { "--cover-color": tone.color } as CSSProperties : undefined} aria-hidden="true">
                          {coverTone === tone.value && <Icon name="check" size={14} />}
                        </span>
                        <span>{tone.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="df__feature" data-enabled={featured}>
                <span>
                  <b>Lead the page</b>
                  <span>Shown first on {kind === "article" ? "Research Articles" : "Reports & Insights"}.</span>
                </span>
                <div className="df__feature-control">
                  <span className="df__feature-state" aria-hidden="true">{featured ? "On" : "Off"}</span>
                  <Switch checked={featured} onChange={setFeatured} label="Lead the page" />
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="pc-foot">
          {(pdf?.progress !== undefined || row?.requestId) && (
            <span className="pc-actions__note" aria-live="polite">
              {pdf?.progress !== undefined ? "Uploading the PDF…" : "Waiting for approval"}
            </span>
          )}
          <div className="pc-actions">
            {actions.map((a) => (
              <button
                key={a.intent}
                type="submit"
                data-intent={a.intent}
                className={`btn ${a.primary ? "btn--dark" : ""} pc-actions__btn`}
                disabled={!!saving || pdf?.progress !== undefined}
                onClick={() => arm(a.intent === "publish")}
              >
                {saving === a.intent ? a.busy : a.label}
              </button>
            ))}
          </div>
        </footer>
      </form>

      {leaving && (
        <dialog
          ref={leaveDialog}
          className="pc-leave"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${ids}-leave`}
          aria-describedby={`${ids}-leave-text`}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setLeaving(false);
          }}
        >
          <div className="pc-leave__card">
            <h3 id={`${ids}-leave`} className="pc-leave__title">
              {row ? "Discard your changes?" : `Discard this ${noun.one}?`}
            </h3>
            <p id={`${ids}-leave-text`} className="pc-leave__text">
              {row ? `The ${noun.one} stays as it was.` : "Nothing you entered here is saved."}
            </p>
            <div className="pc-leave__actions">
              <button type="button" className="btn" onClick={() => setLeaving(false)} autoFocus>
                Keep editing
              </button>
              <button type="button" className="btn btn--danger" onClick={() => finish(row?.file?.src)}>
                Discard
              </button>
            </div>
          </div>
        </dialog>
      )}
    </dialog>
  );
}

function Field({ label, htmlFor, note, children }: { label: string; htmlFor?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="field df__field">
      <span className="df__fieldhead">
        {htmlFor ? (
          <label className="field__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field__label">{label}</span>
        )}
        {note && <span className="df__note">{note}</span>}
      </span>
      {children}
    </div>
  );
}

/**
 * Names or words as removable chips, typed into one box: Enter (or a separator) adds what is typed, Backspace on an
 * empty box takes the last one back, and pasting a list adds each.
 */
export function ChipInput({
  id,
  value,
  onChange,
  max,
  maxLength,
  split,
  placeholder,
  label,
  boxRef,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  maxLength: number;
  split: RegExp;
  placeholder: string;
  label: string;
  boxRef?: Ref<HTMLDivElement>;
}) {
  const [draft, setDraft] = useState("");
  const add = (text: string) => {
    const words = text
      .split(split)
      .map((w) => w.trim().replace(/\s+/g, " ").slice(0, maxLength))
      .filter(Boolean);
    if (!words.length) return;
    const next = [...value];
    for (const w of words) if (next.length < max && !next.some((x) => x.toLowerCase() === w.toLowerCase())) next.push(w);
    onChange(next);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Backspace" && !draft && value.length) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === "Enter" || (e.key === "," && split.test(","))) {
      e.preventDefault();
      add(draft);
    }
  };
  return (
    <div ref={boxRef} className="input df-chips" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      <ul className="df-chips__list" aria-label={label}>
        {value.map((v, i) => (
          <li key={v} className="df-chip">
            {label !== "Keywords" && value.length > 1 && <span className="df-chip__no">{i + 1}</span>}
            {v}
            <button type="button" className="df-chip__x" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
              <Icon name="close" size={12} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ul>
      {value.length < max && (
        <input
          id={id}
          className="df-chips__field"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (split.test(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!split.test(text)) return;
            e.preventDefault();
            add(text);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
        />
      )}
    </div>
  );
}
