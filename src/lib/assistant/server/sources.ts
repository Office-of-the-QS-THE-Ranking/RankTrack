import "server-only";

/*
 * What the assistant may know, and nothing else: the Hub's own content, field by field. Each document names who may read
 * it. Fields are listed one by one rather than spread, so a new column on a ranking (strengths, gaps, an owner's name)
 * stays out until someone decides otherwise. Reading the same gates the public site uses (siteData) means a story taken
 * down or a section switched off disappears from the assistant too. Demo data, drafts, evidence, form answers and unit
 * files aren't here. Add them in a later step, each with the permission check it needs.
 */
import { FAQ as PORTAL_FAQ, POLICIES as PORTAL_POLICIES } from "@/components/knowledge/content";
import { EXAMPLES, FAQ, GOVERNANCE, POLICIES, STANDARDS } from "@/components/site/pages/site-copy";
import { DEMO_ON } from "@/lib/demo";
import { siteData } from "@/lib/governance/server/site";
import { serverViews } from "@/lib/governance/server/views";
import { plainText } from "@/lib/rich-text";
import type { Level } from "../rules";

export interface SourceDoc {
  id: string;
  title: string;
  href: string;
  text: string;
  level: Level;
  /** What a person must hold to read it; absent for what the public site already shows. */
  module?: "knowledge";
  action?: "view";
  unitId?: string;
}

/** Marks a link the reader's own workspace decides: /admin/knowledge or /portal/knowledge. */
export const WORKSPACE = "workspace:";

const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n");

export async function sourceDocs(): Promise<SourceDoc[]> {
  // Presentation data isn't Hub content, whatever a demo deployment shows on its pages.
  const site = await siteData();
  const { office } = await serverViews();
  const docs: SourceDoc[] = [];
  const pub = (id: string, title: string, href: string, text: string) => {
    if (text.trim()) docs.push({ id, title, href, text, level: "public" });
  };

  for (const r of site.rankings) {
    pub(
      `ranking:${r.slug}`,
      r.name,
      `/rankings/${r.slug}`,
      lines(
        `${r.name} (${r.short}).`,
        r.measures && `What it measures: ${r.measures}.`,
        r.reportingPeriod && `Reporting period: ${r.reportingPeriod}.`,
        r.deadline && `Submission deadline: ${r.deadline}.`,
        r.methodologyChanges && `Methodology changes: ${r.methodologyChanges}`,
        r.publicNote,
        ...r.indicators.map((i) => `Indicator: ${i.name}${i.weight ? ` (weight ${i.weight})` : ""}${i.definition ? `. ${i.definition}` : ""}`),
      ),
    );
  }

  // What the abbreviations stand for: the rankings' pages say it, but only in their design, so nothing else in here does.
  pub("rankings:bodies", "The ranking bodies", "/rankings", site.bodies.map((b) => `${b.short} is ${b.name}. Its rankings the Office tracks: ${b.rankings.map((r) => r.name).join(", ")}.`).join("\n"));

  if (!DEMO_ON) {
    for (const s of site.stories) {
      const body = s.post
        ? lines(s.post.subtitle, plainText(s.post.body))
        : lines(s.challenge && `Challenge: ${s.challenge}`, s.response && `Response: ${s.response}`, s.implementation && `Implementation: ${s.implementation}`, s.beneficiaries && `Beneficiaries: ${s.beneficiaries}`, s.outcome && `Outcome: ${s.outcome}`, s.lessons && `Lessons: ${s.lessons}`);
      pub(`story:${s.slug}`, s.title, `/publications/stories/${s.slug}`, lines(s.unit && `From ${s.unit}.`, body));
    }
    for (const d of [...site.articles, ...site.reports]) {
      const base = d.kind === "article" ? "research" : "reports";
      pub(`document:${d.id}`, d.title, `/publications/${base}/${d.slug}`, lines(d.authors.length ? `By ${d.authors.join(", ")}.` : "", d.venue && `Published in ${d.venue}.`, d.issued && `Issued ${d.issued}.`, d.abstract, d.keywords.length ? `Keywords: ${d.keywords.join(", ")}.` : ""));
    }
  }

  if (site.features.knowledge) {
    for (const d of site.dictionary) pub(`term:${d.term}`, `Dictionary: ${d.term}`, "/knowledge#dictionary", lines(`${d.term}: ${d.definition}`, d.links.length ? `Used in: ${d.links.map((l) => `${l.indicator} (${l.ranking})`).join("; ")}.` : ""));
    pub("knowledge:standards", "Evidence standards", "/knowledge#standards", lines("Acceptable evidence:", ...STANDARDS.map((s) => `- ${s}.`), "", ...EXAMPLES.map(([good, bad]) => `Good evidence: ${good}. Not enough: ${bad}.`)));
    pub("knowledge:faq", "Common questions", "/knowledge#faq", FAQ.map(([q, a]) => `${q}\n${a}`).join("\n\n"));
    pub("knowledge:policies", "Policies", "/knowledge#policies", POLICIES.map(([t, d]) => `${t}: ${d}.`).join("\n"));
    const upcoming = site.calendar.filter((c) => c.due >= new Date().toISOString().slice(0, 10));
    pub("knowledge:calendar", "Ranking calendar", "/knowledge#calendar", upcoming.map((c) => `${c.lead}: ${c.label}, ${c.due}.`).join("\n"));
  }

  pub("about:office", `About ${office.name}`, "/about#mission", lines(office.summary, `It reports to ${office.reportsTo}.`, ...office.functions.map((f) => `Function: ${f}`)));
  pub("about:vision", "Vision and mission", "/about#vision", lines(`Vision: ${office.vision}`, `Mission: ${office.mission}`, ...office.objectives.map((o) => `Objective, ${o.title}: ${o.text}`)));
  pub("about:deliverables", "What the Office delivers", "/about#deliverables", office.deliverables.map((d) => `${d.title}: ${d.text}`).join("\n"));
  pub("about:team", "The Office's team", "/about#team", office.team.map((t) => `${t.role}: ${t.who}. ${t.focus}`).join("\n"));
  pub("about:governance", "How the Office is governed", "/about#governance", GOVERNANCE.map(([t, d]) => `${t}: ${d}`).join("\n"));
  pub("about:contact", "Contact the Office", "/about#contact", lines(office.name, office.location, office.landmark, office.street, office.city, `Phone: ${office.phone}`, `Email: ${office.email}`));

  // The portal's own Knowledge Center. Internal, so it waits for a model on a plan that doesn't share data.
  const inner = (id: string, title: string, text: string) => docs.push({ id, title, href: `${WORKSPACE}/knowledge`, text, level: "internal", module: "knowledge", action: "view" });
  inner("portal-knowledge:faq", "Knowledge Center: questions", PORTAL_FAQ.map(([q, a]) => `${q}\n${a}`).join("\n\n"));
  inner("portal-knowledge:policies", "Knowledge Center: policies", PORTAL_POLICIES.map(([t, d]) => `${t}: ${d}.`).join("\n"));

  return docs;
}

/* A document's id is what the question time check compares with: a short-lived copy, so a chat doesn't rebuild the site's data. */
const LIVE_MS = 60_000;
let live: { at: number; ids: Set<string> } | null = null;

export async function liveSourceIds() {
  if (live && Date.now() - live.at < LIVE_MS) return live.ids;
  const ids = new Set((await sourceDocs()).map((d) => d.id));
  live = { at: Date.now(), ids };
  return ids;
}
