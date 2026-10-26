import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Empty, MeterRow } from "@/components/ui/primitives";
import { UnitMark } from "./UnitMark";
import type { UnitStanding } from "@/lib/governance/unit-leaderboard";

export function UnitLeaderboard({ standings, searching }: { standings: UnitStanding[]; searching: boolean }) {
  const leaders = standings.filter((row) => row.rank !== null && row.rank <= 3).slice(0, 3);
  return (
    <div className="unit-leaderboard">
      <div className="unit-leaderboard__intro">
        <span className="unit-leaderboard__label"><Icon name="recognition" size={18} /> Unit leaderboard</span>
        <p>Ordered by validated evidence, then rankings served and completion. Ties share a position; units without validated evidence are unranked.</p>
      </div>
      {!searching && leaders.length > 0 && (
        <ol className="unit-leaderboard__podium" aria-label="Leading units">
          {leaders.map(({ unit, rank }) => (
            <li key={unit.slug} data-rank={rank}>
              <span className="unit-leaderboard__place" aria-label={`Position ${rank}`}>{rank}</span>
              <div className="unit-leaderboard__leader">
                <span className="unit-cell">
                  {unit.emblem && <UnitMark emblem={unit.emblem} code={unit.code} className="unit-cell__mark" />}
                  <Link href={`/admin/units/${unit.slug}`} className="rowlink" scroll={unit.kind !== "Faculty or college"}>{unit.name}</Link>
                </span>
                <span className="unit-leaderboard__leader-meta">{unit.rankingsServed} rankings served</span>
              </div>
              <span className="unit-leaderboard__score"><b>{unit.validated}</b><span>validated</span></span>
            </li>
          ))}
        </ol>
      )}
      {standings.length ? (
        <div className="table-wrap">
          <table className="table table--hover table--stack unit-leaderboard__table">
            <caption className="sr-only">Unit standings based on validated evidence, rankings served and completion.</caption>
            <thead><tr><th>Position</th><th>Unit</th><th className="r">Validated evidence</th><th className="r">Rankings served</th><th className="table__meter">Completion</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {standings.map(({ unit, rank, completion }) => (
                <tr key={unit.slug} data-rank={rank ?? undefined}>
                  <td data-label="Position"><span className="unit-leaderboard__position" aria-label={rank === null ? "Unranked" : `Position ${rank}`}>{rank === null ? "—" : `#${rank}`}</span></td>
                  <td className="table__primary"><span className="unit-cell">
                    {unit.emblem && <UnitMark emblem={unit.emblem} code={unit.code} className="unit-cell__mark" />}
                    <span><Link href={`/admin/units/${unit.slug}`} className="rowlink" scroll={unit.kind !== "Faculty or college"}>{unit.name}</Link><span className="table__sub">{unit.code}</span></span>
                  </span></td>
                  <td data-label="Validated evidence" className="r num"><b className="unit-leaderboard__validated">{unit.validated}</b></td>
                  <td data-label="Rankings served" className="r num">{unit.rankingsServed}</td>
                  <td data-label="Completion"><MeterRow value={completion} label={`${unit.name} completion`} /><span className="table__sub num">{unit.completed} of {unit.assigned}</span></td>
                  <td className="r"><Link href={`/admin/units/${unit.slug}`} className="btn btn--ghost btn--sm btn--icon" aria-label={`Open ${unit.name}`} scroll={unit.kind !== "Faculty or college"}><Icon name="chevron" size={16} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={searching ? "search" : "rankings"} title={searching ? "No units match your search" : "No active units in this category"}>
          {searching ? "Try another name, code or coordinator, or clear the search." : "Units will appear here when they are added to this category."}
        </Empty>
      )}
    </div>
  );
}
