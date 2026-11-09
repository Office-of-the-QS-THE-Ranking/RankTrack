"use client";

/*
 * Reports produce documents. Pick a report, narrow it with its filters and search, read the preview, then export or
 * release it: what is on screen is what leaves the Hub. The figures themselves are read on Rankings and Units; this page
 * has no charts of its own. Records are not tied to a cycle, so a report always shows the current one: choosing a past
 * cycle would only mislabel it.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { EvidenceStatus } from "@/lib/data";
import { useHub, useRankings } from "@/components/hub/HubProvider";
import { Tile } from "@/components/dashboard/Tile";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { Direction, Empty, MeterRow, PlanStatus, Status, Swatch, cx } from "@/components/ui/primitives";
import { SearchField } from "@/components/ui/search-field";
import type { ReportAction } from "@/lib/analytics/desk-types";
import { PLAN_STATUSES } from "@/lib/analytics/types";
import { ReportOutput } from "./ReportOutput";

type ReportKey = "rankings" | "evidence" | "risks" | "actions";
type FilterKey = "ranking" | "indicator" | "unit" | "sdg" | "status" | "quality" | "plan";
type Filters = Record<FilterKey, string>;
type Cell = string | number;

/* Each report draws on governed datasets; their classification decides whether it can be exported. */
const REPORTS: { key: ReportKey; tab: string; name: string; datasets: string[]; filters: FilterKey[]; search: string }[] = [
  { key: "rankings", tab: "Rankings", name: "Ranking Performance", datasets: ["DS-RESULTS", "DS-INDICATORS"], filters: ["ranking"], search: "Search rankings" },
  { key: "evidence", tab: "Evidence", name: "Evidence Readiness", datasets: ["DS-EVIDENCE"], filters: ["ranking", "indicator", "unit", "sdg", "status", "quality"], search: "Search evidence" },
  { key: "risks", tab: "Risks", name: "Risk and Opportunity", datasets: ["DS-INDICATORS"], filters: ["ranking"], search: "Search gaps and opportunities" },
  { key: "actions", tab: "Action plan", name: "Action Plan Progress", datasets: ["DS-INDICATORS"], filters: ["plan"], search: "Search actions" },
];

const NO_FILTERS: Filters = { ranking: "", indicator: "", unit: "", sdg: "", status: "", quality: "", plan: "" };
const FILTER_LABELS: Record<FilterKey, string> = { ranking: "Ranking", indicator: "Indicator", unit: "Unit", sdg: "SDG", status: "Status", quality: "Quality", plan: "Plan status" };

const STATUSES: EvidenceStatus[] = ["Validated", "For review", "Needs revision", "Not yet submitted"];
const MOVE_WORDS: Record<string, string> = { up: "Improved", steady: "Held", down: "Fell", new: "No result", none: "No result" };
const MOVE_WORD = (d: string) => MOVE_WORDS[d] ?? d;

const has = (q: string, ...text: (string | number | undefined)[]) => !q || text.some((t) => String(t ?? "").toLowerCase().includes(q));
const isReport = (v: string | null): v is ReportKey => REPORTS.some((r) => r.key === v);

/** One report's preview and what its export carries. */
interface View {
  head: string[];
  rows: Cell[][];
  table: ReactNode;
  /** Wording when the report is empty before any filter or search. */
  none: { title: string; text: string };
}

export function ReportDesk({ actions }: { actions: ReportAction[] }) {
  const { evidenceLevels, sdgNames } = useViews();
  const hub = useHub();
  const RANKINGS = useRankings();
  const params = useSearchParams();
  const asked = params.get("report");
  // A ranking's page opens its reports with that ranking already chosen.
  const askedRanking = params.get("ranking") ?? "";
  const [report, setReport] = useState<ReportKey>(isReport(asked) ? asked : "rankings");
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, ranking: RANKINGS.some((r) => r.short === askedRanking) ? askedRanking : "" });
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const cycle = hub?.currentCycle ?? "";

  const current = REPORTS.find((r) => r.key === report)!;
  const units = hub?.units ?? [];
  const needle = q.trim().toLowerCase();

  const indicators = useMemo(
    () => [...new Set(RANKINGS.filter((r) => !filters.ranking || r.short === filters.ranking).flatMap((r) => r.indicators.map((i) => i.name)))],
    [RANKINGS, filters.ranking],
  );

  const open = (key: ReportKey) => {
    setReport(key);
    setQ("");
    window.history.replaceState(null, "", `?report=${key}`);
  };
  const set = (key: FilterKey, value: string) => setFilters((f) => ({ ...f, [key]: value, ...(key === "ranking" && { indicator: "" }) }));

  const active = current.filters.filter((k) => filters[k]);
  const filterText = (k: FilterKey) => (k === "sdg" ? `SDG ${filters.sdg}` : filters[k]);
  const clearAll = () => setFilters((f) => ({ ...f, ...Object.fromEntries(current.filters.map((k) => [k, ""])) }));

  const rankings = RANKINGS.filter((r) => !filters.ranking || r.short === filters.ranking);
  const view = ((): View => {
    switch (report) {
      case "rankings": {
        const list = rankings.filter((r) => has(needle, r.short, r.name));
        return {
          none: { title: "No rankings tracked", text: "Rankings appear here once they are tracked in System Configuration." },
          head: ["Ranking", "Current", "Previous", "Direction", "Readiness", "Pending"],
          rows: list.map((r) => [r.short, r.current, r.previous, MOVE_WORD(r.direction), `${r.readiness}%`, r.pending]),
          table: (
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Ranking</th>
                  <th>Current</th>
                  <th>Previous</th>
                  <th>Direction</th>
                  <th className="r">Pending</th>
                  <th className="table__meter">Readiness</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.slug}>
                    <td>
                      <span className="rr-name table__primary">
                        <Swatch family={r.family} />
                        {r.short}
                      </span>
                    </td>
                    <td data-label="Current" className="num">
                      <b>{r.current}</b>
                    </td>
                    <td data-label="Previous" className="num text-2">
                      {r.previous}
                    </td>
                    <td data-label="Direction">
                      <Direction dir={r.direction} />
                    </td>
                    <td data-label="Pending" className="r num">
                      {r.pending}
                    </td>
                    <td data-label="Readiness">
                      <MeterRow value={r.readiness} tone="gold" label={`${r.short} readiness`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
      case "evidence": {
        const evidenceAll = hub?.evidence ?? [];
        const list = evidenceAll.filter(
          (e) =>
            (!filters.ranking || e.mappedTo.some((m) => m.startsWith(`${filters.ranking} ·`))) &&
            (!filters.unit || e.unit === filters.unit) &&
            (!filters.indicator || e.mappedTo.some((m) => m.toLowerCase().includes(filters.indicator.split(":")[0].toLowerCase()))) &&
            (!filters.status || e.status === filters.status) &&
            (!filters.sdg || e.sdgs.includes(Number(filters.sdg))) &&
            (!filters.quality || evidenceLevels[e.level - 1] === filters.quality) &&
            has(needle, e.title, e.id, e.unit, e.period),
        );
        return {
          none: { title: "No evidence yet", text: "Evidence appears here once units submit it." },
          head: ["Evidence", "ID", "Unit", "Period", "Quality", "Rankings", "Status"],
          rows: list.map((e) => [e.title, e.id, e.unit, e.period, evidenceLevels[e.level - 1], e.mappedTo.length, e.status]),
          table: (
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Evidence</th>
                  <th>Unit</th>
                  <th>Quality</th>
                  <th className="r">Used in</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="table__primary">{e.title}</span>
                      <span className="table__sub num">
                        {e.id} · {e.period}
                      </span>
                    </td>
                    <td data-label="Unit" className="small text-2">
                      {e.unit}
                    </td>
                    <td data-label="Quality" className="small">
                      {evidenceLevels[e.level - 1]}
                    </td>
                    <td data-label="Used in" className="r num">
                      {e.mappedTo.length}
                    </td>
                    <td data-label="Status">
                      <Status status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
      case "risks": {
        const list = rankings.filter((r) => (r.gaps.length > 0 || r.opportunities.length > 0) && has(needle, r.short, ...r.gaps, ...r.opportunities));
        return {
          none: { title: "No gaps or opportunities yet", text: "They appear here once a ranking's page records them." },
          head: ["Ranking", "Critical gaps", "Main opportunities"],
          rows: list.map((r) => [r.short, r.gaps.join("; "), r.opportunities.join("; ")]),
          table: (
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Ranking</th>
                  <th>Critical gaps</th>
                  <th>Main opportunities</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.slug}>
                    <td>
                      <span className="rr-name table__primary nowrap">
                        <Swatch family={r.family} />
                        {r.short}
                      </span>
                    </td>
                    <td data-label="Gaps">
                      <ul className="bullets bullets--gap">
                        {r.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </td>
                    <td data-label="Opportunities">
                      <ul className="bullets bullets--opp">
                        {r.opportunities.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
      case "actions": {
        const list = actions.filter((a) => (!filters.plan || a.status === filters.plan) && has(needle, a.action, a.kpi, a.owner, a.timeline));
        return {
          none: { title: "No action items yet", text: "Add them on a ranking’s Action plan tab." },
          head: ["Action", "KPI", "Owner", "Timeline", "Progress", "Status"],
          rows: list.map((a) => [a.action, a.kpi, a.owner, a.timeline, `${a.progress}%`, a.status]),
          table: (
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Timeline</th>
                  <th className="table__meter">Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={`${a.action}-${i}`}>
                    <td>
                      <span className="table__primary">{a.action}</span>
                      <span className="table__sub">{a.kpi}</span>
                    </td>
                    <td data-label="Owner" className="small text-2">
                      {a.owner}
                    </td>
                    <td data-label="Timeline" className="small text-2">
                      {a.timeline}
                    </td>
                    <td data-label="Progress">
                      <MeterRow value={a.progress} tone="gold" label={`${a.action} progress`} />
                    </td>
                    <td data-label="Status">
                      <PlanStatus status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        };
      }
    }
  })();

  const narrowed = active.length > 0 || !!needle;
  const reportIndex = REPORTS.findIndex((r) => r.key === report);

  const filterField = (key: FilterKey, all: string, options: ReactNode, searchable = false) => (
    <label key={key} className="rr-filter">
      <span>{FILTER_LABELS[key]}</span>
      <Select className="select select--sm" value={filters[key]} onChange={(v) => set(key, v)} searchable={searchable}>
        <option value="">{all}</option>
        {options}
      </Select>
    </label>
  );
  const plainOptions = (list: readonly string[]) =>
    list.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ));
  const FILTER_FIELDS: Record<FilterKey, () => ReactNode> = {
    ranking: () => filterField("ranking", "All rankings", plainOptions(RANKINGS.map((r) => r.short))),
    indicator: () => filterField("indicator", "Any indicator", plainOptions(indicators), true),
    unit: () => filterField("unit", "All units", plainOptions(units.map((u) => u.name)), true),
    sdg: () =>
      filterField(
        "sdg",
        "Any SDG",
        Object.entries(sdgNames).map(([n, name]) => (
          <option key={n} value={n}>
            {`SDG ${n}: ${name}`}
          </option>
        )),
        true,
      ),
    status: () => filterField("status", "Any status", plainOptions(STATUSES)),
    quality: () => filterField("quality", "Any quality", plainOptions(evidenceLevels)),
    plan: () => filterField("plan", "Any plan status", plainOptions(PLAN_STATUSES)),
  };

  return (
    <div className="rr">
      <Tabs
        tabs={REPORTS.map((r) => ({ key: r.key, label: r.tab }))}
        value={report}
        onChange={open}
        label="Reports"
        idBase="rr-tabs"
        actions={
          <>
            <Link href="/admin/units" className="btn content-tabs__action">
              <Icon name="units" size={15} /> Unit participation
            </Link>
            <button type="button" className={cx("btn content-tabs__action", showFilters && "is-active")} aria-expanded={showFilters} aria-controls="rr-filters" onClick={() => setShowFilters((s) => !s)}>
              <Icon name="filter" size={15} /> Filters
              {active.length > 0 && <span className="rr-filter-n">{active.length}</span>}
            </button>
          </>
        }
        search={<SearchField value={q} onChange={setQ} placeholder={current.search} label={current.search} shortcuts />}
      />

      <TabPanel idBase="rr-tabs" index={reportIndex} className="rr-panel">
        {showFilters && current.filters.length > 0 && (
          <div id="rr-filters" className="rr-filters">
            {current.filters.map((k) => FILTER_FIELDS[k]())}
          </div>
        )}

        {active.length > 0 && (
          <div className="rr-chips">
            {active.map((k) => (
              <button key={k} type="button" className="rr-chip" aria-label={`Remove filter: ${filterText(k)}`} onClick={() => set(k, "")}>
                {filterText(k)}
                <Icon name="close" size={12} />
              </button>
            ))}
            <button type="button" className="rr-chips__clear" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

        <Tile
          id="rr-table"
          className="rr-report"
          title={
            <>
              {current.name}
              <span className="count">{view.rows.length}</span>
              {cycle && <span className="rr-cycle">Cycle {cycle}</span>}
            </>
          }
          aside={<ReportOutput report={current.name} datasets={current.datasets} head={view.head} rows={view.rows} print />}
        >
          {narrowed && (
            <p className="rr-print">
              {active.map(filterText).join(" · ")}
              {active.length > 0 && needle && " · "}
              {needle && `“${q.trim()}”`}
            </p>
          )}
          {view.rows.length ? (
            <div className="table-wrap">{view.table}</div>
          ) : narrowed ? (
            <Empty icon="filter" title="Nothing matches">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  clearAll();
                  setQ("");
                }}
              >
                Clear filters and search
              </button>
            </Empty>
          ) : (
            <Empty icon="reports" title={view.none.title}>
              {view.none.text}
            </Empty>
          )}
        </Tile>

        {!!hub?.publishedReports.length && (
          <Tile id="rr-released" className="rr-released" title="Released outside the Office">
            <ul className="rr-released__list">
              {hub.publishedReports.map((r) => (
                <li key={r.id}>
                  <span>{r.title}</span>
                  <time dateTime={r.at}>{new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
                </li>
              ))}
            </ul>
          </Tile>
        )}
      </TabPanel>
    </div>
  );
}
