import { dimsOf } from "@/lib/site";
import { siteData } from "@/lib/governance/server/site";

/**
 * The page's one live thing, on the band that splits the page: choose a kind of work and the rankings
 * that measure it light up. Built from radio buttons and CSS :has(), so it works without JavaScript.
 */
export function CountsWhere({ id = "cw", headingLevel = 2 }: { id?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const { rankings: RANKINGS, counts: COUNTS } = siteData();
  // One rule per kind of work: light the rankings that measure it and show its note.
  const rules = COUNTS.map(
    (_, i) =>
      `.w-counts:has(#${id}-${i}:checked) .w-counts__rk[data-dims~="${i}"]{background:var(--gold);color:var(--black)}` +
      `.w-counts:has(#${id}-${i}:checked) .w-counts__rk[data-dims~="${i}"] .w-counts__state{opacity:1}` +
      `.w-counts:has(#${id}-${i}:checked) [data-note="${i}"]{display:block}`,
  ).join("");

  return (
    <section className="w-counts w-on-dark" aria-labelledby={`${id}-title`}>
      <style>{rules}</style>
      <div className="w-counts__in w-wrap">
        <div className="w-counts__copy">
          <H id={`${id}-title`} className="w-head" data-reveal>
            Where your work counts
          </H>
          <p className="w-lead" data-reveal style={{ ["--d" as string]: "80ms" }}>
            Choose a kind of work. The rankings that measure it light up, because one validated record counts in every ranking it supports.
          </p>
          <fieldset className="w-counts__dims" data-reveal style={{ ["--d" as string]: "160ms" }}>
            <legend className="sr-only">Kind of work</legend>
            {COUNTS.map((c, i) => (
              <span key={c.dim} className="w-counts__opt">
                <input type="radio" name={id} id={`${id}-${i}`} className="w-counts__input" defaultChecked={i === 0} />
                <label htmlFor={`${id}-${i}`} className="w-chip">
                  {c.dim}
                </label>
              </span>
            ))}
          </fieldset>
        </div>

        <div className="w-counts__board">
          <ul className="w-counts__rings" aria-label="The eight rankings">
            {RANKINGS.map((r, i) => (
              <li key={r.slug} className="w-counts__rk" data-dims={dimsOf(r.slug).join(" ")} style={{ ["--k" as string]: i }}>
                <span className="w-counts__name">{r.short}</span>
                <span className="w-counts__state" aria-hidden="true" />
              </li>
            ))}
          </ul>
          <div className="w-counts__notes" aria-live="polite">
            {COUNTS.map((c, i) => (
              <p key={c.dim} className="w-counts__note" data-note={i}>
                <b className="w-counts__n">
                  {c.rankings.length} of {RANKINGS.length}
                </b>
                <span>
                  rankings measure {c.dim.toLowerCase()}: {c.rankings.map((r) => r.short).join(", ")}. {c.note}
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
