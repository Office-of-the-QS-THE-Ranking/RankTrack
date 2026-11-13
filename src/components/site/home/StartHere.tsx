import Link from "next/link";
import { siteData } from "@/lib/governance/server/site";
import { serverViews } from "@/lib/governance/server/views";
import { PUBLICATIONS_PATH } from "@/lib/publications";

/**
 * The first plain section after the two night showpieces: what this site is, in one sentence, and the
 * five things a visitor comes for, each a full-width row that says where it leads. Rows for sections
 * Command & Control has switched off are left out.
 */
export async function StartHere() {
  const { latestEdition } = await serverViews();
  const { rankings, features, stories, unitsEngaged } = await siteData();
  const n = rankings.length;
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const count = WORDS[n] ?? String(n);
  const rows = [
    { href: "/rankings", label: "Where UST stands", text: `All ${count} results for ${latestEdition}, side by side, each compared with the edition before it.` },
    features.knowledgeBase && { href: "/knowledge-base", label: "How the rankings work", text: "Each method in plain language, and a dictionary of the terms they share." },
    features.publications && {
      href: `${PUBLICATIONS_PATH}/stories`,
      label: "The work behind the results",
      text: stories.length ? "Thomasian research and service, told with the figure each one changed." : "Thomasian research and service, as each story is approved for publication.",
    },
    features.recognition && {
      href: "/recognition",
      label: "Who contributed",
      text: unitsEngaged ? `The ${unitsEngaged} colleges, centres and offices whose evidence counted this cycle.` : "The colleges, centres and offices whose evidence counts.",
    },
    { href: "/about", label: "Who runs this site", text: "The Office of QS/THE Rankings, what it does and how to reach it." },
  ].filter((r): r is { href: string; label: string; text: string } => !!r);

  return (
    <section className="w-start w-section w-wrap" aria-labelledby="start-title">
      <div className="w-start__in w-grid">
        <div className="w-start__copy">
          <h2 id="start-title" className="w-head" data-reveal>
            What you can find here
          </h2>
          <p className="w-lead" data-reveal style={{ ["--d" as string]: "90ms" }}>
            This site reports where the University of Santo Tomas stands in {count} global university rankings, and the work behind each
            result.
          </p>
        </div>
        <ul className="w-start__rows">
          {rows.map((r, i) => (
            <li key={r.href} data-reveal style={{ ["--d" as string]: `${i * 70}ms` }}>
              <Link href={r.href} className="w-start__row">
                <span className="w-start__label">{r.label}</span>
                <span className="w-start__text">{r.text}</span>
                <span className="w-start__go" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="M3 8h9.2M8.4 3.6 12.8 8l-4.4 4.4" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
