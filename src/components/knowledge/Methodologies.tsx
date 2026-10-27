"use client";

import type { CSSProperties } from "react";
import type { Ranking } from "@/lib/data";
import type { Family } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { Swatch } from "@/components/ui/primitives";

const pct = (weight: string) => (/%/.test(weight) ? parseFloat(weight) : NaN);
/** Legend rows shown before "+ more"; the bar keeps every indicator. */
const SHOWN = 5;

/**
 * What each framework weighs: its indicators as one bar in shades of the family's colour, sized by weight
 * where the methodology gives weights and evenly where it names dimensions or thresholds.
 */
export function Methodologies({ rankings, families, href }: { rankings: Ranking[]; families: Record<string, Family>; href: (slug: string) => string }) {
  return (
    <div className="kc-ranks">
      {rankings.map((r) => {
        const fam = families[r.family];
        const color = fam?.color ?? "var(--text-3)";
        const inds = r.indicators;
        const weights = inds.map((i) => pct(i.weight));
        const weighted = inds.length > 0 && weights.every((w) => w > 0);
        const shade = (k: number) => `color-mix(in oklab, ${color} ${Math.round(100 - (k * 62) / Math.max(1, inds.length - 1))}%, var(--surface))`;
        return (
          <Tile
            key={r.slug}
            id={`kc-r-${r.slug}`}
            className="kc-rank"
            href={href(r.slug)}
            title={
              <>
                <Swatch family={r.family} />
                {r.short}
              </>
            }
          >
            <p className="kc-rank__name">{r.name}</p>
            {inds.length > 0 && (
              <>
                <span className="kc-bar" role="img" aria-label={inds.map((i) => (weighted ? `${i.name} ${i.weight}` : i.name)).join(", ")}>
                  {inds.map((ind, k) => (
                    <i key={ind.name} title={weighted ? `${ind.name} · ${ind.weight}` : ind.name} style={{ flexGrow: weighted ? weights[k] : 1, background: shade(k), ["--k" as string]: k } as CSSProperties} />
                  ))}
                </span>
                <ul className="kc-legend" aria-hidden="true">
                  {inds.slice(0, SHOWN).map((ind, k) => (
                    <li key={ind.name}>
                      <i style={{ background: shade(k) }} />
                      <span>{ind.name}</span>
                      {weighted && <b>{ind.weight.replace(/\s*\(.*\)$/, "")}</b>}
                    </li>
                  ))}
                  {inds.length > SHOWN && <li className="kc-legend__more">+{inds.length - SHOWN} more</li>}
                </ul>
              </>
            )}
            {r.reportingPeriod && (
              <p className="kc-rank__foot">
                <Icon name="calendar" size={14} />
                {r.reportingPeriod}
              </p>
            )}
          </Tile>
        );
      })}
    </div>
  );
}
