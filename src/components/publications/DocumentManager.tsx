"use client";

import { closeModal, openModal } from "@/components/ui/modal-motion";

/*
 * Research Articles or Reports & Insights in the Office workspace (Publications): every document of the kind in one
 * table (cover, title, date, how readers reach it, status), filtered by status and searched by text, with a form
 * for new and existing ones. Same shape as Stories & News, so the three sections work alike.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Command } from "@/lib/governance/commands";
import { citation, DOC_NOUN, readerLink } from "@/lib/governance/documents";
import type { DocumentDesk, DocumentRow } from "@/lib/governance/hub-types";
import { documentPublicPath, publicationsPath, SECTION_OF, sectionLabel } from "@/lib/publications";
import { useGovern } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip, Tabs, TabPanel } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { DocCover } from "@/components/site/publications/DocCover";
import { DocumentForm } from "./DocumentForm";
import { PostStatusPill } from "./PostComposer";
import { RowMenu, SortMark } from "./PostManager";

type Filter = "Published" | "Unpublished";
type Sort = { by: "date" | "title"; dir: 1 | -1 };

const FILTERS: Filter[] = ["Published", "Unpublished"];
const PAGE = 10;

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Manila" });
const issued = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

export function DocumentManager({ desk }: { desk: DocumentDesk }) {
  const { rows, can, kind } = desk;
  const noun = DOC_NOUN[kind];
  const section = SECTION_OF[kind];
  const title = sectionLabel(section);
  const { run, pending } = useGovern();
  const [filter, setFilter] = useState<Filter>("Published");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<DocumentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);

  // A #slug (links from other pages) opens that document in the form.
  useEffect(() => {
    const sync = () => {
      const slug = decodeURIComponent(location.hash.slice(1));
      const hit = slug && rows.find((r) => r.slug === slug);
      if (hit) setEditing(hit);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [rows]);

  const close = useCallback(() => {
    setEditing(null);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }, []);

  const counts = useMemo(() => ({ Published: rows.filter((r) => r.status === "Published").length, Unpublished: rows.filter((r) => r.status !== "Published").length }), [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hits = rows.filter(
      (r) =>
        (filter === "Published" ? r.status === "Published" : r.status !== "Published") &&
        (!term || [r.title, r.venue, r.type, r.doi ?? "", r.unit ?? "", ...r.authors, ...r.keywords].some((t) => t.toLowerCase().includes(term))),
    );
    return hits.sort((a, b) => (sort.by === "title" ? a.title.localeCompare(b.title) : a.issued.localeCompare(b.issued)) * sort.dir);
  }, [rows, filter, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE, at * PAGE + PAGE);

  const act = async (cmd: Command) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    return r.ok;
  };

  const sortBy = (by: Sort["by"]) => {
    setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "date" ? -1 : 1 }));
    setPage(0);
  };
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);

  const copy = (r: DocumentRow) =>
    navigator.clipboard
      .writeText(citation(r))
      .then(() => toast("Citation copied.", "ok"))
      .catch(() => toast("Couldn’t copy the citation.", "error"));

  return (
    <>
      <PageHeader
        title={
          <span className="row" style={{ gap: 8 }}>
            {title}
            <InfoTooltip label={`How ${noun.many} reach the public website`}>
              <span style={{ display: "block", width: 300, maxWidth: "calc(100vw - 56px)", fontWeight: 400 }}>
                Published {noun.many} appear on the public {title} page, with their PDF to download.
                {desk.needsApproval ? " Publishing needs approval from two other University-wide Administrators." : ""}
              </span>
            </InfoTooltip>
          </span>
        }
      />

      <div className="pm">
        <Tabs
          label={`Show ${noun.many}`}
          idBase={`docs-${kind}`}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(0);
          }}
          tabs={FILTERS.map((f) => ({ key: f, label: f, count: counts[f] }))}
          actions={
            <>
              <Link href={publicationsPath(section)} className="btn content-tabs__action">
                <Icon name="eye" size={16} /> Public view
              </Link>
              {can.create && (
                <button type="button" className="btn content-tabs__action" onClick={() => setEditing("new")}>
                  <Icon name="plus" size={16} /> New {noun.one}
                </button>
              )}
            </>
          }
          search={
            <SearchField
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(0);
              }}
              placeholder={`Search ${noun.many}`}
              label={`Search ${noun.many}`}
              examples={kind === "article" ? ["Search by title", "Search by author", "Search by journal or DOI"] : ["Search by title", "Search by type", "Search by keyword"]}
              shortcuts
            />
          }
        />
        {!desk.live && (
          <span className="pm-off">
            <Icon name="eye" size={14} /> Publications off on the website
          </span>
        )}
        <TabPanel idBase={`docs-${kind}`} index={FILTERS.indexOf(filter)}>
          {!rows.length ? (
            <div className="pm-empty">
              <span className="dm-empty__art" aria-hidden="true">
                {kind === "report" ? (
                  <>
                    <DocCover title="Annual report" type="Annual report" year="" size="xs" />
                    <DocCover title="Ranking analysis" type="Ranking analysis" year="" size="xs" />
                    <DocCover title="Policy brief" type="Policy brief" year="" size="xs" />
                  </>
                ) : (
                  <>
                    <span className="dm-sheet" />
                    <span className="dm-sheet" />
                    <span className="dm-sheet">
                      <Icon name="research" size={22} />
                    </span>
                  </>
                )}
              </span>
              <p className="pm-empty__title">No {noun.many} yet</p>
              <p className="pm-empty__text">{kind === "article" ? "Add a published article with its DOI or PDF." : "Add a report with its PDF. The cover is made for you."}</p>
              {can.create && (
                <button type="button" className="btn btn--dark" onClick={() => setEditing("new")}>
                  <Icon name="plus" size={18} /> Add the first {noun.one}
                </button>
              )}
            </div>
          ) : (
            <div className="pm-card">
              <table className="pm-table dm-table">
                <caption className="sr-only">{title}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="dm-col-thumb">
                      <span className="sr-only">{kind === "report" ? "Cover" : "Year"}</span>
                    </th>
                    <th scope="col" aria-sort={ariaSort("title")}>
                      <button type="button" className="pm-sort" onClick={() => sortBy("title")}>
                        Title <SortMark on={sort.by === "title"} dir={sort.dir} />
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort("date")} className="pm-col-date">
                      <button type="button" className="pm-sort" onClick={() => sortBy("date")}>
                        Published <SortMark on={sort.by === "date"} dir={sort.dir} />
                      </button>
                    </th>
                    <th scope="col" className="dm-col-access">
                      Access
                    </th>
                    <th scope="col" className="pm-col-status">
                      Status
                    </th>
                    <th scope="col" className="pm-col-menu">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((r) => (
                    <tr key={r.id} className="pm-row dm-row" onClick={() => setEditing(r)}>
                      <td className="dm-col-thumb">
                        {kind === "report" ? (
                          <DocCover tone={r.coverTone} title={r.title} type={r.type} year={r.issued.slice(0, 4)} size="xs" />
                        ) : (
                          <span className="dm-year" aria-hidden="true">
                            <b>{r.issued.slice(0, 4)}</b>
                            <i />
                          </span>
                        )}
                      </td>
                      <td className="pm-col-title">
                        <button
                          type="button"
                          className="pm-title"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(r);
                          }}
                        >
                          {r.featured && (
                            <span className="dm-star" title="Leads the public page">
                              <Icon name="spark" size={13} />
                              <span className="sr-only">Featured: </span>
                            </span>
                          )}
                          {r.title}
                        </button>
                        <span className="pm-sub">
                          <span className="pm-tag">{r.type}</span>
                          {[r.authors.length ? (r.authors.length > 2 ? `${r.authors[0]} + ${r.authors.length - 1}` : r.authors.join(", ")) : "", r.venue].filter(Boolean).join(" · ") || "No details yet"}
                        </span>
                      </td>
                      <td className="pm-col-date">
                        <time dateTime={r.issued}>{issued(r.issued)}</time>
                        <span className="pm-note">
                          {r.publishedAt ? "On the website" : "Saved"} {SHORT.format(new Date(r.publishedAt ?? r.updatedAt))}
                        </span>
                      </td>
                      <td className="dm-col-access">
                        <span className="dm-access">
                          <span className={`dm-chip${r.file ? " is-on" : ""}`} title={r.file ? `${r.file.name}, ${r.file.sizeMB} MB` : "No PDF"}>
                            PDF
                          </span>
                          {kind === "article" && (
                            <span className={`dm-chip${r.doi ? " is-on" : ""}`} title={r.doi ?? "No DOI"}>
                              DOI
                            </span>
                          )}
                          <span className={`dm-chip${r.url ? " is-on" : ""}`} title={r.url ?? "No link"}>
                            Link
                          </span>
                        </span>
                      </td>
                      <td className="pm-col-status">
                        <PostStatusPill status={r.status} />
                        {r.requestId && <span className="pm-note">Awaiting approval</span>}
                      </td>
                      <td className="pm-col-menu" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          label={`Actions for ${r.title}`}
                          items={[
                            can.edit && { label: "Edit", icon: "pen", onSelect: () => setEditing(r) },
                            r.status === "Published" && desk.live && { label: "View on site", icon: "external", onSelect: () => window.open(documentPublicPath(r.kind, r.slug), "_blank", "noopener") },
                            r.file && { label: "Download PDF", icon: "download", onSelect: () => window.open(r.file!.src, "_blank", "noopener") },
                            !r.file && readerLink(r) && { label: kind === "article" ? "Open at publisher" : "Open link", icon: "external", onSelect: () => window.open(readerLink(r)!, "_blank", "noopener") },
                            kind === "article" && r.authors.length > 0 && { label: "Copy citation", icon: "quote", onSelect: () => void copy(r) },
                            can.publish && r.status !== "Published" && !r.requestId && { label: desk.needsApproval ? "Send for approval" : "Publish now", icon: "send", onSelect: () => act({ type: "document.status", id: r.id, status: "Published" }) },
                            can.publish && r.status === "Published" && { label: "Unpublish", icon: "eye", onSelect: () => act({ type: "document.status", id: r.id, status: "Unpublished" }) },
                            can.edit && r.status === "In review" && { label: "Move to drafts", icon: "undo", onSelect: () => act({ type: "document.status", id: r.id, status: "Draft" }) },
                            can.delete && { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(r) },
                          ]}
                          disabled={pending}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <div className="pm-none">
                  <p>{q ? `No ${noun.many} match.` : filter === "Published" ? `Nothing published yet.` : "No drafts."}</p>
                  {q && (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setQ("");
                        setPage(0);
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              {shown.length > PAGE && (
                <nav className="pm-pages" aria-label="Pages">
                  <span className="pm-note" aria-live="polite">
                    {at * PAGE + 1}–{Math.min(shown.length, at * PAGE + PAGE)} of {shown.length}
                  </span>
                  <button type="button" className="btn btn--sm btn--icon" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <button type="button" className="btn btn--sm btn--icon" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
                    <Icon name="chevron" size={16} />
                  </button>
                </nav>
              )}
            </div>
          )}
        </TabPanel>
      </div>

      {editing && (
        <DocumentForm
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          row={editing === "new" ? null : editing}
          types={desk.types}
          units={desk.units}
          needsApproval={desk.needsApproval}
          canPublish={can.publish}
          onClose={close}
        />
      )}

      {deleting && (
        <ConfirmDelete
          row={deleting}
          busy={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => act({ type: "document.delete", id: deleting.id })}
        />
      )}
    </>
  );
}

function ConfirmDelete({ row, busy, onCancel, onConfirm }: { row: DocumentRow; busy: boolean; onCancel: () => void; onConfirm: () => Promise<boolean> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) openModal(d);
  }, []);
  const noun = DOC_NOUN[row.kind].one;
  return (
    <dialog ref={ref} className="pm-confirm" aria-labelledby="dm-confirm-title" onClose={onCancel}
      onCancel={(event) => { event.preventDefault(); closeModal(event.currentTarget); }}>
      <h2 id="dm-confirm-title" className="pm-confirm__title">
        Delete this {noun}?
      </h2>
      <p className="pm-confirm__text">
        “{row.title}” {row.status === "Published" ? "leaves the public website" : "is removed"}
        {row.file ? ", and its PDF with it." : "."}
      </p>
      <div className="pm-confirm__actions">
        <button type="button" className="btn" onClick={() => closeModal(ref.current)} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn btn--danger" disabled={busy} onClick={async () => { if (await onConfirm()) closeModal(ref.current); }}>
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </dialog>
  );
}
