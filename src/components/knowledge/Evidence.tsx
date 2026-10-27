"use client";

import type { CSSProperties } from "react";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { CHECKS, EXAMPLES } from "./content";

/**
 * Evidence standards, shown rather than told: the five checks as a row of marks, the impact ladder as a
 * staircase, and worked examples side by side as what counts and what doesn't.
 */
export function Evidence({ checks, examples, steps }: { checks: typeof CHECKS; examples: typeof EXAMPLES; steps: string[] }) {
  return (
    <div className="kc-ev">
      {checks.length > 0 && (
        <Tile id="standards" title="What reviewers check" className="kc-checks-tile">
          <ol className="kc-checks">
            {checks.map((c) => (
              <li key={c.title} className="kc-check" style={{ ["--i" as string]: CHECKS.indexOf(c) } as CSSProperties}>
                <span className="kc-check__icon" aria-hidden="true">
                  <Icon name={c.icon} size={22} strokeWidth={1.7} />
                  <i>
                    <Icon name="check" size={10} strokeWidth={3.2} />
                  </i>
                </span>
                <b>{c.title}</b>
                <span>{c.text}</span>
              </li>
            ))}
          </ol>
        </Tile>
      )}

      {steps.length > 0 && (
        <Tile id="kc-ladder-h" title="Evidence strength" className="kc-ladder-tile">
          <ol className="kc-stairs" style={{ ["--n" as string]: steps.length } as CSSProperties}>
            {steps.map((s, k) => (
              <li key={s} style={{ ["--k" as string]: k } as CSSProperties} aria-label={`Level ${k + 1}: ${s}`}>
                <span className="kc-stairs__step" aria-hidden="true">
                  {k === steps.length - 1 && (
                    <span className="kc-stairs__flag">
                      <Icon name="flag" size={14} strokeWidth={2} />
                    </span>
                  )}
                  <b>{k + 1}</b>
                </span>
                <span className="kc-stairs__label">{s}</span>
              </li>
            ))}
          </ol>
        </Tile>
      )}

      {examples.length > 0 && (
        <Tile id="kc-ex-h" title="Counts, and doesn’t" className="kc-ex-tile">
          <ul className="kc-ex">
            {examples.map((e) => (
              <li key={e.topic} className="kc-pair">
                <span className="kc-pair__topic">
                  <Icon name={e.icon} size={14} />
                  {e.topic}
                </span>
                <p className="kc-pair__side is-good">
                  <span className="kc-pair__mark">
                    <Icon name="check" size={12} strokeWidth={3} />
                    <span className="sr-only">Counts:</span>
                  </span>
                  {e.good}
                </p>
                <p className="kc-pair__side is-bad">
                  <span className="kc-pair__mark">
                    <Icon name="close" size={12} strokeWidth={3} />
                    <span className="sr-only">Doesn’t count:</span>
                  </span>
                  {e.bad}
                </p>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </div>
  );
}
