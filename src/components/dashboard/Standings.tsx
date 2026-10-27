import type { CSSProperties } from "react";
import type { UnitKind } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { buildUnitLeaderboard, type UnitStanding } from "@/lib/governance/unit-leaderboard";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { cx } from "@/components/ui/primitives";
import { UnitMark } from "@/components/units/UnitMark";
import { Tile } from "./Tile";

export const categoryOf = (kind: UnitKind) =>
  kind === "Office" ? UNIT_CATEGORY_LABELS.offices : kind === "Research centre" ? UNIT_CATEGORY_LABELS.research : UNIT_CATEGORY_LABELS.academic;

export interface Standing {
  category: string;
  /** The category's leaderboard, as on Units: validated evidence, then rankings served, then completion. */
  rows: UnitStanding[];
  /** This unit's row, unless it isn't an active unit of the category. */
  mine?: UnitStanding;
  /** Units with a place, that is, with validated evidence. */
  ranked: number;
  /** What moves this unit: validated items to pass the unit above or to get on the board, or its lead. */
  nudge?: { kind: "pass"; n: number; name: string } | { kind: "join" } | { kind: "lead"; n: number } | { kind: "shared" };
}

/** Where a unit stands among the active units of its category. */
export function standingOf(unit: HubUnit, peers: HubUnit[]): Standing {
  const rows = buildUnitLeaderboard(peers);
  const at = rows.findIndex((r) => r.unit.slug === unit.slug);
  const mine = rows[at];
  const ranked = rows.filter((r) => r.rank !== null).length;
  let nudge: Standing["nudge"];
  if (mine?.rank === null) nudge = { kind: "join" };
  else if (mine?.rank === 1) {
    const second = rows.find((r) => r.rank !== null && r.rank > 1);
    nudge = rows.some((r) => r !== mine && r.rank === 1) ? { kind: "shared" } : { kind: "lead", n: second ? mine.unit.validated - second.unit.validated : 0 };
  } else if (mine?.rank) {
    const place = mine.rank;
    const ahead = rows.slice(0, at).findLast((r) => r.rank !== null && r.rank < place);
    if (ahead) nudge = { kind: "pass", n: ahead.unit.validated - mine.unit.validated + 1, name: ahead.unit.name };
  }
  return { category: categoryOf(unit.kind), rows, mine, ranked, nudge };
}

/** Leaves along each spray of the laurel, from its base to its tip. */
const LEAVES = Array.from({ length: 7 }, (_, i) => {
  const a = ((250 - i * 17) * Math.PI) / 180;
  const x = 50 + 42 * Math.cos(a);
  const y = 54 - 42 * Math.sin(a);
  // The spray grows up the circle; each node carries a leaf to either side of it.
  const grow = (Math.atan2(Math.cos(a), Math.sin(a)) * 180) / Math.PI;
  return [-38, 34].map((turn) => {
    const r = ((grow + turn) * Math.PI) / 180;
    const len = 7 - i * 0.35;
    return { cx: x + Math.cos(r) * len, cy: y + Math.sin(r) * len, rx: len, ry: len * 0.42, deg: grow + turn, i };
  });
}).flat();
const STEM = (() => {
  const at = (deg: number) => [50 + 42 * Math.cos((deg * Math.PI) / 180), 54 - 42 * Math.sin((deg * Math.PI) / 180)].map((n) => n.toFixed(2)).join(" ");
  return `M${at(252)} A42 42 0 0 1 ${at(146)}`;
})();

/** A laurel round the unit's place, its leaves grown in from the base. */
function Laurel() {
  return (
    <svg className="ud-laurel" viewBox="0 0 100 100" aria-hidden="true">
      {[false, true].map((mirror) => (
        <g key={String(mirror)} transform={mirror ? "matrix(-1 0 0 1 100 0)" : undefined}>
          <path d={STEM} className="ud-laurel__stem" />
          {LEAVES.map((l, k) => (
            <g key={k} className="ud-laurel__leaf" style={{ "--i": l.i } as CSSProperties}>
              <ellipse cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} transform={`rotate(${l.deg.toFixed(1)} ${l.cx.toFixed(2)} ${l.cy.toFixed(2)})`} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Nudge({ nudge, ranked }: { nudge: NonNullable<Standing["nudge"]>; ranked: number }) {
  if (nudge.kind === "pass")
    return (
      <p className="ud-nudge">
        <Icon name="arrow-up" size={15} strokeWidth={2.4} />
        <span>
          <b>+{nudge.n}</b> to pass <span className="ud-nudge__name">{nudge.name}</span>
        </span>
      </p>
    );
  if (nudge.kind === "join")
    return (
      <p className="ud-nudge">
        <Icon name="arrow-up" size={15} strokeWidth={2.4} />
        <span>
          <b>1</b> validated {ranked ? "puts you on the board" : "takes first place"}
        </span>
      </p>
    );
  return (
    <p className="ud-nudge is-lead">
      <Icon name="recognition" size={15} />
      <span>{nudge.kind === "shared" ? "Sharing first place" : nudge.n > 0 ? <>Leading by <b>{nudge.n}</b></> : "Leading"}</span>
    </p>
  );
}

/**
 * The unit among its category, as the Units leaderboard orders it: its place in a laurel, what it takes to move
 * up, the whole field as a skyline, and the leaders beside its neighbours.
 */
export function Standings({ id, standing }: { id: string; standing: Standing }) {
  const { category, rows, mine, ranked, nudge } = standing;
  const most = Math.max(1, ...rows.map((r) => r.unit.validated));
  const at = mine ? rows.indexOf(mine) : -1;
  // The leaders, then the unit with the units just above and below it.
  const keep = new Set(rows.slice(0, 3).flatMap((r, i) => (r.rank === null ? [] : [i])));
  if (mine) {
    keep.add(at);
    if (mine.rank !== null && at > 0) keep.add(at - 1);
    if (mine.rank !== null && rows[at + 1]?.rank) keep.add(at + 1);
  }
  const shown = [...keep].sort((a, b) => a - b);

  return (
    <Tile id={id} className="ud-stand">
      <header className="ov-tile__head">
        <h2 id={id} className="ov-tile__title">
          <Icon name="recognition" size={17} className="ud-stand__icon" />
          {category}
        </h2>
        <InfoTooltip label="How places are decided">Ordered by validated evidence, then rankings served, then completion. Ties share a place.</InfoTooltip>
      </header>

      <div className="ud-stand__top">
        <div className={cx("ud-place", !mine?.rank && "is-off")}>
          <Laurel />
          <p className="ud-place__n" aria-label={mine?.rank ? `Place ${mine.rank} of ${rows.length}` : "No place yet"}>
            {mine?.rank ? (
              <>
                <small>#</small>
                {mine.rank}
              </>
            ) : (
              "–"
            )}
          </p>
          <p className="ud-place__of" aria-hidden="true">
            {mine?.rank ? `of ${rows.length}` : "Unplaced"}
          </p>
        </div>
        <div className="ud-stand__lede">
          {nudge && <Nudge nudge={nudge} ranked={ranked} />}
          {mine && (
            <dl className="ud-stand__stats">
              <div>
                <dt>Validated</dt>
                <dd>{mine.unit.validated}</dd>
              </div>
              <div>
                <dt>Rankings</dt>
                <dd>{mine.unit.rankingsServed}</dd>
              </div>
              <div>
                <dt>Completion</dt>
                <dd>{mine.completion}%</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {rows.length > 1 && (
        <span
          className={cx("ud-sky", !ranked && "is-empty")}
          role="img"
          aria-label={`${ranked} of ${rows.length} units in ${category} have validated evidence`}
        >
          {rows.map((r, i) => (
            <i
              key={r.unit.slug}
              className={cx(r === mine && "is-you", r.rank === null && "is-off", r.rank !== null && r.rank <= 3 && "is-top")}
              style={{ "--v": `${r.unit.validated ? Math.max(8, (r.unit.validated / most) * 100) : 4}%`, "--i": i } as CSSProperties}
              data-tip={`${r.rank ? `#${r.rank} ` : ""}${r.unit.code} · ${r.unit.validated}`}
            >
              <b />
              {r === mine && <span className="ud-sky__you">You</span>}
            </i>
          ))}
        </span>
      )}

      {ranked > 0 ? (
        <ol className="ud-ladder" aria-label={`${category} leaders and your neighbours`}>
          {shown.map((i, k) => {
            const r = rows[i];
            const you = r === mine;
            return [
              k > 0 && i - shown[k - 1] > 1 && (
                <li key={`gap-${i}`} className="ud-ladder__gap" aria-hidden="true">
                  <span />
                </li>
              ),
              <li key={r.unit.slug} className={cx("ud-rung", you && "is-you")} data-place={r.rank && r.rank <= 3 ? r.rank : undefined}>
                <span className="ud-rung__place" aria-label={r.rank ? `Place ${r.rank}` : "No place"}>
                  {r.rank ?? "–"}
                </span>
                <UnitMark emblem={r.unit.emblem ?? null} code={r.unit.code} className="ud-rung__mark" />
                <span className="ud-rung__name">
                  <span>{r.unit.name}</span>
                  {you && <span className="ud-you">You</span>}
                </span>
                <span className="ud-rung__bar" aria-hidden="true">
                  <i style={{ "--v": `${(r.unit.validated / most) * 100}%`, "--i": k } as CSSProperties} />
                </span>
                <b className="ud-rung__n">
                  {r.unit.validated}
                  <span className="sr-only"> validated</span>
                </b>
              </li>,
            ];
          })}
        </ol>
      ) : (
        <p className="ud-stand__none">No one on the board yet</p>
      )}
    </Tile>
  );
}
