"use client";

import Link from "next/link";
import { useState } from "react";
import type { UnitKind } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { UNIT_CATEGORY_TABS as CATEGORIES } from "@/lib/unit-categories";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, MeterRow } from "@/components/ui/primitives";
import { Tabs, TabPanel } from "@/components/ui/interactive";
import { ClickableTableRow } from "@/components/ui/ClickableTableRow";
import { UnitMark } from "@/components/units/UnitMark";
import { UnitLeaderboard } from "./UnitLeaderboard";
import { buildUnitLeaderboard } from "@/lib/governance/unit-leaderboard";

const VIEWS = ["Submissions", "Rankings"] as const;
export const UNIT_SEARCH_EXAMPLES = ["Search by unit name", "Search by unit code", "Search by coordinator"];
export type UnitCategory = typeof CATEGORIES[number];
export const UNIT_CATEGORIES = CATEGORIES;
type Category = UnitCategory;
const KINDS: Record<Category, { kind: UnitKind; title: string; icon: "education" | "research" | "building" }> = {
  "Faculty/Colleges": { kind: "Faculty or college", title: "Faculty/Colleges", icon: "education" },
  "University Offices": { kind: "Office", title: "University Offices", icon: "building" },
  "Research Centers": { kind: "Research centre", title: "Research Centers", icon: "research" },
};

const matcher = (query: string) => {
  const term = query.trim().toLowerCase();
  return { term, matches: (unit: HubUnit) => !term || [unit.name, unit.code, unit.coordinator].some((value) => value.toLowerCase().includes(term)) };
};
const activeIn = (units: HubUnit[], category: Category) => units.filter((unit) => unit.status === "Active" && unit.kind === KINDS[category].kind);
const listed = (units: HubUnit[], category: Category, query: string) => {
  const { matches } = matcher(query);
  return activeIn(units, category).filter(matches).sort((a, b) => a.name.localeCompare(b.name));
};

/** How many active units each category holds, for the category filter. */
export const unitCategoryCounts = (units: HubUnit[]) => Object.fromEntries(CATEGORIES.map((label) => [label, activeIn(units, label).length])) as Record<Category, number>;

/**
 * One category's units, the Units tab of Unit Submissions: the category filter and search sit in that page's
 * tab row. The directory remains the source for all categories, including units without submissions.
 */
export function UnitParticipation({ units, category, query }: { units: HubUnit[]; category: Category; query: string }) {
  const [view, setView] = useState<typeof VIEWS[number]>("Submissions");
  const { kind, title, icon } = KINDS[category];
  const { term, matches } = matcher(query);
  const UNITS = listed(units, category, query);
  const standings = buildUnitLeaderboard(activeIn(units, category)).filter(({ unit }) => matches(unit));
  const archived = units.filter((unit) => unit.status === "Archived" && unit.kind === kind && matches(unit)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
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
    </div>
  );
}
