import Link from "next/link";
import { useState } from "react";
import { formatDate, type EvidenceStatus } from "@/lib/data";
import { meritOf, rankingsOf, type Season } from "@/lib/merit";
import { ClickableTableRow } from "@/components/ui/ClickableTableRow";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { Empty, Status } from "@/components/ui/primitives";

const FILTERS: ("All" | EvidenceStatus)[] = ["All", "Validated", "For review", "Needs revision", "Not yet submitted"];
const SHORT: Partial<Record<EvidenceStatus, string>> = { "For review": "In review", "Not yet submitted": "Not submitted" };

/** The cycle's submissions, newest first, each with what it earned. A row opens the item in the review queue. */
export function Submissions({ season }: { season: Season }) {
  const [filter, setFilter] = useState<"All" | EvidenceStatus>("All");
  const tally = (f: "All" | EvidenceStatus) => (f === "All" ? season.items.length : season.items.filter((e) => e.status === f).length);
  const shown = FILTERS.filter((f) => f === "All" || f === filter || tally(f));
  const rows = filter === "All" ? season.items : season.items.filter((e) => e.status === filter);

  if (!season.items.length)
    return (
      <div className="card">
        <Empty icon="inbox" title={`No submissions in ${season.cycle}`}>
          Submissions filed for this cycle appear here with their status and merit.
        </Empty>
      </div>
    );

  return (
    <div className="up-stack">
      <div className="up-toolbar">
        <Segmented
          variant="pills"
          label="Show submissions"
          options={shown.map((f) => ({ value: f, label: f === "All" ? "All" : (SHORT[f] ?? f), count: tally(f) }))}
          value={filter}
          onChange={setFilter}
        />
        <p className="up-toolbar__meta">
          <b>{season.merit.toLocaleString("en-PH")}</b> merit from {season.validated.length} validated
        </p>
      </div>
      <div className="card up-table">
        <div className="table-wrap">
          <table className="table table--hover table--stack">
            <thead>
              <tr>
                <th>Submission</th>
                <th>Submitted</th>
                <th>Status</th>
                <th className="r">Merit</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const merit = meritOf(e);
                const counts = rankingsOf(e);
                return (
                  <ClickableTableRow key={e.id} href={`/admin/contributions?item=${e.id}`}>
                    <td>
                      <span className="up-sub__title">{e.title}</span>
                      <span className="table__sub">
                        <span className="num">{e.id}</span> · {e.type}
                        {counts.length > 0 && ` · ${counts.join(", ")}`}
                      </span>
                    </td>
                    <td data-label="Submitted" className="nowrap">
                      {formatDate(e.submitted, { day: "numeric", month: "short", year: "numeric" })}
                      <span className="table__sub">{e.submittedBy}</span>
                    </td>
                    <td data-label="Status">
                      <Status status={e.status} />
                    </td>
                    <td data-label="Merit" className="r">
                      {merit ? <span className="up-merit">+{merit}</span> : <span className="muted">—</span>}
                    </td>
                    <td className="r">
                      <Link href={`/admin/contributions?item=${e.id}`} className="btn btn--ghost btn--sm btn--icon" aria-label={`Open ${e.id} in the review queue`}>
                        <Icon name="chevron" size={16} />
                      </Link>
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty icon="filter" title="None with this status">
            Choose All to see every submission.
          </Empty>
        )}
      </div>
    </div>
  );
}
