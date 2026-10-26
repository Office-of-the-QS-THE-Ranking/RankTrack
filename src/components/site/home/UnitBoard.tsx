import Link from "next/link";
import { siteData } from "@/lib/governance/server/site";

/** Large marks on tiles: the units behind the results, named in full rather than logos. */
export async function UnitBoard() {
  // Units from the Organizational Directory: archived ones leave the board, renamed ones show their new name.
  const { boardUnits: BOARD_UNITS, unitsEngaged, units } = await siteData();
  return (
    <section className="w-units w-section w-wrap" aria-labelledby="units-title">
      <ul className="w-board">
        <li className="w-board__lead" data-reveal>
          <h2 id="units-title" className="w-head">
            Every unit, one result
          </h2>
          <p>
            {unitsEngaged
              ? `${unitsEngaged} of the University’s ${units.length} colleges, centres and offices contribute evidence this cycle.`
              : "The colleges, centres and offices whose evidence counts appear here as this cycle's submissions are validated."}
          </p>
        </li>
        {BOARD_UNITS.map((u, i) => (
          <li key={u.slug} className="w-board__tile" data-reveal style={{ ["--d" as string]: `${(i % 4) * 70}ms` }}>
            <span className="w-board__name">{u.name}</span>
            <span className="w-board__meta">Evidence counts in {u.rankingsServed} rankings</span>
          </li>
        ))}
      </ul>
      <p className="w-units__note" data-reveal>
        Recognition follows validated quality and reuse, never the number of files uploaded.{" "}
        <Link href="/recognition" className="w-link">
          See who was recognised this cycle
        </Link>
      </p>
    </section>
  );
}
