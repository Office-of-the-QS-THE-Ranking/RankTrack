"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { PUBLISHED_STORIES as STATIC_STORIES } from "@/lib/data";
import { useHub, useRankings } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Swatch } from "@/components/ui/primitives";
import { useViews } from "@/components/reference/ReferenceProvider";

const FAQ = [
  ["Can one document count for several rankings?", "Yes. Submit it once; the Office maps it to every indicator it supports and credits your unit each time."],
  ["What makes evidence acceptable?", "It names the reporting period, the measurable result, who benefited and how that was verified, and links to an approved document."],
  ["Why was my submission returned?", "Most returns are for the wrong reporting period, a missing approval date or a link that needs a login."],
  ["Who confirms official figures?", "The data owner for each indicator. The Office checks consistency but does not change official values."],
  ["When will I know where my evidence counts?", "As soon as a reviewer accepts it. Your dashboard lists every ranking and indicator it supports."],
];

const STANDARDS = [
  "States the reporting period the ranking asks for",
  "Gives a measurable result, not only an activity",
  "Names beneficiaries and how change was verified",
  "Links to an approved, dated document",
  "Uses a public URL where the ranking requires one",
];

const EXAMPLES: [string, string][] = [
  ["Clinic records showing blood-pressure control rose from 41% to 63% among 1,150 patients", "A list of clinic dates with photographs"],
  ["Metered water reuse for January–December 2025 with a metering certificate", "An estimate of water saved, with no meter data"],
  ["An approved policy with its approval date and a public URL", "A draft policy shared through a link that needs a login"],
];

const TEMPLATES = [
  { name: "Evidence submission template", file: "evidence-submission-template.csv", cols: ["Title", "Reporting period", "Measurable result", "Unit of measure", "Beneficiaries", "Number of beneficiaries", "SDGs", "Evidence files or URL", "Rankings"] },
  { name: "Impact story template", file: "impact-story-template.csv", cols: ["Challenge", "Thomasian response", "Implementation", "Measurable outcome", "Beneficiaries", "SDGs", "Rankings", "Replication guidance", "Lessons for other institutions"] },
  { name: "Reporting-period data template", file: "reporting-data-template.csv", cols: ["Indicator", "Ranking", "Reporting period", "Value", "Unit", "Source document", "Data owner"] },
];

const POLICIES = [
  ["UST Aquinas Framework", "Institutional framework for research, teaching and community engagement"],
  ["Social Transformation Framework", "How Thomasian programmes measure change in the communities they serve"],
  ["Sustainability policy", "Campus operations, procurement and climate commitments"],
  ["Data governance for ranking evidence", "Ownership, validation and retention of submitted evidence"],
  ["Lifelong learning access policy", "Public access to short courses and the library"],
];

const TRAINING = [
  ["Orientation: evidence that counts", "Recorded · 42 min"],
  ["Orientation: public URLs and policies", "Recorded · 18 min"],
  ["Writing outcome evidence, not activity reports", "Workshop · 90 min"],
  ["Mapping one record to several rankings", "Guide · 6 pages"],
];

function downloadTemplate(file: string, cols: string[]) {
  const url = URL.createObjectURL(new Blob([cols.map((c) => `"${c}"`).join(",") + "\n"], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SECTIONS = [
  ["dictionary", "Indicator dictionary"],
  ["methodologies", "Ranking methodologies"],
  ["standards", "Evidence standards"],
  ["calendar", "Submission calendar"],
  ["templates", "Templates and forms"],
  ["training", "Training materials"],
  ["faq", "Frequently asked questions"],
  ["practices", "Good practices"],
  ["policies", "Policies and frameworks"],
] as const;

export function Knowledge({ mode }: { mode: "internal" | "public" }) {
  const { calendar, dictionary, office } = useViews();
  const internal = mode === "internal";
  // Definitions come from the governed data dictionary; rankings and stories from configuration and publication.
  const hub = useHub();
  const DICTIONARY = hub?.dictionary ?? dictionary;
  const RANKINGS = useRankings();
  const PUBLISHED_STORIES = hub ? hub.stories.filter((s) => s.state === "Published") : STATIC_STORIES;
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    const next = params.get("q");
    if (next !== null) setQ(next);
  }, [params]);
  const term = q.trim().toLowerCase();
  const hits = DICTIONARY.filter(
    (d) =>
      !term ||
      d.term.toLowerCase().includes(term) ||
      d.definition.toLowerCase().includes(term) ||
      d.links.some((l) => (l.ranking + " " + l.indicator).toLowerCase().includes(term)),
  );
  const rankingBase = internal ? "/admin/rankings" : "/rankings";

  return (
    <>
      <nav aria-label="Knowledge Center sections" className="pills">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="pill">
            {label}
          </a>
        ))}
      </nav>

      <Card title="Indicator dictionary" sub="Search one term and see every ranking it touches" icon="search" id="dictionary">
        <label className="input-group input-group--lg">
          <Icon name="search" />
          <span className="sr-only">Search the indicator dictionary</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “citations”, “water” or “employer”" autoComplete="off" />
          {q && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQ("")}>
              Clear
            </button>
          )}
        </label>
        <p className="small muted" style={{ margin: "12px 0" }} aria-live="polite">
          {hits.length} {hits.length === 1 ? "entry" : "entries"}
          {term && ` for “${q.trim()}”`}
        </p>
        {hits.length ? (
          <ul className="dict">
            {hits.map((d) => (
              <li key={d.term} className="dict__item">
                <h3>{d.term}</h3>
                <p>{d.definition}</p>
                <ul className="dict__links">
                  {d.links.map((l) => {
                    const r = RANKINGS.find((x) => x.short === l.ranking);
                    return (
                      <li key={l.ranking + l.indicator}>
                        {r && <Swatch family={r.family} />}
                        <b>{l.ranking}</b>
                        <span>{l.indicator}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={`No entries for “${q.trim()}”`}>Check the spelling, or try a broader term such as “research” or “students”.</Empty>
        )}
      </Card>

      <Card title="Ranking methodologies" sub="What each framework measures, in plain language" icon="knowledge" id="methodologies" bodyClass="card__body--flush">
        <div className="table-wrap">
          <table className="table table--hover table--stack">
            <thead>
              <tr>
                <th>Ranking</th>
                <th>What it measures</th>
                <th>Reporting period</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {RANKINGS.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <span className="row nowrap table__primary" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                      <Swatch family={r.family} />
                      {r.short}
                    </span>
                  </td>
                  <td data-label="Measures" className="text-2">
                    {r.measures}
                  </td>
                  <td data-label="Period" className="small text-2">
                    {r.reportingPeriod}
                  </td>
                  <td className="r">
                    <Link href={`${rankingBase}/${r.slug}${internal ? "#methodology" : "#measures"}`} className="link small nowrap">
                      Methodology <Icon name="arrow" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid cols-2" id="standards">
        <Card title="Evidence standards" sub="What reviewers check before an item counts" icon="evidence" tone="dark">
          <ol className="standards">
            {STANDARDS.map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Examples of acceptable evidence" icon="check-circle">
          <ul className="examples">
            {EXAMPLES.map(([good, bad]) => (
              <li key={good}>
                <p className="examples__good">
                  <Icon name="check" size={15} strokeWidth={2.2} /> {good}
                </p>
                <p className="examples__bad">
                  <Icon name="close" size={15} strokeWidth={2.2} /> {bad}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Submission calendar" sub="When each ranking body collects data this cycle" icon="calendar" id="calendar">
        <ol className="calrow">
          {calendar.map((c) => (
            <li key={c.month}>
              <b>{c.month}</b>
              {c.items.map((i) => (
                <span key={i}>{i}</span>
              ))}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid cols-2">
        <Card title="Templates and forms" sub={internal ? "Download, complete and attach to your submission" : "Available to contributing units"} icon="download" id="templates">
          <ul className="list">
            {TEMPLATES.map((t) => (
              <li key={t.name}>
                <span className="list__main">{t.name}</span>
                <span className="list__aside">
                  {internal ? (
                    <button type="button" className="btn btn--sm" onClick={() => downloadTemplate(t.file, t.cols)}>
                      <Icon name="download" size={16} /> CSV
                    </button>
                  ) : (
                    <Link href="/signin" className="btn btn--sm">
                      <Icon name="lock" size={16} /> Sign in
                    </Link>
                  )}
                </span>
                <span className="list__sub">{t.cols.length} fields</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Training materials and recorded orientations" icon="education" id="training">
          <ul className="list">
            {TRAINING.map(([n, t]) => (
              <li key={n}>
                <span className="list__main">{n}</span>
                <span className="list__aside">
                  <a className="btn btn--sm" href={`mailto:${office.email}?subject=${encodeURIComponent(`Access: ${n}`)}`}>
                    Request access
                  </a>
                </span>
                <span className="list__sub">{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Frequently asked questions" icon="help" id="faq">
          <div className="faq">
            {FAQ.map(([qq, a]) => (
              <details key={qq}>
                <summary>
                  {qq}
                  <Icon name="chevron-down" size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Card>
        <Card title="Good practices" sub="Published stories with replication guidance" icon="spark" id="practices">
          <ul className="list">
            {PUBLISHED_STORIES.filter((s) => s.themes.includes("Replicable Practices")).map((s) => (
              <li key={s.slug}>
                <Link href={internal ? `/admin/impact#${s.slug}` : `/impact/${s.slug}`} className="list__main">
                  {s.title}
                </Link>
                <span className="list__sub">{s.replication || s.outcomeLabel}</span>
              </li>
            ))}
                    </ul>
        </Card>
      </div>

      <Card title="Policies and frameworks" sub="Approved for public access" icon="governance" id="policies">
        <ul className="policies">
          {POLICIES.map(([n, d]) => (
            <li key={n}>
              <span className="policies__icon">
                <Icon name="reports" size={16} />
              </span>
              <span>
                <b>{n}</b>
                <span>{d}</span>
              </span>
              <a className="btn btn--sm" href={`mailto:${office.email}?subject=${encodeURIComponent(`Copy requested: ${n}`)}`}>
                Request a copy
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
