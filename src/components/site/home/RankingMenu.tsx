import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { movement } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";
import { serverViews } from "@/lib/governance/server/views";

/**
 * Two-column menu with photo bullets: the eight rankings filed under their four ranking bodies, each
 * with the result where a menu would put the price. Bullets are round photographs of the University.
 */
export async function RankingMenu({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const { rankingPhoto } = await serverViews();
  const H = headingLevel === 2 ? "h3" : "h4";
  // Ranking bodies and rankings as System Configuration shows them publicly.
  const BODIES = (await siteData()).bodies;
  return (
    <div className="w-rkmenu">
      <nav className="w-rkmenu__jump" aria-label="Ranking bodies">
        {BODIES.map((b) => (
          <a key={b.id} href={`#body-${b.id}`}>
            {b.short}
          </a>
        ))}
      </nav>
      {BODIES.map((b) => (
        <div key={b.id} className="w-rkmenu__cat" id={`body-${b.id}`}>
          <div className="w-rkmenu__cathead" data-reveal>
            <H className="w-rkmenu__body">
              <i className="w-dot" style={{ background: b.color } as CSSProperties} aria-hidden="true" />
              {b.name}
            </H>
            <span className="w-rkmenu__count">
              {b.rankings.length} {b.rankings.length === 1 ? "ranking" : "rankings"}
            </span>
          </div>
          <ul className="w-rkmenu__items">
            {b.rankings.map((r, i) => {
              const photo = rankingPhoto[r.slug];
              return (
                <li key={r.slug} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
                  <Link href={`/rankings/${r.slug}`} className="w-rkitem">
                    <span className="w-rkitem__pic">
                      <Image src={photo.src} alt="" fill sizes="72px" style={{ objectPosition: photo.pos }} />
                    </span>
                    <span className="w-rkitem__body">
                      <span className="w-rkitem__row">
                        <span className="w-rkitem__name">{r.name}</span>
                        <span className="w-rkitem__res">{r.current}</span>
                      </span>
                      <span className="w-rkitem__desc">{r.measures}.</span>
                      <span className={`w-rkitem__note${r.direction === "up" ? " w-up" : ""}`}>{movement(r)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
