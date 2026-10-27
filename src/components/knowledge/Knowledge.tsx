"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PUBLISHED_STORIES as STATIC_STORIES } from "@/lib/data";
import { useFeature, useHub, useRankings, useVariant } from "@/components/hub/HubProvider";
import { useViews } from "@/components/reference/ReferenceProvider";
import { QueueArt } from "@/components/contributions/QueueArt";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { SearchField } from "@/components/ui/search-field";
import { CHECKS, EXAMPLES, FAQ, POLICIES, TEMPLATES, TRAINING } from "./content";
import { CycleCalendar, NextDeadline, cycle } from "./Deadlines";
import { Dictionary } from "./Dictionary";
import { Evidence } from "./Evidence";
import { Methodologies } from "./Methodologies";
import { Resources } from "./Resources";

type Tab = "dictionary" | "rankings" | "evidence" | "resources" | "faq";

const TABS: { key: Tab; label: string }[] = [
  { key: "dictionary", label: "Dictionary" },
  { key: "rankings", label: "Methodologies" },
  { key: "evidence", label: "Evidence" },
  { key: "resources", label: "Resources" },
  { key: "faq", label: "FAQ" },
];

/** Where the older section anchors (#faq, #templates …) now live. */
const ANCHOR: Record<string, Tab> = {
  dictionary: "dictionary",
  methodologies: "rankings",
  standards: "evidence",
  templates: "resources",
  training: "resources",
  practices: "resources",
  policies: "resources",
  faq: "faq",
};

const EXAMPLE_TERMS = ["citations", "water", "employer", "beneficiaries"];

const has = (term: string, ...texts: string[]) => !term || texts.some((t) => t.toLowerCase().includes(term));

/**
 * The Knowledge and Methodology Center: the cycle's deadlines over five tabs, the indicator dictionary,
 * methodologies, evidence standards, resources and questions, all filtered by one search.
 */
export function Knowledge() {
  const { dictionary, evidenceLevels, families, office } = useViews();
  const hub = useHub();
  const inOffice = useVariant() === "office";
  const assistance = useFeature("assistance");
  const DICTIONARY = hub?.dictionary ?? dictionary;
  const RANKINGS = useRankings();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [tab, setTab] = useState<Tab>("dictionary");
  const [pick, setPick] = useState<string | null>(params.get("q"));
  const [anchor, setAnchor] = useState<string | null>(null);

  useEffect(() => {
    const next = params.get("q");
    if (next === null) return;
    setQ(next);
    setPick(next);
    setTab("dictionary");
  }, [params]);

  // A link to a section opens its tab and brings the section into view.
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const to = ANCHOR[id];
      if (!to) return;
      setTab(to);
      setAnchor(id);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  useEffect(() => {
    if (!anchor) return;
    document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    setAnchor(null);
  }, [anchor, tab]);

  const rankingHref = (slug: string) => (inOffice ? `/admin/rankings/${slug}#methodology` : `/rankings/${slug}#measures`);
  const storyHref = (slug: string) => (inOffice ? `/admin/publications/stories#${slug}` : `/publications/stories/${slug}`);
  const calendar = hub?.calendar;
  const { months, items: due, next, todayAt } = useMemo(() => cycle(calendar ?? [], families), [calendar, families]);

  const term = q.trim().toLowerCase();
  const terms = DICTIONARY.filter((d) => has(term, d.term, d.definition, ...d.links.map((l) => `${l.ranking} ${l.indicator}`)));
  const rankings = RANKINGS.filter((r) => has(term, r.short, r.name, r.measures, families[r.family]?.name ?? "", ...r.indicators.map((i) => i.name)));
  const checks = CHECKS.filter((c) => has(term, c.title, c.text));
  const examples = EXAMPLES.filter((e) => has(term, e.topic, e.good, e.bad));
  const steps = evidenceLevels.some((s) => has(term, s)) ? evidenceLevels : [];
  const templates = TEMPLATES.filter((t) => has(term, t.name, ...t.cols));
  const training = TRAINING.filter((t) => has(term, t.title, t.kind));
  const policies = POLICIES.filter(([n, d]) => has(term, n, d));
  const stories = (hub ? hub.stories.filter((s) => s.state === "Published") : STATIC_STORIES).filter((s) => s.themes.includes("Replicable Practices"));
  const practices = stories.filter((s) => has(term, s.title, s.replication, s.outcomeLabel));
  const faq = FAQ.filter(([qq, a]) => has(term, qq, a));

  const found: Record<Tab, number> = {
    dictionary: terms.length,
    rankings: rankings.length,
    evidence: checks.length + examples.length + (term && steps.length ? 1 : 0),
    resources: templates.length + training.length + policies.length + practices.length,
    faq: faq.length,
  };
  const selected = terms.find((t) => t.term.toLowerCase() === (pick ?? "").toLowerCase()) ?? terms.find((t) => t.term.toLowerCase() === term) ?? terms[0];
  const index = TABS.findIndex((t) => t.key === tab);

  return (
    <div className="kc">
      <div className="kc-bento">
        <NextDeadline next={next} after={next ? due.slice(due.indexOf(next) + 1).slice(0, 2) : []} />
        <CycleCalendar months={months} next={next} todayAt={todayAt} />
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: term && found[t.key] ? found[t.key] : undefined }))}
        value={tab}
        onChange={setTab}
        label="Knowledge Center"
        idBase="kc"
        search={
          <SearchField
            value={q}
            onChange={(v) => {
              setQ(v);
              setPick(null);
            }}
            placeholder="Search the Knowledge Center"
            label="Search the Knowledge Center"
            examples={tab === "dictionary" ? EXAMPLE_TERMS : undefined}
            shortcuts
          />
        }
      />

      <TabPanel idBase="kc" index={index} className="kc-panel">
        <div key={tab} className="kc-view">
          {found[tab] === 0 ? (
            <NoMatch query={term ? q.trim() : ""} found={found} onOpen={setTab} />
          ) : tab === "dictionary" ? (
            selected && <Dictionary terms={terms} selected={selected} onSelect={setPick} rankings={RANKINGS} families={families} rankingHref={rankingHref} />
          ) : tab === "rankings" ? (
            <Methodologies rankings={rankings} families={families} href={rankingHref} />
          ) : tab === "evidence" ? (
            <Evidence checks={checks} examples={examples} steps={steps} />
          ) : tab === "resources" ? (
            <Resources templates={templates} training={training} policies={policies} practices={term && !practices.length ? null : practices} email={office.email} storyHref={storyHref} />
          ) : (
            <div className="kc-faq-grid">
              <Tile id="faq" title="Questions" className="kc-faq-tile">
                <div className="kc-faq">
                  {faq.map(([qq, a]) => (
                    <details key={qq}>
                      <summary>
                        <span>{qq}</span>
                        <Icon name="plus" size={16} strokeWidth={2.2} />
                      </summary>
                      <p>{a}</p>
                    </details>
                  ))}
                </div>
              </Tile>
              {!inOffice && (
                <Tile id="kc-ask-h" className="kc-ask">
                  <span className="kc-ask__art" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <h2 id="kc-ask-h" className="kc-ask__title">
                    Still stuck?
                  </h2>
                  {assistance ? (
                    <Link href="/portal/assistance" className="btn btn--primary">
                      Ask the Office
                    </Link>
                  ) : (
                    <a href={`mailto:${office.email}`} className="btn btn--primary">
                      <Icon name="mail" size={16} /> Email the Office
                    </a>
                  )}
                </Tile>
              )}
            </div>
          )}
        </div>
      </TabPanel>
    </div>
  );
}

/** No results here: the search illustration, and the tabs that do hold matches. */
function NoMatch({ query, found, onOpen }: { query: string; found: Record<Tab, number>; onOpen: (t: Tab) => void }) {
  const elsewhere = TABS.filter((t) => found[t.key] > 0);
  return (
    <Tile id="kc-none-h" className="kc-none">
      <div className="kc-none__body">
        <QueueArt kind={query ? "search" : "start"} />
        <h2 id="kc-none-h" className="kc-none__title">
          {query ? "No matches" : "Nothing here yet"}
        </h2>
        {query && <p className="kc-none__sub">Nothing here matches “{query}”.</p>}
        {query && elsewhere.length > 0 && (
          <div className="kc-none__also">
            {elsewhere.map((t) => (
              <button key={t.key} type="button" className="kc-chip" onClick={() => onOpen(t.key)}>
                {t.label}
                <span className="count">{found[t.key]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
}
