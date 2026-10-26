import Link from "next/link";
import type { CSSProperties } from "react";
import { CYCLE, RECOGNITION, WURI_PLACEMENTS } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, Empty, PageHeader, Pattern, SectionHead } from "@/components/ui/primitives";

const SECTIONS = [
  ["achievements", "Institutional achievements"],
  ["units", "Unit contributions"],
  ["champions", "Evidence champions"],
  ["innovation", "Innovation leaders"],
  ["sustainability", "Sustainability partners"],
  ["international", "International recognition"],
  ["archive", "Recognition archive"],
] as const;

const AWARD_ICON: Record<string, IconName> = {
  "Most reusable evidence": "layers",
  "Best outcome evidence": "target",
  "Strongest cross-unit collaboration": "collaboration",
  "Earliest complete submission": "deadline",
  "Most improved documentation": "trend-up",
  "Most promising innovation": "innovation",
  "Best impact story": "quote",
};

/** Rankings whose evidence the sustainability partners supply. */
const SUSTAINABILITY = ["UI GreenMetric", "QS Sustainability", "THE Impact"];

/** Awards given in earlier cycles, newest first. */
const ARCHIVE: { cycle: string; awards: number }[] = [];

/** Recognition follows verified evidence quality, measurable outcomes and collaboration (proposal §8). */
export async function RecognitionWall({ mode }: { mode: "internal" | "public" }) {
  const internal = mode === "internal";
  // Units follow the Organizational Directory (active ones are recognised); rankings follow configuration.
  const h = await hub();
  const UNITS = h.activeUnits;
  const STORIES = h.stories;
  const unitHref = (name: string) => {
    const u = h.unitByName(name);
    return internal && u ? `/admin/units/${u.slug}` : undefined;
  };
  const achievements = h.rankings.filter((r) => r.direction === "up");
  const topUnits = UNITS.filter((u) => u.validated > 0).sort((a, b) => b.validated - a.validated || b.rankingsServed - a.rankingsServed).slice(0, 6);
  const champions = UNITS.filter((u) => u.coordinatorId && u.rankingsServed > 0).sort((a, b) => b.rankingsServed - a.rankingsServed).slice(0, 4);
  const innovation = STORIES.filter((s) => s.themes.includes("Thomasian Innovations") && (internal || s.state === "Published"));
  const partners = UNITS.filter((u) => STORIES.some((s) => s.state === "Published" && s.unit.startsWith(u.name) && s.rankings.some((r) => SUSTAINABILITY.includes(r)))).map((u) => u.name);

  return (
    <>
      <PageHeader
        title="Recognition wall"
        lede="The people and units behind UST's results. Recognition follows verified evidence quality, measurable outcomes and collaboration, never the number of files uploaded."
      />
      <nav aria-label="Recognition sections" className="pills">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="pill">
            {label}
          </a>
        ))}
      </nav>

      <section id="achievements" className="stack" style={{ ["--gap" as string]: "14px" } as CSSProperties}>
        <SectionHead title="Institutional achievements" sub="Movement in the latest editions" />
        {achievements.length ? (
          <div className="achieve">
            {achievements.map((r, i) => (
              <div key={r.slug} className={`achieve__tile${i === 0 ? " achieve__tile--gold" : i === 1 ? " achieve__tile--dark" : ""}`}>
                {i < 2 && <Pattern fade="up" className="achieve__pattern" />}
                <span className="achieve__name">{r.name}</span>
                <span className="achieve__v">{r.current}</span>
                <span className="achieve__from">
                  <Icon name="arrow-up" size={14} strokeWidth={2.2} /> up from {r.previous}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon="trend-up" title="No results have moved up yet" />
          </Card>
        )}
      </section>

      <section id="units" className="stack" style={{ ["--gap" as string]: "14px" } as CSSProperties}>
        <SectionHead title={`${CYCLE} cycle awards`} sub="Awarded for quality: earliest complete submission, best outcome evidence, collaboration, reuse, improvement, impact stories and innovation" />
        {RECOGNITION.length ? (
          <div className="awards">
            {RECOGNITION.map((r) => {
              const href = unitHref(r.unit);
              return (
                <article key={r.award} className="award">
                  <span className="award__icon">
                    <Icon name={AWARD_ICON[r.award] ?? "recognition"} size={18} />
                  </span>
                  <p className="award__name">{r.award}</p>
                  <h3>{href ? <Link href={href}>{r.unit}</Link> : r.unit}</h3>
                  <p className="small text-2">{r.reason}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <Card>
            <Empty icon="recognition" title="No awards this cycle yet" />
          </Card>
        )}
      </section>

      <div className="grid cols-2">
        <Card title="Top contributing units" sub="By validated contributions and rankings served" icon="units">
          {topUnits.length ? (
            <ol className="list rank-list">
              {topUnits.map((u, i) => (
                <li key={u.slug}>
                  <span className="list__main rank-list__main">
                    <span className="rank-list__n">{i + 1}</span>
                    {internal ? <Link href={`/admin/units/${u.slug}`}>{u.name}</Link> : u.name}
                  </span>
                  <span className="list__aside small num">
                    <b>{u.validated}</b> validated
                  </span>
                  <span className="list__sub" style={{ paddingLeft: 36 }}>
                    Evidence counts in {u.rankingsServed} rankings
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty icon="units" title="No validated contributions yet" />
          )}
        </Card>
        <Card title="Evidence champions" sub="Unit coordinators whose evidence is reused most widely" icon="recognition" id="champions" tone="dark">
          {champions.length ? (
            <ul className="list">
              {champions.map((u) => (
                <li key={u.slug}>
                  <span className="list__main">{u.coordinator}</span>
                  <span className="list__aside small" style={{ color: "var(--gold-400)", fontWeight: 600 }}>
                    {u.rankingsServed} rankings
                  </span>
                  <span className="list__sub">{u.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small" style={{ color: "var(--on-dark-2)" }}>
              None yet.
            </p>
          )}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Innovation leaders" sub="Programmes documented for WURI and the public showcase" icon="innovation" id="innovation">
          {innovation.length ? (
            <ul className="list">
              {innovation.map((s) => (
                <li key={s.slug}>
                  <Link href={internal ? `/admin/impact#${s.slug}` : `/impact/${s.slug}`} className="list__main">
                    {s.title}
                  </Link>
                  <span className="list__sub">{s.unit}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="innovation" title="No innovations documented yet" />
          )}
        </Card>
        <Card title="Sustainability partners" sub="Units behind GreenMetric, QS Sustainability and THE Impact evidence" icon="sustainability" id="sustainability">
          {partners.length ? (
            <ul className="list">
              {partners.map((n) => {
                const href = unitHref(n);
                return (
                  <li key={n}>
                    {href ? (
                      <Link href={href} className="list__main">
                        {n}
                      </Link>
                    ) : (
                      <span className="list__main">{n}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="sustainability" title="No published sustainability stories yet" />
          )}
        </Card>
      </div>

      <div className="grid cols-2-1" id="international">
        <Card title="International recognition" icon="globe" sub="WURI Top 100 placements, from the official result letter">
          {WURI_PLACEMENTS.length ? (
            <div className="chips">
              {WURI_PLACEMENTS.map((c) => (
                <span key={c} className="chip chip--outline">
                  <Icon name="recognition" size={13} /> {c}
                </span>
              ))}
            </div>
          ) : (
            <Empty icon="globe" title="No placements recorded yet" />
          )}
        </Card>
        <Card title="Recognition archive" icon="history" id="archive">
          {ARCHIVE.length ? (
            <ul className="list">
              {ARCHIVE.map((a) => (
                <li key={a.cycle}>
                  <span className="list__main">{a.cycle} cycle</span>
                  <span className="list__aside small muted">{a.awards} awards</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="history" title="No earlier cycles yet" />
          )}
        </Card>
      </div>
    </>
  );
}
