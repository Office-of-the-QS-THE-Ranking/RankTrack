import Link from "next/link";
import type { UnitKind } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Kpi, Meter, MeterRow, PageHeader } from "@/components/ui/primitives";
import { InfoTooltip } from "@/components/ui/interactive";
import { ClickableTableRow } from "@/components/ui/ClickableTableRow";
import { Gate } from "@/components/hub/Gate";
import { hub } from "@/lib/governance/server/hub";

export const metadata = { title: "Units" };

const KINDS: { kind: UnitKind; title: string; icon: "education" | "research" | "building" }[] = [
  { kind: "Faculty or college", title: "Faculties and colleges", icon: "education" },
  { kind: "Research centre", title: "Research centres", icon: "research" },
  { kind: "Office", title: "Offices", icon: "building" },
];

/** Units come from the Organizational Directory: active ones by kind, archived ones kept with their history. */
export default function Units() {
  const h = hub();
  const UNITS = h.activeUnits;
  const archived = h.units.filter((u) => u.status === "Archived");
  const assigned = UNITS.reduce((a, u) => a + u.assigned, 0);
  const completed = UNITS.reduce((a, u) => a + u.completed, 0);
  const validated = UNITS.reduce((a, u) => a + u.validated, 0);
  const assistance = UNITS.filter((u) => u.assistance).length;
  return (
    <Gate path="/admin/units" title="Unit participation">
      <PageHeader
        title={
          <span className="row" style={{ gap: 8 }}>
            Unit participation
            <InfoTooltip label="Unit participation guidance">
              <span style={{ display: "block", width: 320, maxWidth: "calc(100vw - 56px)", fontWeight: 400 }}>
                Progress, not pressure: every unit sees its own completion and where its evidence counts. Units are listed alphabetically and never ranked against each other.
              </span>
            </InfoTooltip>
          </span>
        }
      />
      <div className="grid cols-4 grid--stretch">
        <Kpi label="Requirements assigned" icon="clipboard" value={assigned} meta={`across ${UNITS.length} units`} />
        <Kpi label="Completed" icon="check-circle" value={completed} meta={`${Math.round((completed / Math.max(1, assigned)) * 100)}% of assigned`}>
          <Meter value={(completed / Math.max(1, assigned)) * 100} label="Completed share" />
        </Kpi>
        <Kpi tone="dark" label="Validated" icon="evidence" value={validated} meta="accepted by reviewers" />
        <Kpi tone="gold" label="Asked for assistance" icon="help" value={assistance} meta="The Office follows up within two working days" />
      </div>
      {KINDS.map(({ kind, title, icon }) => (
        <Card key={kind} title={title} icon={icon} sub={`${UNITS.filter((u) => u.kind === kind).length} units`} bodyClass="card__body--flush">
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
                {UNITS.filter((u) => u.kind === kind)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((u) => (
                    <ClickableTableRow key={u.slug} href={kind === "Faculty or college" ? `/admin/units/${u.slug}` : undefined}>
                      <td>
                        <Link href={`/admin/units/${u.slug}`} className="rowlink" scroll={kind !== "Faculty or college"}>
                          {u.name}
                        </Link>
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
        </Card>
      ))}
      {archived.length > 0 && (
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
    </Gate>
  );
}
