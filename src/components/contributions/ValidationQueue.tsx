"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { daysUntil, type EvidenceItem, type EvidenceStatus } from "@/lib/data";
import { useHub, useViewer } from "@/components/hub/HubProvider";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { ContributionRecord } from "./ContributionRecord";
import { SubmissionsTable, openId, rowId } from "./SubmissionsTable";
import { PipelineFlow } from "./PipelineFlow";
import { QueueArt } from "./QueueArt";
import { RecordModal } from "./RecordModal";
import { TONE } from "./parts";

type ValidationTab = "Submissions" | "Analytics";
type Filter = "All" | EvidenceStatus;
const FILTERS: Filter[] = ["All", "For review", "Needs revision", "Validated"];

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

export function EmptyView({ id, kind, title, sub }: { id: string; kind: "search" | "clear" | "start"; title: string; sub: string }) {
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
 * Contributions and validation. Analytics shows review statuses and the contribution pipeline.
 * Decisions happen in Submissions, a table of every submission whose rows open the
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
  const [activeTab, setActiveTab] = useState<ValidationTab>(() => (!initial.item && !initial.status && (initial.tab === "analytics" || initial.tab === "overview") ? "Analytics" : "Submissions"));
  const [filter, setFilter] = useState<Filter>(() => (initial.status && FILTERS.includes(initial.status) ? initial.status : "All"));
  const [q, setQ] = useState("");
  /** The record in the modal, the rows it steps through, and the row last opened. */
  const [open, setOpen] = useState<string | null>(initial.item);
  const [nav, setNav] = useState<string[]>([]);
  const [last, setLast] = useState<string>();

  // The address follows the tab, the status and the open record, so a reload or a shared link lands on it.
  useEffect(() => {
    const p = new URLSearchParams();
    p.set("tab", activeTab === "Submissions" ? "submissions" : "analytics");
    if (activeTab === "Submissions") {
      if (filter !== "All") p.set("status", filter);
      if (open) p.set("item", open);
    }
    const search = p.size ? `?${p}` : "";
    if (location.search !== search) history.replaceState(null, "", `${location.pathname}${search}`);
  }, [activeTab, filter, open]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => f === "All" || i.status === f).length])) as Record<Filter, number>,
    [items],
  );
  const query = q.trim().toLowerCase();
  const matches = (i: EvidenceItem) => !query || [i.title, i.unit, i.id, i.type, i.submittedBy, ...i.files].some((s) => s.toLowerCase().includes(query));
  const byDate = (a: EvidenceItem, b: EvidenceItem) => b.submitted.localeCompare(a.submitted);
  const rowsFor = (f: Filter) => items.filter((i) => (f === "All" || i.status === f) && matches(i)).sort(byDate);
  const rows = rowsFor(filter);
  const record = open ? all.find((i) => i.id === open) : undefined;
  const unitOf = (e: EvidenceItem) => hub?.units.find((u) => u.slug === e.unitSlug);

  const reviewsAll = viewer?.grants.some((g) => g.perms.evidence?.includes("approve") && g.bodies === "all");
  const scope = reviewsAll
    ? []
    : (viewer?.grants.filter((g) => g.perms.evidence?.includes("approve")).flatMap((g) => (g.bodies === "all" ? [] : g.bodies)) ?? []).map((b) => (b === "UI" ? "UI GreenMetric" : b));
  const parts = (["For review", "Needs revision", "Validated"] as const).map((s) => ({ status: s, tone: TONE[s], n: counts[s] }));
  const waiting = items.filter((i) => i.status === "For review");
  const oldest = waiting.length ? Math.max(...waiting.map((i) => -daysUntil(i.submitted))) : null;

  const showStatus = (f: Filter) => {
    setFilter(f);
    setActiveTab("Submissions");
  };
  const openRecord = (id: string, order = rows) => {
    setNav(order.map((i) => i.id));
    setOpen(id);
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
          { key: "Submissions", label: "Submissions", count: counts["For review"] || undefined },
          { key: "Analytics", label: "Analytics" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        label="Contributions and validation"
        idBase="cv-tabs"
        actions={
          activeTab === "Submissions" && (
            <Select className="content-tabs__action cv-statuspick" value={filter} onChange={(v) => setFilter(v as Filter)} aria-label="Show by status">
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === "All" ? "All statuses" : f}
                </option>
              ))}
            </Select>
          )
        }
        search={activeTab === "Submissions" ? <SearchField value={q} onChange={setQ} placeholder="Search submissions" label="Search submissions" shortcuts /> : undefined}
      />

      <TabPanel idBase="cv-tabs" index={activeTab === "Submissions" ? 0 : 1} className="cv-panel">
        {activeTab === "Analytics" ? (
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
                  <ul className="cv-q__keys" aria-label="Open submissions by status">
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
          </>
        ) : rows.length ? (
          <SubmissionsTable rows={rows} unitOf={unitOf} current={last} onOpen={(id) => openRecord(id)} />
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
