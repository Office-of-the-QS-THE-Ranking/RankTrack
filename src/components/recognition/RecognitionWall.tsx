import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { RECOGNITION, WURI_PLACEMENTS } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { hub } from "@/lib/governance/server/hub";
import { buildUnitLeaderboard } from "@/lib/governance/unit-leaderboard";
import { Tile } from "@/components/dashboard/Tile";
import { Medal } from "@/components/units/profile/Medal";
import { UnitMark } from "@/components/units/UnitMark";
import { Icon, type IconName } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { Swatch } from "@/components/ui/primitives";

/** The emblem struck on an award's medal, by what the award is for; the first match wins. */
const AWARD_ICON: [RegExp, IconName][] = [
  [/\breus/i, "layers"],
  [/\boutcome/i, "target"],
  [/\bcollaborat/i, "collaboration"],
  [/\bearl/i, "deadline"],
  [/\bimprov/i, "trend-up"],
  [/\binnovat/i, "innovation"],
  [/\bstor/i, "quote"],
  [/\bimpact/i, "spark"],
  [/\bevidence/i, "evidence"],
];
const awardIcon = (award: string) => AWARD_ICON.find(([words]) => words.test(award))?.[1] ?? "recognition";

/** Rankings whose evidence the sustainability partners supply. */
const SUSTAINABILITY = ["UI GreenMetric", "QS Sustainability", "THE Impact"];

/** Awards given in earlier cycles, newest first. */
const ARCHIVE: { cycle: string; awards: number }[] = [];

const plural = (n: number, one: string) => (n === 1 ? one : `${one}s`);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .map((w) => w[0].toUpperCase())
    .join("");

/** What an empty tile shows instead. */
function None({ icon, children }: { icon: IconName; children: string }) {
  return (
    <p className="rw-none">
      <Icon name={icon} size={16} />
      {children}
    </p>
  );
}

/**
 * The Recognition wall: the cycle's awards struck as gold medals on onyx, then the results that rose and the
 * units, coordinators and programmes behind them, on the dashboard's tiles. Recognition follows verified
 * evidence quality, measurable outcomes and collaboration (proposal §8).
 */
export async function RecognitionWall({ mode }: { mode: "internal" | "public" }) {
  const internal = mode === "internal";
  // Units follow the Organizational Directory (active ones are recognised); rankings follow configuration.
  const h = await hub();
  const units = h.activeUnits;
  const unitHref = (u: HubUnit | undefined) => (internal && u ? `/admin/units/${u.slug}` : undefined);
  const unitLink = (u: HubUnit) => {
    const href = unitHref(u);
    return href ? <Link href={href}>{u.name}</Link> : u.name;
  };

  const awards = RECOGNITION.map((r) => ({ ...r, href: unitHref(h.unitByName(r.unit)) }));
  const movers = h.rankings.filter((r) => r.direction === "up");
  // Ties share a position, as on the Units leaderboard.
  const top = buildUnitLeaderboard(units).filter((s) => s.rank !== null).slice(0, 6);
  const most = Math.max(1, ...top.map((s) => s.unit.validated));
  const champions = units.filter((u) => u.coordinatorId && u.rankingsServed > 0).sort((a, b) => b.rankingsServed - a.rankingsServed).slice(0, 4);
  const innovation = h.stories.filter((s) => s.themes.includes("Thomasian Innovations") && (internal || s.state === "Published"));
  // Stories name a ranking by its short name; older ones by its slug.
  const green = h.ref.rankings.filter((r) => SUSTAINABILITY.includes(r.short));
  const isGreen = (name: string) => green.some((r) => r.short === name || r.slug === name);
  const partners = units.filter((u) => h.stories.some((s) => s.state === "Published" && s.unit.startsWith(u.name) && s.rankings.some(isGreen)));
  const wuri = h.ref.rankings.find((r) => r.slug === "wuri");

  return (
    <div className="ov rw">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Recognition wall</h1>
          <InfoTooltip label="How recognition is earned">
            Earned through verified evidence quality, measurable outcomes and collaboration, never the number of files uploaded.
          </InfoTooltip>
        </div>
      </header>

      <div className="ov-bento rw-bento">
        <Tile id="awards" className="rw-awards">
          <header className="rw-awards__head">
            <p className="rw-awards__cycle">{h.currentCycle}</p>
            <h2 id="awards" className="rw-awards__title">
              Cycle awards
            </h2>
          </header>
          {awards.length ? (
            <ol className="rw-awards__list" style={{ ["--cols" as string]: Math.min(3, awards.length) } as CSSProperties}>
              {awards.map((a, i) => (
                <li key={a.award} className="rw-award" style={{ ["--i" as string]: i } as CSSProperties}>
                  <Medal icon={awardIcon(a.award)} metal="gold" size={60} />
                  <p className="rw-award__name">{a.award}</p>
                  <h3 className="rw-award__unit">{a.href ? <Link href={a.href}>{a.unit}</Link> : a.unit}</h3>
                  <p className="rw-award__why">{a.reason}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rw-awards__none">
              <span className="rw-awards__blanks" aria-hidden="true">
                {(["layers", "target", "collaboration"] as const).map((icon) => (
                  <Medal key={icon} icon={icon} size={52} />
                ))}
              </span>
              <p>No awards yet</p>
            </div>
          )}
        </Tile>

        <Tile id="achievements" title="Moved up" className="rw-up">
          {movers.length ? (
            <ul className="rw-up__list" style={{ ["--cols" as string]: Math.min(4, movers.length) } as CSSProperties}>
              {movers.map((r) => (
                <li key={r.slug}>
                  <Link href={internal ? `/admin/rankings/${r.slug}` : `/rankings/${r.slug}`} className="rw-mover">
                    <span className="rw-mover__name">
                      <Swatch family={r.family} />
                      {r.short}
                    </span>
                    <span className="rw-mover__now">{r.current}</span>
                    <span className="rw-mover__from">
                      <Icon name="arrow-up" size={13} strokeWidth={2.4} />
                      from {r.previous}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <None icon="trend-up">No results have moved up yet</None>
          )}
        </Tile>

        <Tile
          id="units"
          title="Top contributors"
          className="rw-top"
          aside={
            internal && (
              <Link href="/admin/units" className="btn btn--sm">
                All units
              </Link>
            )
          }
        >
          {top.length ? (
            <div className="rw-board">
              <p className="rw-board__cols" aria-hidden="true">
                <span>Validated</span>
                <span>Rankings</span>
              </p>
              <ol className="rw-board__list">
                {top.map(({ unit: u, rank }) => (
                  <li key={u.slug} className="rw-board__row" style={{ ["--w" as string]: u.validated / most } as CSSProperties}>
                    <span className="rw-board__n">
                      <span className="sr-only">Position </span>
                      {rank}
                    </span>
                    <UnitMark emblem={u.emblem ?? null} code={u.code} className="rw-mark" />
                    <span className="rw-board__name">{unitLink(u)}</span>
                    <span className="rw-board__bar" aria-hidden="true" />
                    <span className="rw-board__figs">
                      <span className="rw-board__v">
                        {u.validated}
                        <span className="rw-board__label"> validated</span>
                      </span>
                      <span className="rw-board__r">
                        {u.rankingsServed}
                        <span className="rw-board__label"> {plural(u.rankingsServed, "ranking")}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <None icon="units">No validated evidence yet</None>
          )}
        </Tile>

        <Tile id="champions" title="Evidence champions" className="rw-champs">
          {champions.length ? (
            <ul className="rw-people">
              {champions.map((u) => (
                <li key={u.slug}>
                  <span className="rw-face" aria-hidden="true">
                    {initials(u.coordinator.split(", ")[0])}
                  </span>
                  <span className="rw-people__who">
                    <b>{u.coordinator}</b>
                    <span>{unitLink(u)}</span>
                  </span>
                  <span className="rw-people__n">
                    <b>{u.rankingsServed}</b> {plural(u.rankingsServed, "ranking")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <None icon="evidence">No champions yet</None>
          )}
        </Tile>

        <Tile
          id="international"
          title={
            <>
              {wuri && <Swatch family={wuri.family} />}
              WURI Top 100
            </>
          }
          className="rw-intl"
        >
          {WURI_PLACEMENTS.length ? (
            <ul className="rw-places">
              {WURI_PLACEMENTS.map((c) => (
                <li key={c}>
                  <Medal icon="recognition" metal="gold" size={30} />
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <None icon="globe">No placements yet</None>
          )}
        </Tile>

        <Tile id="innovation" title="Innovation leaders" className="rw-inno">
          {innovation.length ? (
            <ul className="rw-stories">
              {innovation.map((s) => (
                <li key={s.slug}>
                  <Link href={internal ? `/admin/publications/stories#${s.slug}` : `/publications/stories/${s.slug}`} className="rw-story">
                    <span className="rw-story__pic">
                      {s.images[0] ? <Image src={s.images[0]} alt="" fill sizes="52px" /> : <Icon name="innovation" size={18} />}
                    </span>
                    <span className="rw-story__title">{s.title}</span>
                    <span className="rw-story__unit">{s.unit}</span>
                    {s.outcomeFigure && <span className="rw-story__fig">{s.outcomeFigure}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <None icon="innovation">No innovations yet</None>
          )}
        </Tile>

        <Tile
          id="sustainability"
          title="Sustainability partners"
          className="rw-green"
          aside={
            <span className="rw-swatches">
              {green.map((r) => (
                <Swatch key={r.slug} family={r.family} title={r.short} />
              ))}
            </span>
          }
        >
          {partners.length ? (
            <ul className="rw-units">
              {partners.map((u) => (
                <li key={u.slug}>
                  <UnitMark emblem={u.emblem ?? null} code={u.code} className="rw-mark rw-mark--sm" />
                  <span>{unitLink(u)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <None icon="sustainability">No partners yet</None>
          )}
        </Tile>

        <Tile id="archive" title="Archive" className="rw-archive">
          {ARCHIVE.length ? (
            <ul className="rw-cycles">
              {ARCHIVE.map((a) => (
                <li key={a.cycle}>
                  <span>{a.cycle}</span>
                  <span className="rw-cycles__n">
                    {a.awards} {plural(a.awards, "award")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <None icon="history">No earlier cycles yet</None>
          )}
        </Tile>
      </div>
    </div>
  );
}
