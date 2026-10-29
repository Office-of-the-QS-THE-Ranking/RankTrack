"use client";

import { closeModal } from "@/components/ui/modal-motion";

/*
 * Working Documents: a unit's documents in progress as links to where they live. One table (title, date, the
 * rankings they serve, status, and an icon per link: Google Docs, Sheets, Slides, Forms, Drive, PDF, Office
 * files or any page). Add document is a side panel with Details, Links and Remarks tabs.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { Command } from "@/lib/governance/commands";
import type { WorkingDesk, WorkingDocItem } from "@/lib/governance/hub-types";
import type { WorkingDocStatus } from "@/lib/governance/types";
import { familyOf } from "@/lib/reference";
import {
  cleanLink,
  LINK_KIND_LABEL,
  linkKind,
  linksIn,
  WORKING_LIMITS,
  WORKING_STATUSES,
  type LinkKind,
} from "@/lib/governance/workspace";
import { useGovern, useRankings } from "@/components/hub/HubProvider";
import { useReference } from "@/components/reference/ReferenceProvider";
import { Field, Sheet as AdminSheet } from "@/components/admin/ui";
import { SdgPicker } from "@/components/publications/ComposerPanels";
import { RowMenu, SortMark } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { DateField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { LinkGlyph } from "./LinkGlyph";
import { Sheet } from "./parts";
import { ShelfHero } from "./ShelfHero";

type Sort = { by: "title" | "date" | "status"; dir: 1 | -1 };

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const dayOf = (date: string) => DAY.format(new Date(`${date}T12:00:00+08:00`));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const statusClass = (s: WorkingDocStatus) => `ws-status ws-status--${s.toLowerCase().replace(/\s+/g, "-")}`;

/** Where a link points, short enough for a list: host and the start of the path. */
const shortLink = (href: string) => {
  try {
    const u = new URL(href);
    const path = u.pathname.length > 28 ? `${u.pathname.slice(0, 27)}…` : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path === "/" ? "" : path}`;
  } catch {
    return href;
  }
};

export function WorkingDocs({ desk }: { desk: WorkingDesk }) {
  const { run, pending } = useGovern();
  const rankings = useRankings();
  const ref = useReference();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });
  const [editing, setEditing] = useState<WorkingDocItem | "new" | null>(null);
  const [removing, setRemoving] = useState<WorkingDocItem | null>(null);
  /** The status picked on the header. */
  const [status, setStatus] = useState<WorkingDocStatus | null>(null);

  const short = (slug: string) => rankings.find((r) => r.slug === slug)?.short ?? ref.rankings.find((r) => r.slug === slug)?.short ?? slug;
  const band = (slug: string) => {
    const r = ref.rankings.find((x) => x.slug === slug);
    return r ? familyOf(ref, r.family).band : "var(--text-3)";
  };

  const act = async (cmd: Command) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    return r.ok;
  };

  const term = q.trim().toLowerCase();
  const shown = (() => {
    const rows = desk.docs.filter(
      (d) => (!status || d.status === status) && (!term || [d.title, d.status, d.addedBy, ...d.rankings.map(short), ...d.sdgs.map((n) => `SDG ${n}`), ...d.links.map((l) => LINK_KIND_LABEL[linkKind(l)])].some((x) => x.toLowerCase().includes(term))),
    );
    const key = (d: WorkingDocItem) => (sort.by === "title" ? d.title.toLowerCase() : sort.by === "status" ? String(WORKING_STATUSES.indexOf(d.status)) : d.date + d.updatedAt);
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  })();

  const sortBy = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "date" ? -1 : 1 }));
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);

  return (
    <div className="ws">
      <ShelfHero
        title="Working Documents"
        tone="working"
        chips={WORKING_STATUSES.map((s) => ({
          key: s,
          label: s,
          count: desk.docs.filter((d) => d.status === s).length,
          tone: s.toLowerCase().replace(/\s+/g, "-"),
        })).filter((c) => c.count > 0)}
        total={desk.docs.length}
        picked={status}
        onPick={(s) => setStatus(s as WorkingDocStatus | null)}
        filterLabel="Filter by status"
        art={(["gdoc", "gsheet", "gslides", "pdf"] as LinkKind[]).map((k) => (
          <span key={k} className="shelf-hero__link">
            <LinkGlyph kind={k} size={34} />
          </span>
        ))}
      />
      <div className="content-tabs">
        <div className="content-tabs__controls">
          {desk.canWrite && (
            <div className="content-tabs__actions">
              <button type="button" className="btn content-tabs__action" onClick={() => setEditing("new")}>
                <Icon name="plus" size={16} /> Add document
              </button>
            </div>
          )}
          <div className="content-tabs__search">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Search working documents"
              label="Search working documents"
              examples={["Search by title", "Search by ranking", "Search by status"]}
              shortcuts
            />
          </div>
        </div>
      </div>

      {!desk.docs.length ? (
        <div className="ws-empty">
          <span className="ws-empty__art ws-linkfan" aria-hidden="true">
            <LinkGlyph kind="gdoc" size={40} />
            <LinkGlyph kind="gsheet" size={40} />
            <LinkGlyph kind="gdrive" size={40} />
            <LinkGlyph kind="pdf" size={40} />
          </span>
          <p className="ws-empty__title">No working documents yet</p>
          <p className="ws-empty__text">Add links to Google Docs, Sheets, Forms, Drive folders, Office files or PDFs.</p>
          {desk.canWrite && (
            <button type="button" className="btn btn--dark" onClick={() => setEditing("new")}>
              <Icon name="plus" size={17} /> Add document
            </button>
          )}
        </div>
      ) : (
        <div className="ws-card">
          <table className="ws-table ws-docs">
            <caption className="sr-only">Working Documents</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort("title")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("title")}>
                    Title <SortMark on={sort.by === "title"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="ws-col-date" aria-sort={ariaSort("date")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("date")}>
                    Due <SortMark on={sort.by === "date"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="ws-col-tags">Tags</th>
                <th scope="col" className="ws-col-status" aria-sort={ariaSort("status")}>
                  <button type="button" className="pm-sort" onClick={() => sortBy("status")}>
                    Status <SortMark on={sort.by === "status"} dir={sort.dir} />
                  </button>
                </th>
                <th scope="col" className="ws-col-links">File</th>
                <th scope="col" className="ws-col-menu">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="ws-row">
                  <td className="ws-col-name">
                    <span className="ws-name">
                      <a className="ws-name__link" href={d.links[0]} target="_blank" rel="noopener noreferrer">
                        {d.title}
                      </a>
                      <span className="ws-name__sub">{d.addedBy}</span>
                    </span>
                  </td>
                  <td className="ws-col-date">{dayOf(d.date)}</td>
                  <td className="ws-col-tags">
                    {d.rankings.length ? (
                      <span className="ws-tags">
                        {d.rankings.map((s) => (
                          <span key={s} className="ws-ranking-dot" role="img" aria-label={short(s)} title={short(s)} data-tooltip-color={band(s)} style={{ background: band(s) }} />
                        ))}
                      </span>
                    ) : (
                      <span className="ws-none-mark" aria-label="No ranking tags">—</span>
                    )}
                  </td>
                  <td className="ws-col-status">
                    {desk.canWrite ? (
                      <span className="ws-status-pick" data-status={d.status}>
                        <Select
                          className="select select--sm"
                          value={d.status}
                          disabled={pending}
                          aria-label={`Status of ${d.title}`}
                          onChange={(v) => void act({ type: "workdoc.status", id: d.id, status: v as WorkingDocStatus })}
                        >
                          {WORKING_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </span>
                    ) : (
                      <span className={statusClass(d.status)}>{d.status}</span>
                    )}
                  </td>
                  <td className="ws-col-links">
                    <span className="ws-links">
                      {d.links.map((l) => {
                        const kind = linkKind(l);
                        return (
                          <a key={l} className="ws-links__a" href={l} target="_blank" rel="noopener noreferrer" aria-label={`Open in ${LINK_KIND_LABEL[kind]}: ${shortLink(l)}`}>
                            <LinkGlyph kind={kind} />
                          </a>
                        );
                      })}
                    </span>
                  </td>
                  <td className="ws-col-menu">
                    <RowMenu
                      label={`Actions for ${d.title}`}
                      disabled={pending}
                      items={[
                        ...d.links.map((l) => ({
                          label: `Open ${LINK_KIND_LABEL[linkKind(l)]}${d.links.filter((x) => linkKind(x) === linkKind(l)).length > 1 ? ` · ${shortLink(l)}` : ""}`,
                          icon: "external" as const,
                          onSelect: () => window.open(l, "_blank", "noopener,noreferrer"),
                        })),
                        desk.canWrite && { label: "Edit", icon: "pen", onSelect: () => setEditing(d) },
                        desk.canWrite && { label: "Remove", icon: "trash", danger: true, onSelect: () => setRemoving(d) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <div className="ws-none">
              <p>No documents match.</p>
              <button type="button" className="btn btn--sm" onClick={() => { setQ(""); setStatus(null); }}>
                Show all documents
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <DocSheet
          doc={editing === "new" ? null : editing}
          rankings={rankings.map((r) => ({ slug: r.slug, short: r.short, band: familyOf(ref, r.family).band }))}
          onSave={(fields) => act({ type: "workdoc.save", ...(desk.unitId && { unitId: desk.unitId }), ...(editing !== "new" && { id: editing.id }), ...fields })}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <Sheet title="Remove this document?" onClose={() => setRemoving(null)} className="ws-sheet--confirm">
          {(close) => (
            <div className="ws-sheet__body">
              <p className="ws-sheet__text">“{removing.title}” leaves Working Documents. The linked files stay where they are.</p>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={pending}
                  onClick={async () => {
                    if (await act({ type: "workdoc.delete", ids: [removing.id] })) close();
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

type Fields = { title: string; date: string; rankings: string[]; sdgs: number[]; status: WorkingDocStatus; links: string[]; remarks: string };

type Tab = "Details" | "Links" | "Remarks";
const DOC_TABS: Tab[] = ["Details", "Links", "Remarks"];
type Row = { key: number; text: string };

let rowKey = 0;
const row = (text = ""): Row => ({ key: ++rowKey, text });

/** What's wrong with a typed link, given the ones above it; "" when it's fine or empty. */
const linkProblem = (text: string, above: string[]) => {
  if (!text.trim()) return "";
  const link = cleanLink(text);
  if (!link) return "Use an https link, like https://docs.google.com/….";
  return above.map(cleanLink).includes(link) ? "This link is already listed." : "";
};

/**
 * Add or edit a working document, in the Invite someone panel's style. Details: title, due date, status, the
 * rankings and SDGs it serves. Links: one link per box, each showing what it opens. Only the
 * tab in view is in the form, so a save first checks the other tab and, when something there fails, opens it
 * and submits again so the Hub's field messages point at the field.
 */
function DocSheet({
  doc,
  rankings,
  onSave,
  onClose,
}: {
  doc: WorkingDocItem | null;
  rankings: { slug: string; short: string; band: string }[];
  onSave: (f: Fields) => Promise<boolean>;
  onClose: () => void;
}) {
  const formId = useId();
  const tabsId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<Tab>("Details");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [date, setDate] = useState(doc?.date ?? today());
  const [status, setStatus] = useState<WorkingDocStatus>(doc?.status ?? "Draft");
  const [tags, setTags] = useState<string[]>(doc?.rankings ?? []);
  const [sdgs, setSdgs] = useState<number[]>(doc?.sdgs ?? []);
  const [remarks, setRemarks] = useState(doc?.remarks ?? "");
  const [rows, setRows] = useState<Row[]>(() => (doc?.links.length ? doc.links.map((l) => row(l)) : [row()]));
  const [busy, setBusy] = useState(false);
  // Set when a save opened the other tab: submit again once its fields are in the form.
  const resubmit = useRef(false);
  const focusRow = useRef<number | null>(null);

  const texts = rows.map((r) => r.text);
  const links = [...new Set(texts.map(cleanLink).filter((l): l is string => !!l))];
  const detailsOk = !!title.trim() && !!date;
  const linksOk = links.length > 0 && texts.every((t, i) => !linkProblem(t, texts.slice(0, i)));

  useEffect(() => {
    if (!resubmit.current) return;
    resubmit.current = false;
    form.current?.requestSubmit();
  }, [tab]);

  useEffect(() => {
    if (focusRow.current === null) return;
    form.current?.querySelector<HTMLInputElement>(`[data-row="${focusRow.current}"]`)?.focus();
    focusRow.current = null;
  }, [rows]);

  const addRow = (text = "") => {
    const next = row(text);
    focusRow.current = next.key;
    setRows((rs) => [...rs, next]);
  };
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [row()]));
  const setRow = (key: number, text: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));

  const save = async () => {
    setBusy(true);
    if (await onSave({ title, date, rankings: tags, sdgs, status, links, remarks })) closeModal(form.current?.closest<HTMLElement>(".adm-sheet") ?? null, onClose);
    else setBusy(false);
  };

  return (
    <AdminSheet
      open
      wide
      onClose={onClose}
      title={doc ? "Edit document" : "Add document"}
      headerContent={
        <div className="adm-sheet__tabs">
          <Tabs<Tab>
            label="Document"
            idBase={tabsId}
            tabs={[
              { key: "Details", label: "Details", icon: "clipboard" },
              { key: "Links", label: "Links", icon: "link", count: links.length || undefined },
              { key: "Remarks", label: "Remarks", icon: "comment" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      }
      footer={
        <>
          <button type="button" className="btn" onClick={(event) => closeModal(event.currentTarget.closest<HTMLElement>(".adm-sheet"), onClose)}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn--dark" disabled={busy} aria-busy={busy}>
            {doc ? "Save" : "Add document"}
          </button>
        </>
      }
    >
      <TabPanel idBase={tabsId} index={DOC_TABS.indexOf(tab)}>
        <form
          ref={form}
          id={formId}
          className="adm-invite ws-docform"
          data-tab={tab}
          onSubmit={(e) => {
            e.preventDefault();
            const invalidTab: Tab | null = !linksOk ? "Links" : !detailsOk ? "Details" : null;
            if (invalidTab) {
              if (invalidTab !== tab) {
                resubmit.current = true;
                setTab(invalidTab);
              } else {
                form.current?.reportValidity();
              }
              return;
            }
            void save();
          }}
        >
          {tab === "Details" ? (
            <>
              <Field label="Title">
                <input
                  className="input"
                  name="title"
                  title=""
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={WORKING_LIMITS.title}
                  autoComplete="off"
                  required
                  data-missing="Give the document a title."
                />
              </Field>
              <div className="adm-invite__pair">
                <Field label="Date due">
                  <DateField className="input" name="date" value={date} onChange={setDate} aria-label="Date due" required data-missing="Choose the date it’s due." />
                </Field>
                <Field label="Status">
                  <Select className="select" name="status" value={status} onChange={(v) => setStatus(v as WorkingDocStatus)}>
                    {WORKING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {rankings.length > 0 && (
                <fieldset className="adm-field ws-tagpick">
                  <legend className="adm-field__label">
                    Rankings
                  </legend>
                  <div className="ws-tagpick__list">
                    {rankings.map((r) => {
                      const on = tags.includes(r.slug);
                      return (
                        <button
                          key={r.slug}
                          type="button"
                          className="ws-tagpick__tag"
                          aria-pressed={on}
                          onClick={() => setTags(on ? tags.filter((t) => t !== r.slug) : [...tags, r.slug])}
                        >
                          <i style={{ background: r.band }} />
                          {r.short}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <fieldset className="adm-field ws-tagpick">
                <legend className="adm-field__label">
                  SDGs {sdgs.length > 0 && <em>{sdgs.map((n) => `SDG ${n}`).join(", ")}</em>}
                </legend>
                <SdgPicker compact value={sdgs} onToggle={(n) => setSdgs((v) => (v.includes(n) ? v.filter((x) => x !== n) : [...v, n].sort((a, b) => a - b)))} />
              </fieldset>
            </>
          ) : tab === "Links" ? (
            <div className="adm-field">
              <span className="adm-field__label">Links</span>
              <ul className="ws-linkrows">
                {rows.map((r, i) => (
                  <LinkRow
                    key={r.key}
                    rowKey={r.key}
                    text={r.text}
                    problem={linkProblem(r.text, texts.slice(0, i))}
                    first={i === 0}
                    onChange={(text) => setRow(r.key, text)}
                    onPasteMany={(found) => {
                      const fresh = found.filter((l) => !links.includes(l));
                      setRows((rs) => {
                        const at = rs.findIndex((x) => x.key === r.key);
                        const room = WORKING_LIMITS.links - rs.length + 1;
                        const added = fresh.slice(0, room).map((l) => row(l));
                        return added.length ? [...rs.slice(0, at), ...added, ...rs.slice(at + 1)] : rs;
                      });
                    }}
                    onEnter={() => rows.length < WORKING_LIMITS.links && addRow()}
                    onRemove={() => removeRow(r.key)}
                  />
                ))}
              </ul>
              <button type="button" className="btn btn--sm ws-linkrows__add" onClick={() => addRow()} disabled={rows.length >= WORKING_LIMITS.links}>
                <Icon name="plus" size={15} /> Add link
              </button>
            </div>
          ) : (
            <Field label="Remarks">
              <textarea
                className="textarea ws-docform__remarks"
                name="remarks"
                rows={8}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                maxLength={WORKING_LIMITS.remarks}
                placeholder="Add notes or context about this document."
              />
            </Field>
          )}
        </form>
      </TabPanel>
    </AdminSheet>
  );
}

/** One link in its own box: what it opens on the left, the link, and a remove button on the right. */
function LinkRow({
  rowKey,
  text,
  problem,
  first,
  onChange,
  onPasteMany,
  onEnter,
  onRemove,
}: {
  rowKey: number;
  text: string;
  problem: string;
  first: boolean;
  onChange: (text: string) => void;
  onPasteMany: (links: string[]) => void;
  onEnter: () => void;
  onRemove: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const link = cleanLink(text);
  const kind = link ? linkKind(link) : null;
  useEffect(() => {
    field.current?.setCustomValidity(problem || (first && !text.trim() ? "Paste at least one link." : ""));
  }, [problem, first, text]);
  return (
    <li className="ws-linkrow" data-kind={kind ?? "none"}>
      <span className="ws-linkrow__kind">
        {kind ? <LinkGlyph kind={kind} size={22} /> : <Icon name="link" size={17} />}
        <span className="sr-only">{kind ? LINK_KIND_LABEL[kind] : "No link yet"}</span>
      </span>
      <input
        ref={field}
        className="input ws-linkrow__input"
        data-row={rowKey}
        type="text"
        inputMode="url"
        title=""
        value={text}
        placeholder="https://docs.google.com/…"
        aria-label={kind ? `Link, ${LINK_KIND_LABEL[kind]}` : "Link"}
        autoComplete="off"
        spellCheck={false}
        required={first}
        data-missing="Paste at least one link."
        maxLength={WORKING_LIMITS.link}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const { links } = linksIn(e.clipboardData.getData("text"));
          if (links.length < 2) return;
          e.preventDefault();
          onPasteMany(links);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing || !text.trim()) return;
          e.preventDefault();
          onEnter();
        }}
      />
      <button type="button" className="ws-linkrow__x" aria-label={text.trim() ? `Remove ${shortLink(link ?? text)}` : "Remove this link"} onClick={onRemove}>
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}
