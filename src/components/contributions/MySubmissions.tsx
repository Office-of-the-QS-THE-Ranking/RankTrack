"use client";

/*
 * Submit evidence: the unit's submissions as a table (title, SDGs, date and status) under status tabs and a
 * search, with the Submit evidence button that opens the composer. A row opens the record, read-only, in the
 * modal the Office uses; a new submission lands in the table marked.
 */
import { useState, type MouseEvent } from "react";
import { formatDate, type EvidenceItem } from "@/lib/data";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { PageHeader, Status, cx } from "@/components/ui/primitives";
import { SearchField } from "@/components/ui/search-field";
import { ContributionRecord } from "./ContributionRecord";
import { openId, rowId } from "./SubmissionsTable";
import { EvidenceComposer } from "./EvidenceComposer";
import { MiniTrack } from "./parts";
import { RecordModal } from "./RecordModal";
import { EmptyView } from "./ValidationQueue";

const TABS = ["All", "For review", "Needs revision", "Validated"] as const;
type Tab = (typeof TABS)[number];

/** What an empty tab says. */
const CLEAR: Record<Exclude<Tab, "All">, string> = {
  "For review": "Nothing is with reviewers right now.",
  "Needs revision": "Nothing needs revising.",
  Validated: "Nothing validated yet.",
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MySubmissions({ rows, canSubmit, note }: { rows: EvidenceItem[]; canSubmit: boolean; note?: string }) {
  const { sdgIcons, sdgNames } = useViews();
  const [tab, setTab] = useState<Tab>("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [last, setLast] = useState<string>();

  const query = q.trim().toLowerCase();
  const shown = rows.filter(
    (e) =>
      (tab === "All" || e.status === tab) &&
      (!query || [e.title, e.id, e.type, e.period, e.status, ...e.sdgs.map((n) => `SDG ${n} ${sdgNames[n] ?? ""}`)].join(" ").toLowerCase().includes(query)),
  );
  const counts = Object.fromEntries(TABS.map((t) => [t, t === "All" ? rows.length : rows.filter((e) => e.status === t).length])) as Record<Tab, number>;

  const record = open ? rows.find((e) => e.id === open) : undefined;
  const at = open ? shown.findIndex((e) => e.id === open) : -1;
  const step = (d: 1 | -1) => (at >= 0 && shown[at + d] ? () => setOpen(shown[at + d].id) : undefined);
  const close = () => {
    const id = open;
    setOpen(null);
    if (!id) return;
    setLast(id);
    // Back on the table at the row just read.
    requestAnimationFrame(() => document.getElementById(openId(id))?.focus({ preventScroll: true }));
  };
  const rowClick = (e: MouseEvent, id: string) => {
    if (e.button !== 0 || (e.target as Element).closest("a, button, input, label")) return;
    if (window.getSelection()?.toString()) return;
    setOpen(id);
  };
  /** A new submission: the whole table, with its row marked once it arrives. */
  const sent = (id: string) => {
    setTab("All");
    setQ("");
    setLast(id);
    requestAnimationFrame(() => document.getElementById(rowId(id))?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }));
  };

  return (
    <div className="cv es">
      <PageHeader
        title="Submit evidence"
        actions={
          canSubmit && (
            <button type="button" className="btn btn--primary es-new" onClick={() => setComposing(true)}>
              <Icon name="upload" size={17} /> Submit evidence
            </button>
          )
        }
      />

      <Tabs
        tabs={TABS.map((t) => ({ key: t, label: t, count: counts[t] || undefined, countTone: t === "Needs revision" ? ("alert" as const) : undefined }))}
        value={tab}
        onChange={setTab}
        label="Your submissions"
        idBase="es-tabs"
        search={<SearchField value={q} onChange={setQ} placeholder="Search submissions" label="Search submissions" shortcuts />}
      />

      <TabPanel idBase="es-tabs" index={TABS.indexOf(tab)} className="cv-panel">
        {shown.length ? (
          <Tile id="es-table-h" className="cv-ttile">
            <h2 id="es-table-h" className="sr-only">
              Your submissions
            </h2>
            <div className="table-wrap">
              <table className="table table--hover table--stack cv-table es-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>SDG</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.id} id={rowId(e.id)} className={cx("cv-row", last === e.id && "is-current")} onClick={(ev) => rowClick(ev, e.id)}>
                      <td>
                        <span className="cv-cell__text">
                          <button type="button" id={openId(e.id)} className="cv-row__open" onClick={() => setOpen(e.id)}>
                            {e.title}
                          </button>
                          <span className="table__sub">
                            {e.type} · <span className="num">{e.id}</span>
                          </span>
                        </span>
                      </td>
                      <td data-label="SDG">
                        {e.sdgs.length ? (
                          <span className="es-sdgs" role="img" aria-label={e.sdgs.map((n) => `SDG ${n}`).join(", ")}>
                            {e.sdgs.slice(0, 4).map((n) => (
                              <img key={n} src={sdgIcons[n]} alt="" width={30} height={30} loading="lazy" draggable={false} />
                            ))}
                            {e.sdgs.length > 4 && <span className="es-more">+{e.sdgs.length - 4}</span>}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-label="Date" className="nowrap">
                        <time dateTime={e.submitted}>{formatDate(e.submitted, { day: "numeric", month: "short", year: "numeric" })}</time>
                      </td>
                      <td data-label="Status">
                        <span className="cv-tstatus">
                          <Status status={e.status} />
                          <MiniTrack stage={e.stage} status={e.status} />
                        </span>
                      </td>
                      <td className="r cv-row__end">
                        <Icon name="chevron" size={16} className="cv-row__go" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tile>
        ) : (
          <EmptyView
            id="es-empty-h"
            kind={query ? "search" : rows.length ? "clear" : "start"}
            title={query ? "No matches" : rows.length ? "All clear" : "Nothing submitted yet"}
            sub={query ? `Nothing matches “${q.trim()}”.` : rows.length && tab !== "All" ? CLEAR[tab] : (note ?? "Your unit’s evidence appears here once it’s sent.")}
          />
        )}
      </TabPanel>

      {record && (
        <RecordModal label={record.title} page={record.id} onClose={close} onPrev={step(-1)} onNext={step(1)}>
          <ContributionRecord key={record.id} item={record} />
        </RecordModal>
      )}

      {composing && <EvidenceComposer onClose={() => setComposing(false)} onSent={sent} />}
    </div>
  );
}
