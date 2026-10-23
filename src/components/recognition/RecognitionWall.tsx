import Link from "next/link";
import type { CSSProperties } from "react";
import { RECOGNITION, WURI_CATEGORIES } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, PageHeader, Pattern, SectionHead } from "@/components/ui/primitives";

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

/** Recognition follows verified evidence quality, measurable outcomes and collaboration (proposal §8). */
export function RecognitionWall({ mode }: { mode: "internal" | "public" }) {
  const internal = mode === "internal";
  // Units follow the Organizational Directory (active ones are recognised); rankings follow configuration.
  const h = hub();
  const UNITS = h.activeUnits;
  const STORIES = h.stories;
  const unitHref = (name: string) => {
    const u = h.unitByName(name);
    return internal && u ? `/admin/units/${u.slug}` : undefined;
  };
  const achievements = ["the-impact", "wuri", "qs-wur", "qs-sustainability"].map((s) => h.ranking(s)).filter((r): r is NonNullable<typeof r> => !!r);
  const topUnits = [...UNITS].sort((a, b) => b.validated - a.validated || b.rankingsServed - a.rankingsServed).slice(0, 6);
  const champions = [...UNITS].sort((a, b) => b.rankingsServed - a.rankingsServed).slice(0, 4);
  const innovation = STORIES.filter((s) => s.themes.includes("Thomasian Innovations") && (internal || s.state === "Published"));
  const partners = ["Facilities Management Office", "Faculty of Engineering", "Office for Community Development (SIMBAHAYAN)", "Miguel de Benavides Library"];

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
        <div className="achieve">
          {achievements.map((r, i) => (
            <div key={r.slug} className={`achieve__tile${i === 0 ? " achieve__tile--gold" : i === 1 ? " achieve__tile--dark" : ""}`}>
              {i < 2 && <Pattern fade="up" className="achieve__pattern" />}
              <span className="achieve__name">{r.name}</span>
              <span className="achieve__v">{r.current}</span>
              <span className="achieve__from">
                <Icon name="arrow-up" size={14} strokeWidth={2.2} /> up from {r.previous}
              </span>
              {r.slug === "wuri" && <span className="achieve__extra">Top 100 in 12 categories</span>}
            </div>
          ))}
        </div>
      </section>

      {internal && (
        <section className="helped" aria-label="You helped achieve this">
          <div className="helped__text">
            <Pattern fade="right" className="helped__pattern" />
            <p className="helped__eyebrow">Sent to participating units when THE Impact results were released</p>
            <blockquote>“Your office contributed four validated items supporting UST&rsquo;s advancement in the THE Impact Ratings.”</blockquote>
            <p className="helped__note">
              Units credited: Faculty of Medicine and Surgery, SIMBAHAYAN, Faculty of Engineering, Office of International Relations and
              Programs
            </p>
          </div>
          <div className="helped__fig">
            <span>THE Impact Ratings</span>
            <b>401–600</b>
            <span>up from 601–800</span>
          </div>
        </section>
      )}

      <section id="units" className="stack" style={{ ["--gap" as string]: "14px" } as CSSProperties}>
        <SectionHead title="2026 cycle awards" sub="Awarded for quality: earliest complete submission, best outcome evidence, collaboration, reuse, improvement, impact stories and innovation" />
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
      </section>

      <div className="grid cols-2">
        <Card title="Top contributing units" sub="By validated contributions and rankings served" icon="units">
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
        </Card>
        <Card title="Evidence champions" sub="Unit coordinators whose evidence is reused most widely" icon="recognition" id="champions" tone="dark">
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
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Innovation leaders" sub="Programmes documented for WURI and the public showcase" icon="innovation" id="innovation">
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
        </Card>
        <Card title="Sustainability partners" sub="Units behind GreenMetric, QS Sustainability and THE Impact evidence" icon="sustainability" id="sustainability">
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
        </Card>
      </div>

      <div className="grid cols-2-1" id="international">
        <Card title="International recognition" icon="globe" sub="WURI 151–200, with Top 100 placements in 12 categories and WURI mentorship engagement">
          <div className="chips">
            {WURI_CATEGORIES.map((c) => (
              <span key={c} className="chip chip--outline">
                <Icon name="recognition" size={13} /> {c}
              </span>
            ))}
          </div>
          <p className="small muted mt-4">Category names are sample; confirm against the official result letter.</p>
        </Card>
        <Card title="Recognition archive" icon="history" id="archive">
          <ul className="list">
            {[
              ["2025–2026 cycle", "7 awards"],
              ["2024–2025 cycle", "5 awards"],
              ["2023–2024 cycle", "4 awards"],
            ].map(([c, n]) => (
              <li key={c}>
                <span className="list__main">{c}</span>
                <span className="list__aside small muted">{n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
