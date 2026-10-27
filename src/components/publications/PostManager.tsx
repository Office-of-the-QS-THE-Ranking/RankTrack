"use client";

/*
 * Stories & News in the Office workspace (Publications): every post in one table (thumbnail, title, date posted,
 * author, status), filtered by status and searched by text, with a composer for new and existing posts.
 * Stories and unit proposals from before the composer sit in the same list and become posts when edited.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Command } from "@/lib/governance/commands";
import type { PostDesk, PostRow } from "@/lib/governance/hub-types";
import { excerpt } from "@/lib/governance/posts";
import { publicationsPath, storyPath } from "@/lib/publications";
import { plainText } from "@/lib/rich-text";
import { useGovern } from "@/components/hub/HubProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { InfoTooltip, Tabs, TabPanel } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { PostComposer, PostStatusPill } from "./PostComposer";

type Filter = "Published" | "Unpublished";
type Sort = { by: "date" | "title"; dir: 1 | -1 };

const FILTERS: { value: Filter; label: string }[] = [
  { value: "Published", label: "Published" },
  { value: "Unpublished", label: "Unpublished" },
];

const PAGE = 10;
const SEARCH_EXAMPLES = ["Search by post title", "Search by author", "Search by unit or content"];

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Manila" });
const FULL = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Manila" });

/** The date a row sorts by: when it was posted, else its last change. */
const when = (r: PostRow) => r.postedAt ?? r.updatedAt ?? "";

/** The picture a row shows: its thumbnail, else its first photo. */
const cover = (r: PostRow) => r.thumbnail ?? r.photos[0] ?? null;

export function PostManager({ desk }: { desk: PostDesk }) {
  const { rows, can } = desk;
  const { run, pending } = useGovern();
  const [filter, setFilter] = useState<Filter>("Published");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<PostRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<PostRow | null>(null);

  // A #slug (search results, links from other pages) opens that post in the composer.
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

  const counts = useMemo(() => ({ Published: rows.filter((row) => row.status === "Published").length, Unpublished: rows.filter((row) => row.status !== "Published").length }), [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hits = rows.filter((r) => (filter === "Published" ? r.status === "Published" : r.status !== "Published") && (!term || [r.title, r.subtitle, r.author.name, r.author.unit, plainText(r.body), ...r.hashtags.map((h) => `#${h}`)].some((t) => t.toLowerCase().includes(term))));
    return hits.sort((a, b) => (sort.by === "title" ? a.title.localeCompare(b.title) : when(a).localeCompare(when(b))) * sort.dir);
  }, [rows, filter, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE, at * PAGE + PAGE);

  const act = async (cmd: Command) => {
    const r = await run(cmd);
    toast(r.message, r.ok ? "ok" : "error");
    return r.ok;
  };

  /** Post or unpublish: posts by id, stories and proposals by slug. */
  const setLive = (r: PostRow, live: boolean) =>
    act(r.id ? { type: "post.status", id: r.id, status: live ? "Published" : "Unpublished" } : { type: "story.state", slug: r.slug, state: live ? "Published" : "Withdrawn" });

  const sortBy = (by: Sort["by"]) => {
    setSort((s) => (s.by === by ? { by, dir: s.dir === 1 ? -1 : 1 } : { by, dir: by === "date" ? -1 : 1 }));
    setPage(0);
  };
  const ariaSort = (by: Sort["by"]) => (sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : undefined);

  return (
    <>
      <PageHeader
        title={
          <span className="row" style={{ gap: 8 }}>
            Stories &amp; News
            <InfoTooltip label="How posts reach the public website">
              <span style={{ display: "block", width: 300, maxWidth: "calc(100vw - 56px)", fontWeight: 400 }}>
                Published posts appear on the public Stories &amp; News page.
                {desk.needsApproval ? " Posting needs approval from two other University-wide Administrators." : ""}
              </span>
            </InfoTooltip>
          </span>
        }
      />

      <div className="pm">
        <Tabs
          label="Show posts"
          idBase="story-posts"
          value={filter}
          onChange={(value) => { setFilter(value); setPage(0); }}
          tabs={FILTERS.map((item) => ({ key: item.value, label: item.label, count: counts[item.value] }))}
          actions={
            <>
              <Link href={publicationsPath("stories")} className="btn content-tabs__action"><Icon name="eye" size={16} /> Public view</Link>
              {can.create && <button type="button" className="btn content-tabs__action" onClick={() => setEditing("new")}><Icon name="plus" size={16} /> New post</button>}
            </>
          }
          search={<SearchField value={q} onChange={(value) => { setQ(value); setPage(0); }} placeholder="Search posts" label="Search posts" examples={SEARCH_EXAMPLES} shortcuts />}
        />
        {!desk.live && <span className="pm-off"><Icon name="eye" size={14} /> Public library off</span>}
        <TabPanel idBase="story-posts" index={FILTERS.findIndex((item) => item.value === filter)}>

        {!rows.length ? (
          <div className="pm-empty">
            <span className="pm-empty__art" aria-hidden="true">
              <Icon name="image" size={26} />
            </span>
            <p className="pm-empty__title">No posts yet</p>
            <p className="pm-empty__text">Share what Thomasians achieved. Published posts appear on the public Stories &amp; News page.</p>
            {can.create && (
              <button type="button" className="btn btn--dark" onClick={() => setEditing("new")}>
                <Icon name="plus" size={18} /> Create your first post
              </button>
            )}
          </div>
        ) : (
          <div className="pm-card">
            <table className="pm-table">
              <caption className="sr-only">Stories &amp; News posts</caption>
              <thead>
                <tr>
                  <th scope="col" className="pm-col-thumb">
                    Thumbnail
                  </th>
                  <th scope="col" aria-sort={ariaSort("title")}>
                    <button type="button" className="pm-sort" onClick={() => sortBy("title")}>
                      Title <SortMark on={sort.by === "title"} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("date")} className="pm-col-date">
                    <button type="button" className="pm-sort" onClick={() => sortBy("date")}>
                      Date posted <SortMark on={sort.by === "date"} dir={sort.dir} />
                    </button>
                  </th>
                  <th scope="col" className="pm-col-author">
                    Posted by
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
                {slice.map((r) => {
                  const pic = cover(r);
                  return (
                    <tr key={r.key} className="pm-row" onClick={() => setEditing(r)}>
                      <td className="pm-col-thumb">
                        <span className={`pm-thumb${pic ? "" : " pm-thumb--none"}`}>{pic ? <img src={pic.src} alt="" loading="lazy" decoding="async" /> : <Icon name="image" size={18} />}</span>
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
                          {r.title}
                        </button>
                        <span className="pm-sub">
                          {r.legacy === "proposal" && <span className="pm-tag">Unit proposal</span>}
                          {r.subtitle || excerpt(r.body, 120) || "No text yet"}
                        </span>
                      </td>
                      <td className="pm-col-date">
                        {r.postedAt ? (
                          <time dateTime={r.postedAt} title={FULL.format(new Date(r.postedAt))}>
                            {DAY.format(new Date(r.postedAt))}
                          </time>
                        ) : (
                          <span className="pm-muted">Not posted</span>
                        )}
                        {!r.postedAt && r.updatedAt && (
                          <span className="pm-note">
                            {r.legacy === "proposal" ? "Proposed" : "Saved"} {SHORT.format(new Date(r.updatedAt))}
                          </span>
                        )}
                      </td>
                      <td className="pm-col-author">
                        <span className="pm-author">
                          <span className="pm-author__text">
                            <span className="pm-author__name">{r.author.name}</span>
                            {r.author.unit !== r.author.name && <span className="pm-note">{r.author.unit}</span>}
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
                            r.status === "Published" && desk.live && { label: "View on site", icon: "external", onSelect: () => window.open(storyPath(r.slug), "_blank", "noopener") },
                            can.publish && r.status !== "Published" && !r.requestId && { label: desk.needsApproval ? "Send for approval" : "Post now", icon: "send", onSelect: () => setLive(r, true) },
                            can.publish && r.status === "Published" && { label: "Unpublish", icon: "eye", onSelect: () => setLive(r, false) },
                            can.edit && r.id && r.status === "In review" && { label: "Move to drafts", icon: "undo", onSelect: () => act({ type: "post.status", id: r.id!, status: "Draft" }) },
                            can.delete && r.id && { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(r) },
                          ]}
                          disabled={pending}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!shown.length && (
              <div className="pm-none">
                <p>No posts match.</p>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setQ("");
                    setPage(0);
                  }}
                  disabled={!q}
                >
                  Clear search
                </button>
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
        <PostComposer key={editing === "new" ? "new" : editing.key} row={editing === "new" ? null : editing} me={desk.me} needsApproval={desk.needsApproval} canPublish={can.publish} onClose={close} />
      )}

      {deleting && (
        <ConfirmDelete
          row={deleting}
          busy={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (await act({ type: "post.delete", id: deleting.id! })) setDeleting(null);
          }}
        />
      )}
    </>
  );
}

export function SortMark({ on, dir }: { on: boolean; dir: 1 | -1 }) {
  return <Icon name={on && dir === 1 ? "arrow-up" : "arrow-down"} size={13} className={`pm-sort__mark${on ? " is-on" : ""}`} />;
}

export type MenuItem = { label: string; icon: IconName; onSelect: () => void; danger?: boolean };

/** A row's actions in a popover that light-dismisses and is never clipped by the table. */
export function RowMenu({ label, items, disabled }: { label: string; items: (MenuItem | false | null | undefined | "")[]; disabled?: boolean }) {
  const list = items.filter(Boolean) as MenuItem[];
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const place = () => {
    const b = btn.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const below = window.innerHeight - b.bottom > p.offsetHeight + 12;
    p.style.left = `${Math.max(8, b.right - p.offsetWidth)}px`;
    p.style.top = `${below ? b.bottom + 6 : b.top - p.offsetHeight - 6}px`;
  };

  useEffect(() => {
    if (!open) return;
    const away = () => pop.current?.hidePopover();
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  if (!list.length) return null;
  const entries = () => [...(pop.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
  return (
    <>
      <button ref={btn} type="button" className="pm-menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => pop.current?.togglePopover()}>
        <Icon name="more" size={18} strokeWidth={2.4} />
      </button>
      <div
        ref={pop}
        popover="auto"
        role="menu"
        aria-label={label}
        className="pm-menu"
        onToggle={(e) => {
          const on = e.newState === "open";
          setOpen(on);
          if (on) {
            place();
            entries()[0]?.focus();
          }
        }}
        onKeyDown={(e) => {
          const all = entries();
          const i = all.indexOf(document.activeElement as HTMLButtonElement);
          const to = e.key === "ArrowDown" ? (i + 1) % all.length : e.key === "ArrowUp" ? (i - 1 + all.length) % all.length : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
          if (to < 0) return;
          e.preventDefault();
          all[to]?.focus();
        }}
      >
        {list.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={`pm-menu__item${it.danger ? " is-danger" : ""}`}
            onClick={() => {
              pop.current?.hidePopover();
              btn.current?.focus();
              it.onSelect();
            }}
          >
            <Icon name={it.icon} size={16} />
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function ConfirmDelete({ row, busy, onCancel, onConfirm }: { row: PostRow; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="pm-confirm" aria-labelledby="pm-confirm-title" onClose={onCancel}>
      <h2 id="pm-confirm-title" className="pm-confirm__title">
        Delete this post?
      </h2>
      <p className="pm-confirm__text">
        “{row.title}” {row.status === "Published" ? "leaves the public website, and its" : "and its"} pictures are removed for good.
      </p>
      <div className="pm-confirm__actions">
        <button type="button" className="btn" onClick={() => ref.current?.close()} autoFocus>
          Cancel
        </button>
        <button type="button" className="btn btn--danger" disabled={busy} onClick={onConfirm}>
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </dialog>
  );
}
