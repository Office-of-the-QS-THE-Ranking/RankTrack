import "server-only";

/*
 * What the assistant can look up live, built for one person: only the lookups their permissions allow, each reaching only
 * the units they may see. Nothing here writes. A model is offered only the descriptions, to choose from (planLookups). The
 * server reads what it chose and passes the results as sources to a model that doesn't share what it's sent (chat.ts), since
 * they're internal. Names of people, emails and form answers stay out, and text someone typed goes through cleanText.
 * A demo deployment's evidence and units include its presentation data, as its pages do, so each result says so.
 */
import { jsonSchema, tool, type FlexibleSchema, type ToolSet } from "ai";
import { DEMO_ON } from "@/lib/demo";
import { gapMatrix, ownTrend } from "@/lib/analytics/gap";
import { readActivities, readBenchmarks, readEditionFacts, readSnapshots } from "@/lib/analytics/server/db";
import { rankingActions, scorecardDesk } from "@/lib/analytics/server/desk";
import { catalogs, reportFor } from "@/lib/analytics/server/load";
import { ACTIVITY_KINDS, type PeerBand } from "@/lib/analytics/types";
import { buildUnitLeaderboard } from "@/lib/governance/unit-leaderboard";
import { formsDesk } from "@/lib/governance/server/forms";
import { hub } from "@/lib/governance/server/hub";
import { canWith } from "@/lib/governance/rbac";
import type { Viewer } from "@/lib/governance/viewer";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { cleanText, compareEditions, dataToolsFor, editionDetail, editionTotals, findOne, investigate, investigateIndicator, leaders, tally, take, type DataTool } from "../hub-data";

/** The tool a model calls when a question needs no Hub data. Its result only tells the model to carry on. */
export const ANSWER_DIRECTLY = "answer_directly";

/** One lookup's result, as a source. `found` is false when it has nothing to show, such as a refusal: nothing to link to. */
export interface Looked {
  title: string;
  href: string;
  content: string;
  found: boolean;
}

interface Reader {
  description: string;
  inputSchema: FlexibleSchema<never>;
  run: (input: unknown) => Promise<Looked>;
}

const KIND_OF = { academic: "Faculty or college", offices: "Office", research: "Research centre" } as const;
const CATEGORIES = Object.keys(KIND_OF) as (keyof typeof KIND_OF)[];

const params = <T,>(properties: Record<string, unknown>, required: string[] = []) => jsonSchema<T>({ type: "object", properties, required, additionalProperties: false });
const text = (description: string) => ({ type: "string", description });

/** What this person may look up, or null when that's nothing: `tools` to choose from, and `read` to read one chosen. */
export async function dataToolsForViewer(viewer: Viewer): Promise<{ tools: ToolSet; read: (name: string, input: unknown) => Promise<Looked | null> } | null> {
  const names = dataToolsFor(viewer.grants);
  if (!names.length) return null;

  const h = await hub();
  const office = viewer.workspaces.includes("office");
  const home = office ? "/admin" : "/portal";
  const unitName = (id: string) => (id === "" ? "University" : (h.state.units.find((u) => u.id === id)?.name ?? id));
  const seesUnit = (id: string) => canWith(viewer.grants, "evidence", "view", { unitId: id });

  const editions = (await catalogs()).filter((c) => c.edition.status !== "Archived" && h.isActive(c.edition.ranking));
  const editionHelp = `One of: ${editions.map((c) => `${c.edition.id} (${c.edition.status})`).join(", ")}.`;
  const edition = (query: string) => {
    const hit = findOne(editions, query, (c) => [c.edition.id, c.edition.label, c.edition.ranking]);
    if ("found" in hit) return hit.found;
    // A ranking named without a year means the edition it's collecting for now.
    const rankings = new Set(hit.options.map((c) => c.edition.ranking));
    if (rankings.size !== 1) return null;
    return [...hit.options].sort((a, b) => Number(b.edition.status === "Active") - Number(a.edition.status === "Active") || b.edition.year - a.edition.year)[0] ?? null;
  };
  const noEdition = (query: string) => ({ notFound: `No edition called "${cleanText(query, 60)}". ${editionHelp}` });
  const units = h.units.filter((u) => u.status === "Active");
  const unit = (query: string) => findOne(units, query, (u) => [u.slug, u.name, u.code]);

  /** One lookup. A failure is said as its result, never thrown at the chat. */
  const define = <I,>(name: DataTool, description: string, schema: ReturnType<typeof params<I>>, title: (input: I) => string, href: string | ((input: I) => string), read: (input: I) => Promise<object>): Reader => ({
    description,
    inputSchema: schema as FlexibleSchema<never>,
    run: async (raw) => {
      const input = (raw ?? {}) as I;
      const named = { title: title(input), href: typeof href === "string" ? href : href(input) };
      try {
        const data = await read(input);
        const found = !("notFound" in data || "denied" in data);
        return { ...named, found, content: JSON.stringify({ ...(DEMO_ON && { sample: "This deployment holds sample presentation data. Say these figures are samples, not real results." }), ...data }) };
      } catch (e) {
        console.error(`Assistant lookup ${name}: ${e instanceof Error ? e.message : e}`);
        return { ...named, found: false, content: JSON.stringify({ failed: "This couldn't be read just now. Say so, and don't state these figures from memory." }) };
      }
    },
  });

  const all: Record<DataTool, () => Reader> = {
    hub_overview: () =>
      define<Record<string, never>>(
        "hub_overview",
        "Every tracked ranking edition with its status, deadline, secured and claimed points, readiness and top fixes. Start here for broad questions about how UST is doing.",
        params({}),
        () => "Rankings scorecard",
        "/admin/rankings",
        async () => {
          const rows = await Promise.all(
            editions.map(async (c) => {
              const r = await reportFor(c.edition.id);
              return r && { ...editionTotals(c, r.report), topFixes: r.report.fixes.slice(0, 3).map((f) => ({ code: f.code, what: cleanText(f.title, 120), gain: Math.round(f.gain * 100) / 100 })) };
            }),
          );
          return { note: "Secured counts validated data only; claimed adds what is still under review. These are the Hub's own estimates, not published results.", editions: rows.filter(Boolean) };
        },
      ),

    ranking_detail: () =>
      define<{ edition: string; group?: string; state?: string }>(
        "ranking_detail",
        "One edition's groups and its indicators, most points at stake first, each with its value, state, points and failing checks.",
        params({ edition: text(editionHelp), group: text("Only this group code."), state: text("Only this state: Validated, For review, Needs revision, Not started or Not applicable.") }, ["edition"]),
        (i) => `${edition(i.edition)?.edition.label ?? "Ranking"}: indicators`,
        (i) => `/admin/rankings/${edition(i.edition)?.edition.ranking ?? ""}`,
        async (i) => {
          const c = edition(i.edition);
          if (!c) return noEdition(i.edition);
          const r = await reportFor(c.edition.id);
          return r ? editionDetail(c, r.report, i) : noEdition(i.edition);
        },
      ),

    investigate_gaps: () =>
      define<{ edition: string; indicator?: string }>(
        "investigate_gaps",
        "Why an edition, or one indicator, stands where it does: failing checks and what they hold back, weakest groups, fixes worth most, data problems, who hasn't supplied what, change since the last snapshot, and what the Hub can't tell. Use for why, cause, what went wrong and what to fix.",
        params({ edition: text(editionHelp), indicator: text("An indicator code, to look at just that one.") }, ["edition"]),
        (i) => `${edition(i.edition)?.edition.label ?? "Ranking"}: what holds it back`,
        (i) => `/admin/rankings/${edition(i.edition)?.edition.ranking ?? ""}`,
        async (i) => {
          const c = edition(i.edition);
          if (!c) return noEdition(i.edition);
          const r = await reportFor(c.edition.id);
          if (!r) return noEdition(i.edition);
          if (i.indicator) {
            const ind = findOne(c.indicators, i.indicator, (x) => [x.code, ...(x.ref ? [x.ref] : [])]);
            const report = "found" in ind ? r.report.indicators[ind.found.code] : undefined;
            if (!("found" in ind) || !report) return { notFound: `${c.edition.label} has no indicator "${cleanText(i.indicator, 40)}".` };
            return investigateIndicator(ind.found, report, unitName);
          }
          const [snapshots, bench] = await Promise.all([readSnapshots([c.edition.id]), readBenchmarks([c.edition.ranking])]);
          return investigate(c, r.report, {
            snapshots,
            hasPeerFigures: bench.benchmarks.some((b) => b.peer !== ""),
            hasResults: bench.benchmarks.some((b) => b.peer === ""),
            unitName,
          });
        },
      ),

    compare_editions: () =>
      define<{ a: string; b: string }>(
        "compare_editions",
        "Two editions side by side, such as this year against last: totals, groups and the indicators that moved, with the differences worked out.",
        params({ a: text(`The earlier edition. ${editionHelp}`), b: text("The later edition, from the same list.") }, ["a", "b"]),
        (i) => `${edition(i.a)?.edition.label ?? i.a} and ${edition(i.b)?.edition.label ?? i.b}`,
        "/admin/rankings",
        async (i) => {
          const [a, b] = [edition(i.a), edition(i.b)];
          if (!a) return noEdition(i.a);
          if (!b) return noEdition(i.b);
          const [ra, rb] = await Promise.all([reportFor(a.edition.id), reportFor(b.edition.id)]);
          if (!ra || !rb) return noEdition(i.a);
          return compareEditions({ catalog: a, report: ra.report }, { catalog: b, report: rb.report });
        },
      ),

    activity_summary: () =>
      define<{ by?: "kind" | "year" | "unit" | "sdg"; kind?: string; year?: string; unit?: string; sdg?: number }>(
        "activity_summary",
        `The activity register counted by kind, academic year, unit or SDG, with beneficiaries and examples. When the question names a kind, always set kind. Kinds: ${ACTIVITY_KINDS.join(", ")}.`,
        params({ by: { type: "string", enum: ["kind", "year", "unit", "sdg"], description: "How to group the counts. Defaults to kind." }, kind: text("Only this kind."), year: text('Only this academic year, like "2024-2025".'), unit: text("Only this unit."), sdg: { type: "number", description: "Only this SDG number." } }),
        () => "Activity register",
        "/admin/rankings/activities",
        async (i) => {
          let rows = await readActivities(i.year ? [i.year] : undefined);
          if (i.unit) {
            const u = unit(i.unit);
            if (!("found" in u)) return { notFound: `No single unit matches "${cleanText(i.unit, 60)}". Could be: ${u.options.slice(0, 8).map((x) => x.name).join("; ") || "none"}.` };
            rows = rows.filter((a) => a.unit === u.found.slug);
          }
          if (i.kind) rows = rows.filter((a) => a.kind.toLowerCase() === i.kind!.toLowerCase());
          if (i.sdg !== undefined) rows = rows.filter((a) => a.sdgs.includes(i.sdg!));
          const keyOf = (a: (typeof rows)[number]) => (i.by === "year" ? a.year : i.by === "unit" ? (a.unit ? unitName(a.unit) : cleanText(a.unitLabel, 60) || "No unit") : i.by === "sdg" ? (a.sdgs.length ? a.sdgs.map((s) => `SDG ${s}`) : ["No SDG"]) : a.kind);
          return {
            counted: { kind: i.kind ?? "every kind, not only one", year: i.year ?? "every year", ...(i.unit && { unit: cleanText(i.unit, 60) }), ...(i.sdg !== undefined && { sdg: i.sdg }) },
            activities: rows.length,
            byKind: Object.fromEntries(tally(rows, (a) => a.kind).map((g) => [g.key, g.count])),
            withTerminalReport: rows.filter((a) => a.reported).length,
            beneficiaries: rows.reduce((n, a) => n + (a.beneficiaries ?? 0), 0),
            groups: take(tally(rows, keyOf, (a) => a.beneficiaries ?? 0).map((g) => ({ [i.by ?? "kind"]: g.key, activities: g.count, beneficiaries: g.total })), 30),
            examples: rows.slice(0, 6).map((a) => ({ title: cleanText(a.title, 120), kind: a.kind, year: a.year, ...(a.unit && { unit: unitName(a.unit) }) })),
          };
        },
      ),

    benchmarks: () =>
      define<{ ranking?: string }>(
        "benchmarks",
        "Published results and peer comparison: UST's recorded ranks and figures by year, and the gap to peer groups. Use for actual ranks, results over time and competitors.",
        params({ ranking: text(`A ranking slug, or leave it out for all. Rankings: ${[...new Set(editions.map((c) => c.edition.ranking))].join(", ")}.`) }),
        (i) => (i.ranking ? `Benchmarks: ${cleanText(i.ranking, 40)}` : "Benchmarks"),
        "/admin/rankings/benchmarks",
        async (i) => {
          const { benchmarks, peers } = await readBenchmarks(i.ranking ? [i.ranking] : undefined);
          const bands = new Map<string, PeerBand>(peers.map((p) => [p.id, p.band]));
          const rankings = [...new Set(benchmarks.map((b) => b.ranking))];
          return {
            rankings: rankings.map((slug) => {
              const metrics = [...new Set(benchmarks.filter((b) => b.ranking === slug && b.peer === "").map((b) => b.metric))];
              return {
                ranking: slug,
                results: take(metrics.map((metric) => ({ metric, years: ownTrend(slug, benchmarks, metric) })), 25),
                gaps: take(gapMatrix(slug, benchmarks, bands).filter((g) => Object.keys(g.medians).length).map((g) => ({ metric: g.label, year: g.year, own: g.own ?? g.ownLabel, medians: g.medians, gapPercent: g.gaps })), 25),
              };
            }),
            ...(!benchmarks.length && { limit: "No results or peer figures are recorded for this yet." }),
            ...(benchmarks.length > 0 && !peers.length && { limit: "No peer institutions are recorded, so only UST's own results can be shown." }),
          };
        },
      ),

    data_requests: () =>
      define<Record<string, never>>(
        "data_requests",
        "Data requests sent to units: what each unit was asked for, sent, had validated or returned, what is overdue, reminders and escalations.",
        params({}),
        () => "Data requests",
        office ? "/admin/rankings/data-requests" : "/portal/requests",
        async () => {
          const { campaigns } = await scorecardDesk(viewer);
          const seesAll = canWith(viewer.grants, "rankings", "view");
          const rows = campaigns.map((c) => ({
            title: cleanText(c.title, 120),
            edition: c.editionLabel,
            due: c.due,
            status: c.status,
            units: take(
              c.units
                .filter((u) => seesAll || canWith(viewer.grants, "data", "view", { unitId: u.unit }))
                .sort((a, b) => b.overdue - a.overdue || b.requested - b.submitted - (a.requested - a.submitted))
                .map((u) => ({ unit: u.name, requested: u.requested, sent: u.submitted, validated: u.validated, returned: u.revisions, overdue: u.overdue, sentOnTime: u.onTime, reminders: u.reminders, escalated: u.escalated })),
              30,
            ),
          }));
          return { requests: rows.filter((r) => r.units.rows.length), ...(!rows.length && { limit: "No data requests have been sent." }) };
        },
      ),

    action_items: () =>
      define<{ ranking?: string; unit?: string; status?: string }>(
        "action_items",
        "The action plan: what is to be done, by which unit, by when, with its status and progress.",
        params({ ranking: text("Only this ranking slug."), unit: text("Only this unit."), status: text("Only this status.") }),
        () => "Action plan",
        office ? "/admin/workspace/build-a-report" : "/portal",
        async (i) => {
          const seesAll = canWith(viewer.grants, "rankings", "view");
          // A row with no edition is presentation data standing in for an empty plan, never a real action item.
          let rows = (await rankingActions()).filter((a) => a.edition && (seesAll || (a.owner ? seesUnit(a.owner) : false)));
          if (i.ranking) rows = rows.filter((a) => a.ranking === i.ranking);
          if (i.status) rows = rows.filter((a) => a.status.toLowerCase() === i.status!.toLowerCase());
          if (i.unit) {
            const u = unit(i.unit);
            if (!("found" in u)) return { notFound: `No single unit matches "${cleanText(i.unit, 60)}".` };
            rows = rows.filter((a) => a.owner === u.found.slug);
          }
          return {
            items: take(rows.map((a) => ({ action: cleanText(a.action, 160), ranking: a.ranking, ...(a.code && { indicator: a.code }), ...(a.ownerName && { unit: a.ownerName }), ...(a.due && { due: a.due }), status: a.status, progress: a.progress })), 30),
            ...(!rows.length && { limit: "No action items are recorded for this." }),
          };
        },
      ),

    unit_standings: () =>
      define<{ category: keyof typeof KIND_OF }>(
        "unit_standings",
        `Units ranked by validated submissions, the Hub's leaderboard. Use for who is leading or behind, or which unit submitted most. Categories: academic is ${UNIT_CATEGORY_LABELS.academic}, offices is ${UNIT_CATEGORY_LABELS.offices}, research is ${UNIT_CATEGORY_LABELS.research}.`,
        params({ category: { type: "string", enum: CATEGORIES, description: "Which units to rank: offices for a university office, academic for a college or faculty, research for a research center." } }, ["category"]),
        (i) => `Unit standings: ${UNIT_CATEGORY_LABELS[i.category] ?? UNIT_CATEGORY_LABELS.academic}`,
        office ? "/admin/unit-submissions?tab=units" : "/portal",
        async (i) => {
          const category = CATEGORIES.includes(i.category) ? i.category : "academic";
          const facts = await readEditionFacts(editions.map((c) => c.edition.id));
          const sentData = new Map(tally(facts.values.filter((v) => v.status !== "Draft" && v.unit !== ""), (v) => v.unit).map((g) => [g.key, g.count]));
          const sentEvidence = new Map(tally(h.evidence, (e) => e.unitSlug).map((g) => [g.key, g.count]));
          const rows = buildUnitLeaderboard(units.filter((u) => u.kind === KIND_OF[category])).map((s) => ({
            ...(s.rank !== null && { rank: s.rank }),
            unit: s.unit.name,
            evidenceSent: sentEvidence.get(s.unit.slug) ?? 0,
            validated: s.unit.validated,
            returned: s.unit.revisions,
            assigned: s.unit.assigned,
            completed: s.unit.completed,
            completionPercent: s.completion,
            rankingsServed: s.unit.rankingsServed,
            analyticsItemsSent: sentData.get(s.unit.slug) ?? 0,
          }));
          const active = rows.filter((r) => r.evidenceSent || r.analyticsItemsSent || r.assigned);
          return {
            ...leaders(rows),
            units: rows.length,
            unitsWithAnyActivity: active.length,
            ...(!rows.some((r) => r.rank) && { limit: "No unit in this category has a validated submission yet, so there is no leader: the leaderboard ranks validated submissions only. Report what was sent instead, if anything." }),
            standings: take(active.length ? active : rows, 25),
            order: "Rank goes by validated submissions, then rankings served, then completion. analyticsItemsSent counts indicator answers sent through data collection, which the leaderboard doesn't rank.",
          };
        },
      ),

    unit_detail: () =>
      define<{ units: string[] }>(
        "unit_detail",
        "One unit's submissions by status, ranking and evidence level, its indicator answers and its leaderboard place. Pass several units to compare them.",
        params({ units: { type: "array", items: { type: "string" }, maxItems: 5, description: "Unit names or codes, up to five." } }, ["units"]),
        (i) => `Unit detail: ${i.units.slice(0, 3).map((u) => cleanText(u, 40)).join(", ")}`,
        office ? "/admin/unit-submissions?tab=units" : "/portal",
        async (i) => {
          const facts = await readEditionFacts(editions.map((c) => c.edition.id));
          const labelOf = new Map(editions.map((c) => [c.edition.id, c.edition.label]));
          const rows = i.units.slice(0, 5).map((query) => {
            const u = unit(query);
            if (!("found" in u)) return { asked: cleanText(query, 60), notFound: `Could be: ${u.options.slice(0, 8).map((x) => x.name).join("; ") || "no unit by that name"}.` };
            const found = u.found;
            if (!seesUnit(found.slug)) return { unit: found.name, denied: "They may not see this unit's submissions. Tell them so, and give nothing about it beyond the standings." };
            const evidence = h.evidence.filter((e) => e.unitSlug === found.slug && canWith(viewer.grants, "evidence", "view", { unitId: (e as { programId?: string }).programId ?? e.unitSlug }));
            const seesData = canWith(viewer.grants, "data", "view", { unitId: found.slug });
            const values = seesData ? facts.values.filter((v) => v.unit === found.slug) : [];
            const place = canWith(viewer.grants, "units", "view") ? buildUnitLeaderboard(units.filter((x) => x.kind === found.kind)).find((s) => s.unit.slug === found.slug) : undefined;
            return {
              unit: found.name,
              kind: found.kind,
              ...(place && { rank: place.rank ?? "none yet, nothing validated", completionPercent: place.completion }),
              evidence: {
                total: evidence.length,
                byStatus: Object.fromEntries(tally(evidence, (e) => e.status).map((g) => [g.key, g.count])),
                byRanking: Object.fromEntries(tally(evidence, (e) => (e.mappedTo.length ? e.mappedTo.map((m) => m.split(" · ")[0]!) : ["Not mapped"])).map((g) => [g.key, g.count])),
                byEvidenceLevel: Object.fromEntries(tally(evidence, (e) => `Level ${e.level}`).map((g) => [g.key, g.count])),
              },
              indicatorAnswers: seesData ? tally(values, (v) => labelOf.get(v.edition) ?? v.edition).map((g) => ({ edition: g.key, answers: g.count, byStatus: Object.fromEntries(tally(values.filter((v) => labelOf.get(v.edition) === g.key), (v) => v.status).map((s) => [s.key, s.count])) })) : "Not visible to this person.",
            };
          });
          return { units: rows };
        },
      ),

    search_evidence: () =>
      define<{ text?: string; unit?: string; status?: string; ranking?: string; sdg?: number }>(
        "search_evidence",
        "Find submissions by words, unit, status, ranking or SDG. Returns each one's title, status, stage, mapping and a short summary, which the unit wrote: say so when you use it, and that only Validated ones have passed review.",
        params({ text: text("Words to find in the title, summary or result."), unit: text("Only this unit."), status: text("For review, Validated, Needs revision or Not applicable."), ranking: text("Only those mapped to this ranking, like THE or QS."), sdg: { type: "number", description: "Only this SDG number." } }),
        () => "Evidence submissions",
        office ? "/admin/unit-submissions" : "/portal/submit",
        async (i) => {
          let rows = h.evidence.filter((e) => canWith(viewer.grants, "evidence", "view", { unitId: (e as { programId?: string }).programId ?? e.unitSlug }));
          if (i.unit) {
            const u = unit(i.unit);
            if (!("found" in u)) return { notFound: `No single unit matches "${cleanText(i.unit, 60)}". Could be: ${u.options.slice(0, 8).map((x) => x.name).join("; ") || "none"}.` };
            // Saying a unit has nothing would be false: they just can't see it.
            if (!seesUnit(u.found.slug)) return { denied: `They may not see the submissions of ${u.found.name}. Tell them so: this doesn't mean it has none.` };
            rows = rows.filter((e) => e.unitSlug === u.found.slug);
          }
          if (i.status) rows = rows.filter((e) => e.status.toLowerCase() === i.status!.toLowerCase());
          if (i.ranking) rows = rows.filter((e) => e.mappedTo.some((m) => m.toLowerCase().includes(i.ranking!.toLowerCase())));
          if (i.sdg !== undefined) rows = rows.filter((e) => e.sdgs.includes(i.sdg!));
          if (i.text) {
            const words = i.text.toLowerCase().split(/\s+/).filter(Boolean);
            rows = rows.filter((e) => words.every((w) => `${e.title} ${e.summary} ${e.result}`.toLowerCase().includes(w)));
          }
          return {
            ...(!canWith(viewer.grants, "evidence", "view", { unitId: "__any__" }) && { scope: "Only the units this person may see are searched." }),
            found: rows.length,
            byStatus: Object.fromEntries(tally(rows, (e) => e.status).map((g) => [g.key, g.count])),
            submissions: take(rows.map((e) => ({ title: cleanText(e.title, 140), unit: e.unit, type: e.type, alsoTypes: e.alsoTypes, period: e.period, submitted: e.submitted, status: e.status, stage: e.stage, evidenceLevel: e.level, mappedTo: e.mappedTo, sdgs: e.sdgs, summary: cleanText(e.summary, 240), result: cleanText(e.result, 160) })), 12),
          };
        },
      ),

    forms_summary: () =>
      define<Record<string, never>>(
        "forms_summary",
        "Digital forms this person runs or may read, with status, deadline and how many responses each has. Counts only: answers aren't available here.",
        params({}),
        () => "Digital forms",
        `${home}/workspace`,
        async () => {
          const desk = await formsDesk(viewer, office ? "office" : "unit");
          return {
            forms: take(desk.forms.map((f) => ({ code: f.code, title: cleanText(f.title, 120), kind: f.kind, status: f.status, ...(f.closesOn && { closes: f.closesOn }), heldBy: f.holder.name, ...(f.responses && { responses: f.responses.total, thisWeek: f.responses.week, drafts: f.responses.drafts }) })), 30),
            limit: "What people answered isn't available to the assistant, only counts.",
          };
        },
      ),

    publications_status: () =>
      define<{ state?: string }>(
        "publications_status",
        "Stories and innovations by state (Published, In review, Draft), including those not yet public.",
        params({ state: text("Only this state.") }),
        () => "Publications",
        office ? "/admin/publications/stories" : "/portal/publications",
        async (i) => {
          const own = (label: string) => label === viewer.portal.unitName || label.startsWith(`${viewer.portal.unitName} · `);
          let rows = office ? h.stories : h.stories.filter((s) => s.state === "Published" || own(s.unit));
          const byState = Object.fromEntries(tally(rows, (s) => s.state).map((g) => [g.key, g.count]));
          if (i.state) rows = rows.filter((s) => s.state.toLowerCase() === i.state!.toLowerCase());
          return { byState, stories: take(rows.map((s) => ({ title: cleanText(s.title, 140), unit: s.unit, kind: s.kind, state: s.state, year: s.year, sdgs: s.sdgs })), 25) };
        },
      ),
  };

  const readers = new Map(names.map((n) => [n as string, all[n]()]));
  const tools = Object.fromEntries([...readers].map(([n, r]) => [n, tool({ description: r.description, inputSchema: r.inputSchema })])) as ToolSet;
  tools[ANSWER_DIRECTLY] = tool({ description: "Call this when the question needs none of the Hub's live data: small talk, general knowledge or writing help.", inputSchema: params<Record<string, never>>({}) });
  return { tools, read: async (name, input) => (await readers.get(name)?.run(input)) ?? null };
}
