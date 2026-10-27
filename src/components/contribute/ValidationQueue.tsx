"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { daysUntil, formatDate, type EvidenceItem, type EvidenceStatus } from "@/lib/data";
import { useHub, useViewer } from "@/components/hub/HubProvider";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { ContributionRecord } from "./ContributionRecord";
import { ContributionsTable, openId, rowId } from "./ContributionsTable";
import { PipelineFlow } from "./PipelineFlow";
import { QueueArt } from "./QueueArt";
import { RecordModal } from "./RecordModal";
import { Mark, MiniTrack, TONE, ago } from "./parts";

type Tab = "Overview" | "Contributions";
type Filter = "All" | EvidenceStatus;
const FILTERS: Filter[] = ["All", "For review", "Needs revision", "Validated"];
/** The Overview's list leads with what is waiting. */
const ORDER: Partial<Record<EvidenceStatus, number>> = { "For review": 0, "Needs revision": 1 };

/** What an empty table says, by status. */
const CLEAR: Partial<Record<Filter, string>> = {
  "For review": "Nothing is waiting for review.",
  "Needs revision": "No submissions are out for revision.",
  Validated: "Nothing validated yet.",
  All: "Nothing here yet.",
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function Donut({ parts, children }: { parts: { tone: string; n: number }[]; children: ReactNode }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = parts.filter((p) => p.n).length > 1 ? 4 : 0;
  let at = 0;
  return (
    <div className="cv-donut">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r={r} className="cv-donut__track" />
        {parts.map((p, i) => {
          if (!p.n) return null;
          const len = (p.n / total) * c;
          const seg = (
            <circle
              key={p.tone}
              cx="66"
              cy="66"
              r={r}
              className={`cv-donut__seg is-${p.tone}`}
              style={{ strokeDasharray: `${Math.max(0.5, len - gap)} ${c}`, strokeDashoffset: -at, ["--i" as string]: i } as CSSProperties}
            />
          );
          at += len;
          return seg;
        })}
      </svg>
      <div className="cv-donut__core">{children}</div>
    </div>
  );
}

function EmptyView({ id, kind, title, sub }: { id: string; kind: "search" | "clear" | "start"; title: string; sub: string }) {
  return (
    <Tile id={id} className="cv-etile">
      <div className="cv-empty">
        <QueueArt kind={kind} />
        <h2 id={id} className="cv-empty__title">
          {title}
        </h2>
        <p className="cv-empty__sub">{sub}</p>
      </div>
    </Tile>
  );
}

/**
 * Contributions and validation. The Overview reads the queue: its statuses, the pipeline, and each submission
 * as a locked preview. Decisions happen in Contributions, a table of every submission whose rows open the
 * record in a modal. Items come from the governance store, limited to the units the reviewer may see.
 */
export function ValidationQueue({ steps }: { steps: { step: string; count: number }[] }) {
  const params = useSearchParams();
  const hub = useHub();
  const viewer = useViewer();
  const all = useMemo(() => hub?.evidence ?? [], [hub]);
  // The lists hold what units have sent; a link can still open a draft on its own.
  const items = useMemo(() => all.filter((e) => e.status !== "Not yet submitted" && e.status !== "Not applicable"), [all]);
  const [initial] = useState(() => ({ item: params.get("item"), status: params.get("status") as Filter | null, tab: params.get("tab") }));
  const [tab, setTab] = useState<Tab>(() => (initial.item || initial.status || initial.tab === "contributions" ? "Contributions" : "Overview"));
  const [filter, setFilter] = useState<Filter>(() => (initial.status && FILTERS.includes(initial.status) ? initial.status : "All"));
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState("");
  /** The record in the modal, the rows it steps through, and the row last opened. */
  const [open, setOpen] = useState<string | null>(initial.item);
  const [nav, setNav] = useState<string[]>([]);
  const [last, setLast] = useState<string>();
  const workRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // The address follows the tab, the status and the open record, so a reload or a shared link lands on it.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab === "Contributions") {
      p.set("tab", "contributions");
      if (filter !== "All") p.set("status", filter);
      if (open) p.set("item", open);
    }
    const search = p.size ? `?${p}` : "";
    if (location.search !== search) history.replaceState(null, "", `${location.pathname}${search}`);
  }, [tab, filter, open]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => f === "All" || i.status === f).length])) as Record<Filter, number>,
    [items],
  );
  const query = q.trim().toLowerCase();
  const matches = (i: EvidenceItem) => !query || [i.title, i.unit, i.id, i.type, i.submittedBy, ...i.files].some((s) => s.toLowerCase().includes(query));
  const byDate = (a: EvidenceItem, b: EvidenceItem) => b.submitted.localeCompare(a.submitted);
  const queue = items.filter(matches).sort((a, b) => (ORDER[a.status] ?? 2) - (ORDER[b.status] ?? 2) || byDate(a, b));
  const rowsFor = (f: Filter) => items.filter((i) => (f === "All" || i.status === f) && matches(i)).sort(byDate);
  const rows = rowsFor(filter);
  const sel = queue.find((i) => i.id === selId) ?? queue[0];
  const record = open ? all.find((i) => i.id === open) : undefined;
  const unitOf = (e: EvidenceItem) => hub?.units.find((u) => u.slug === e.unitSlug);

  const reviewsAll = viewer?.grants.some((g) => g.perms.evidence?.includes("approve") && g.bodies === "all");
  const scope = reviewsAll
    ? []
    : (viewer?.grants.filter((g) => g.perms.evidence?.includes("approve")).flatMap((g) => (g.bodies === "all" ? [] : g.bodies)) ?? []).map((b) => (b === "UI" ? "UI GreenMetric" : b));
  const parts = (["For review", "Needs revision", "Validated"] as const).map((s) => ({ status: s, tone: TONE[s], n: counts[s] }));
  const waiting = items.filter((i) => i.status === "For review");
  const oldest = waiting.length ? Math.max(...waiting.map((i) => -daysUntil(i.submitted))) : null;

  const pick = (id: string) => {
    setSelId(id);
    // Stacked on a narrow screen: bring the preview into view.
    const work = workRef.current;
    if (work && getComputedStyle(work).gridTemplateColumns.split(" ").length < 2) {
      reviewRef.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    }
  };
  const showStatus = (f: Filter) => {
    setFilter(f);
    setTab("Contributions");
  };
  const openRecord = (id: string, order = rows) => {
    setNav(order.map((i) => i.id));
    setOpen(id);
  };
  /** From the Overview's preview: over to Contributions, where the record opens on its row. */
  const openInContributions = (id: string) => {
    const item = items.find((i) => i.id === id);
    const f = filter === "All" || filter === item?.status ? filter : "All";
    setFilter(f);
    setTab("Contributions");
    openRecord(id, rowsFor(f));
  };
  const close = () => {
    const id = open;
    setOpen(null);
    if (!id) return;
    setLast(id);
    // Back on the table at the row just read.
    requestAnimationFrame(() => {
      document.getElementById(rowId(id))?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
      document.getElementById(openId(id))?.focus({ preventScroll: true });
    });
  };
  // A record opened from a link steps through the table as it stands.
  const order = open && nav.includes(open) ? nav : rows.map((i) => i.id);
  const at = open ? order.indexOf(open) : -1;
  const step = (d: 1 | -1) => (at >= 0 && order[at + d] ? () => setOpen(order[at + d]) : undefined);

  const searchSub = `Nothing matches “${q.trim()}”.`;

  return (
    <div className="cv">
      <Tabs
        tabs={[
          { key: "Overview", label: "Overview" },
          { key: "Contributions", label: "Contributions", count: counts["For review"] || undefined },
        ]}
        value={tab}
        onChange={setTab}
        label="Contributions and validation"
        idBase="cv-tabs"
        actions={
          tab === "Contributions" && (
            <Select className="content-tabs__action cv-statuspick" value={filter} onChange={(v) => setFilter(v as Filter)} aria-label="Show by status">
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === "All" ? "All statuses" : f}
                </option>
              ))}
            </Select>
          )
        }
        search={<SearchField value={q} onChange={setQ} placeholder="Search contributions" label="Search contributions" shortcuts />}
      />

      <TabPanel idBase="cv-tabs" index={tab === "Overview" ? 0 : 1} className="cv-panel">
        {tab === "Overview" ? (
          <>
            <div className="cv-bento">
              <Tile
                id="cv-queue-h"
                title="Review queue"
                className="cv-qtile"
                aside={
                  scope.length > 0 && (
                    <span className="cv-scope" title="The ranking bodies you review">
                      <Icon name="shield-check" size={13} />
                      {scope.join(" · ")}
                    </span>
                  )
                }
              >
                <div className="cv-q">
                  <Donut parts={parts}>
                    <b>{counts["For review"]}</b>
                    <span>to review</span>
                  </Donut>
                  <ul className="cv-q__keys" aria-label="Open contributions by status">
                    {parts.map((p) => (
                      <li key={p.status}>
                        <button type="button" className="cv-q__key" onClick={() => showStatus(p.status)}>
                          <i className={`cv-dot is-${p.tone}`} aria-hidden="true" />
                          <span>{p.status}</span>
                          <b>{p.n}</b>
                          <Icon name="chevron" size={14} className="cv-q__go" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="cv-q__foot">
                  <Icon name="clock" size={14} />
                  {oldest === null ? (
                    "Nothing waiting"
                  ) : (
                    <>
                      Oldest waiting <b>{oldest < 1 ? "since today" : `${oldest} ${oldest === 1 ? "day" : "days"}`}</b>
                    </>
                  )}
                </p>
              </Tile>
              <Tile id="cv-flow-h" title="Contribution pipeline" className="cv-ftile" aside={<span className="cv-aside">This cycle</span>}>
                <PipelineFlow steps={steps} label="Contribution pipeline, this cycle" />
              </Tile>
            </div>

            {sel ? (
              <div className="cv-work" ref={workRef}>
                <Tile id="cv-list-h" className="cv-ltile">
                  <h2 id="cv-list-h" className="sr-only">
                    Submissions
                  </h2>
                  <ul className="cv-items">
                    {queue.map((i) => (
                      <li key={i.id}>
                        <button type="button" className="cv-item" aria-current={sel.id === i.id ? "true" : undefined} onClick={() => pick(i.id)}>
                          <Mark unit={unitOf(i)} name={i.unit} />
                          <span className="cv-item__body">
                            <span className="cv-item__title">{i.title}</span>
                            <span className="cv-item__meta">{i.unit}</span>
                            <span className="cv-item__foot">
                              <MiniTrack stage={i.stage} status={i.status} />
                              <i className={`cv-dot is-${TONE[i.status]}`} title={i.status}>
                                <span className="sr-only">{i.status}</span>
                              </i>
                              <time className="cv-item__age" dateTime={i.submitted} title={formatDate(i.submitted, { day: "numeric", month: "long", year: "numeric" })}>
                                {ago(i.submitted)}
                              </time>
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Tile>

                <div className="cv-rwrap" ref={reviewRef}>
                  <Tile id="cv-peek-h" className="cv-rtile cv-rtile--locked">
                    <h2 id="cv-peek-h" className="sr-only">
                      Preview
                    </h2>
                    <ContributionRecord key={sel.id} item={sel} locked />
                    <div className="cv-veil">
                      <span className="cv-veil__lock" aria-hidden="true">
                        <Icon name="lock-keyhole" size={20} />
                      </span>
                      <button type="button" className="btn btn--dark cv-veil__go" onClick={() => openInContributions(sel.id)}>
                        Open in Contributions <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  </Tile>
                </div>
              </div>
            ) : (
              <EmptyView
                id="cv-empty-h"
                kind={query ? "search" : "start"}
                title={query ? "No matches" : "No submissions yet"}
                sub={query ? searchSub : "Evidence from units lands here for review."}
              />
            )}
          </>
        ) : rows.length ? (
          <ContributionsTable rows={rows} unitOf={unitOf} current={last} onOpen={(id) => openRecord(id)} />
        ) : (
          <EmptyView
            id="cv-empty-h"
            kind={query ? "search" : items.length ? "clear" : "start"}
            title={query ? "No matches" : items.length ? "All clear" : "No submissions yet"}
            sub={query ? searchSub : items.length ? CLEAR[filter]! : "Evidence from units lands here for review."}
          />
        )}
      </TabPanel>

      {record && (
        <RecordModal label={record.title} page={record.id} onClose={close} onPrev={step(-1)} onNext={step(1)}>
          <ContributionRecord key={record.id} item={record} />
        </RecordModal>
      )}
    </div>
  );
}
