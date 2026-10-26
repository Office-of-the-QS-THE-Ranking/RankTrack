"use client";

import Link from "next/link";
import { useState } from "react";
import { DIMENSIONS, DIMENSION_NOTES, MATRIX, RANKINGS, type Dimension } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { Card, Swatch } from "@/components/ui/primitives";

const ORDER = ["qs-wur", "the-wur", "the-impact", "qs-sustainability", "greenmetric", "wuri", "the-subject", "qs-subject"];
const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** Which institutional dimensions each ranking measures. Selecting a dimension explains why the
 *  same evidence can support several rankings. */
export function DimensionMatrix({ base, slugs, glow }: { base: string; slugs?: string[]; glow?: boolean }) {
  const [dim, setDim] = useState<Dimension | null>("Research");
  // Only the rankings System Configuration tracks (or shows publicly) are compared.
  const cols = ORDER.filter((s) => !slugs || slugs.includes(s)).map((s) => RANKINGS.find((r) => r.slug === s)!);
  const phrase = (n: number) => (n === cols.length && n > 1 ? `all ${words[n] ?? n} rankings` : `${words[n] ?? n} ${n === 1 ? "ranking" : "rankings"}`);
  const count = dim ? cols.filter((r) => MATRIX[r.slug].includes(dim)).length : 0;

  return (
    <Card
      glow={glow}
      title={
        <>
          Comparison of methodologies
          <InfoTooltip label="About the methodology comparison">
            Which institutional dimensions each ranking measures. Select a dimension to see where its evidence counts.
            {dim && (
              <>
                <br /><br />
                <b>{dim} counts in {phrase(count)}.</b>{" "}
                {DIMENSION_NOTES[dim]}
              </>
            )}
          </InfoTooltip>
        </>
      }
      className="matrix-card"
      icon="grid"
      bodyClass="card__body--flush"
    >
      <div className="table-wrap">
        <table className="table matrix matrix--lens">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              {cols.map((r) => (
                <th key={r.slug} scope="col" className={`c${dim && MATRIX[r.slug].includes(dim) ? " is-hit" : ""}`}>
                  <Link href={`${base}/${r.slug}`} className="matrix__col">
                    <Swatch family={r.family} bar />
                    {r.short}
                  </Link>
                </th>
              ))}
              <th scope="col" className="r">
                Rankings
              </th>
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((d) => {
              const n = cols.filter((r) => MATRIX[r.slug].includes(d)).length;
              const on = dim === d;
              return (
                <tr key={d} className={on ? "is-on" : undefined}>
                  <th scope="row">
                    <button type="button" className="matrix__dim" aria-pressed={on} onClick={() => setDim(on ? null : d)}>
                      {d}
                    </button>
                  </th>
                  {cols.map((r) => (
                    <td key={r.slug} className="c">
                      {MATRIX[r.slug].includes(d) ? (
                        <span className="tick">
                          <Icon name="check" size={14} strokeWidth={2.4} />
                          <span className="sr-only">Measured</span>
                        </span>
                      ) : (
                        <span className="sr-only">Not measured</span>
                      )}
                    </td>
                  ))}
                  <td className="r num">
                    <b>{n}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
