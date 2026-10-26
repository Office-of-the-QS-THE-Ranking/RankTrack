"use client";

import Link from "next/link";
import { useState } from "react";
import type { UnitKind } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { UNIT_CATEGORY_TABS as CATEGORIES } from "@/lib/unit-categories";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Kpi, Meter, MeterRow } from "@/components/ui/primitives";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { ClickableTableRow } from "@/components/ui/ClickableTableRow";
import { UnitMark } from "@/components/units/UnitMark";
import { UnitLeaderboard } from "./UnitLeaderboard";
import { buildUnitLeaderboard } from "@/lib/governance/unit-leaderboard";

const VIEWS = ["Submissions", "Rankings"] as const;
const SEARCH_EXAMPLES = ["Search by unit name", "Search by unit code", "Search by coordinator"];
type Category = typeof CATEGORIES[number];
const KINDS: Record<Category, { kind: UnitKind; title: string; icon: "education" | "research" | "building" }> = {
  "Faculty/Colleges": { kind: "Faculty or college", title: "Faculty/Colleges", icon: "education" },
  "University Offices": { kind: "Office", title: "University Offices", icon: "building" },
  "Research Centers": { kind: "Research centre", title: "Research Centers", icon: "research" },
};

/** The directory remains the source for all categories, including units without submissions. */
export function UnitParticipation({ units }: { units: HubUnit[] }) {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [showOverview, setShowOverview] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<typeof VIEWS[number]>("Submissions");
  const { kind, title, icon } = KINDS[category];
  const active = units.filter((unit) => unit.status === "Active");
  const categoryUnits = active.filter((unit) => unit.kind === kind);
  const term = query.trim().toLowerCase();
  const matches = (unit: HubUnit) => !term || [unit.name, unit.code, unit.coordinator].some((value) => value.toLowerCase().includes(term));
  const UNITS = categoryUnits.filter(matches).sort((a, b) => a.name.localeCompare(b.name));
  const leaderboard = buildUnitLeaderboard(categoryUnits);
  const standings = leaderboard.filter(({ unit }) => matches(unit));
  const leader = leaderboard.find((row) => row.rank === 1);
  const archived = units.filter((unit) => unit.status === "Archived" && unit.kind === kind && matches(unit)).sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries(CATEGORIES.map((label) => [label, active.filter((unit) => unit.kind === KINDS[label].kind).length]));
  const assigned = categoryUnits.reduce((a, u) => a + u.assigned, 0);
  const completed = categoryUnits.reduce((a, u) => a + u.completed, 0);
  const validated = categoryUnits.reduce((a, u) => a + u.validated, 0);
  const assistance = categoryUnits.filter((u) => u.assistance).length;

  return (
    <>
      <Tabs
        tabs={CATEGORIES}
        value={category}
        onChange={(value) => { setCategory(value); setQuery(""); }}
        label="Unit categories"
        idBase="unit-participation"
        counts={counts}
        actions={
          <button
            type="button"
            className="btn content-tabs__action content-tabs__action--icon content-tabs__action--toggle"
            aria-label="Overview"
            aria-pressed={showOverview}
            aria-controls="unit-participation-overview"
            onClick={() => setShowOverview((visible) => !visible)}
          >
            <Icon name={showOverview ? "eye" : "eye-closed"} size={16} />
          </button>
        }
        search={<SearchField value={query} onChange={setQuery} placeholder="Search units" label={`Search ${title.toLowerCase()} by name, code or coordinator`} examples={SEARCH_EXAMPLES} shortcuts />}
      />
      <TabPanel idBase="unit-participation" index={CATEGORIES.indexOf(category)} className="stack">
        <div id="unit-participation-overview" className="grid cols-4 grid--stretch" style={showOverview ? undefined : { display: "none" }}>
          {view === "Submissions" ? <>
            <Kpi label="Requirements assigned" icon="clipboard" value={assigned} meta={`across ${categoryUnits.length} units`} />
            <Kpi label="Completed" icon="check-circle" value={completed} meta={`${Math.round((completed / Math.max(1, assigned)) * 100)}% of assigned`}>
              <Meter value={(completed / Math.max(1, assigned)) * 100} label="Completed share" />
            </Kpi>
            <Kpi tone="dark" label="Validated" icon="evidence" value={validated} meta="accepted by reviewers" />
            <Kpi tone="gold" label="Asked for assistance" icon="help" value={assistance} meta="The Office follows up within two working days" />
          </> : <>
            <Kpi label="Ranked units" icon="units" value={leaderboard.filter((row) => row.rank !== null).length} meta={`of ${categoryUnits.length} active units`} />
            <Kpi label="Validated evidence" icon="evidence" value={validated} meta="across this category" />
            <Kpi tone="dark" label="Leading validated total" icon="recognition" value={leader?.unit.validated ?? "—"} meta={leader ? "highest total in this category" : "No validated evidence yet"} />
            <Kpi tone="gold" label="Leader’s rankings served" icon="rankings" value={leader?.unit.rankingsServed ?? "—"} meta={leader ? "supported by validated evidence" : "Awaiting validated evidence"} />
          </>}
        </div>
        <Card
          title={title}
          icon={view === "Rankings" ? "recognition" : icon}
          className={view === "Rankings" ? "unit-participation-table unit-participation-table--rankings" : "unit-participation-table"}
          bodyClass="card__body--flush"
          actions={<Tabs tabs={VIEWS} value={view} onChange={setView} label={`${title} table view`} idBase="unit-participation-view" />}
        >
          <TabPanel idBase="unit-participation-view" index={VIEWS.indexOf(view)}>
            {view === "Rankings" ? (
              <UnitLeaderboard standings={standings} searching={!!term} />
            ) : UNITS.length ? (
            <div className="table-wrap">
              <table className="table table--hover table--stack">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Coordinator</th>
                    <th className="table__meter">Completion</th>
                    <th className="r">Validated</th>
                    <th className="r">Revisions</th>
                    <th className="r">Rankings served</th>
                    <th>Assistance</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {UNITS.map((u) => (
                      <ClickableTableRow key={u.slug} href={kind === "Faculty or college" ? `/admin/units/${u.slug}` : undefined}>
                        <td>
                          <span className="unit-cell">
                            {u.emblem && <UnitMark emblem={u.emblem} code={u.code} className="unit-cell__mark" />}
                            <Link href={`/admin/units/${u.slug}`} className="rowlink" scroll={kind !== "Faculty or college"}>
                              {u.name}
                            </Link>
                          </span>
                        </td>
                        <td data-label="Coordinator" className="text-2">
                          {u.coordinator}
                        </td>
                        <td data-label="Completion">
                          <MeterRow value={u.assigned ? (u.completed / u.assigned) * 100 : 0} label={`${u.name} completion`} />
                          <span className="table__sub num">
                            {u.completed} of {u.assigned}
                          </span>
                        </td>
                        <td data-label="Validated" className="r num">
                          {u.validated}
                        </td>
                        <td data-label="Revisions" className="r num">
                          {u.revisions}
                        </td>
                        <td data-label="Rankings served" className="r num">
                          {u.rankingsServed}
                        </td>
                        <td data-label="Assistance">
                          {u.assistance ? <span className="chip chip--gold">Requested</span> : <span className="muted">—</span>}
                        </td>
                        <td className="r">
                          <Link href={`/admin/units/${u.slug}`} className="btn btn--ghost btn--sm btn--icon" aria-label={`Open ${u.name}`} scroll={kind !== "Faculty or college"}>
                            <Icon name="chevron" size={16} />
                          </Link>
                        </td>
                      </ClickableTableRow>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={term ? "search" : icon} title={term ? "No units match your search" : "No active units in this category"}>
              {term ? "Try another name, code or coordinator, or clear the search." : "Units added to this category in the Organizational Directory will appear here."}
            </Empty>
          )}
          </TabPanel>
        </Card>
        {view === "Submissions" && archived.length > 0 && (
          <Card title="Archived units" icon="archive" sub="No longer active, never deleted: their submissions stay credited to them" bodyClass="card__body--flush">
            <div className="table-wrap">
              <table className="table table--hover table--stack">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>What happened</th>
                    <th className="r">Validated</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map((u) => (
                    <tr key={u.slug}>
                      <td>
                        <Link href={`/admin/units/${u.slug}`} className="rowlink">
                          {u.name}
                        </Link>
                      </td>
                      <td data-label="What happened" className="text-2">
                        {u.mergedIntoName ? `Merged into ${u.mergedIntoName}` : u.archivedReason}
                      </td>
                      <td data-label="Validated" className="r num">
                        {u.validated}
                      </td>
                      <td className="r">
                        <Link href={`/admin/units/${u.slug}`} className="btn btn--ghost btn--sm btn--icon" aria-label={`Open ${u.name}`}>
                          <Icon name="chevron" size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </TabPanel>
    </>
  );
}
