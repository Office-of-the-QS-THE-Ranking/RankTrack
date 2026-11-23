/*
 * The portal demo's governance state: the Hub's own seed (lib/governance/seed.ts) built from the demo's fictional
 * directory and sample rankings, plus fictional people and evidence in every state the screens handle (draft,
 * submitted, under review, returned, validated, included in the final submission, result achieved) and a unit with
 * nothing yet, for the empty states. Every name is invented; every address ends in .invalid, a domain that can never
 * exist. Nothing here came from the production database.
 */
import { buildSeed } from "@/lib/governance/seed";
import { ROLE } from "@/lib/governance/catalog";
import type { Account, Assignment, EvidenceRecord, GovernanceState, Notice, Position, RoleId } from "@/lib/governance/types";
import type { Reference } from "@/lib/reference";
import { demoDay, demoTime } from "./clock";

/** The people visitors can be, one per role the demo shows. */
export const DEMO_PEOPLE = {
  coordinator: "demo-coordinator",
  administrator: "demo-administrator",
  staff: "demo-staff",
  director: "demo-director",
} as const;

const ALL = { units: "all", rankingBodies: "all", years: "all", datasets: "all" } as const;
const unitScope = (unit: string) => ({ units: [unit], rankingBodies: "all" as const, years: "all" as const, datasets: "all" as const });

function person(id: string, name: string, title: string, unitId: string, roleId: RoleId, opts: { position?: Position; scope?: Assignment["scope"] } = {}): Account {
  const email = `${name.toLowerCase().split(" ").map((p, i, a) => (i < a.length - 1 ? p[0] : p)).join(".")}@demo.invalid`;
  return {
    id,
    name,
    email,
    title,
    unitId,
    status: "Active",
    assignments: [
      {
        id: `as-${id}`,
        roleId,
        ...(opts.position && { position: opts.position }),
        scope: opts.scope ?? (roleId === ROLE.superAdmin ? { ...ALL } : unitScope(unitId)),
        grantedBy: "system",
        grantedAt: demoTime(-200),
      },
    ],
    createdAt: demoTime(-200),
    lastLogin: demoTime(-1),
    firstLogin: demoTime(-199),
    identity: "Google Workspace",
    mfa: { enrolled: false },
    transfers: [],
    // The demo never signs anyone out for idling: there is no session to end.
    sessionPrefs: { stay: true },
  };
}

const ACCOUNTS: Account[] = [
  person(DEMO_PEOPLE.coordinator, "Marisol Dizon", "Research Coordinator", "cce", ROLE.coordinator),
  person(DEMO_PEOPLE.administrator, "Iñigo Ramos", "Dean (sample)", "cnm", ROLE.admin),
  person(DEMO_PEOPLE.staff, "Paolo Santiago", "Rankings Analyst", "rankings-office", ROLE.superAdmin, { position: "staff" }),
  person(DEMO_PEOPLE.director, "Celeste Navarro", "Director", "rankings-office", ROLE.superAdmin, { position: "director" }),
  person("demo-fcd", "Bea Lorenzo", "Faculty Secretary", "fcd", ROLE.coordinator),
  person("demo-cih", "Ramon Cruz", "Quality Assurance Lead", "cih", ROLE.coordinator),
  person("demo-irs", "Ana Velasco", "Research Fellow", "irs", ROLE.coordinator),
  person("demo-ocs", "Joaquin Uy", "Sustainability Officer", "ocs", ROLE.coordinator),
];

const COORDINATOR_OF: Record<string, string> = { cce: DEMO_PEOPLE.coordinator, fcd: "demo-fcd", cih: "demo-cih", irs: "demo-irs", ocs: "demo-ocs" };

type Draft = Pick<EvidenceRecord, "title" | "unitSlug" | "type" | "status" | "stage" | "level" | "mappedTo" | "sdgs" | "summary" | "result" | "beneficiaries"> & {
  ago: number;
  review?: EvidenceRecord["review"];
  comments?: EvidenceRecord["comments"];
  verifiedBy?: string;
};

/** Sample evidence. Titles, figures and outcomes are invented. */
const EVIDENCE: Draft[] = [
  // College of Coastal Engineering: the coordinator's own unit, one record in every state.
  { unitSlug: "cce", title: "Mangrove-lined sea wall pilot", type: "Narrative and outcomes", status: "Not yet submitted", stage: 0, level: 2, mappedTo: ["THE Impact · SDG 14 Life Below Water"], sdgs: [14, 13], summary: "Draft: a living sea wall along 400 m of a sample shoreline.", result: "", beneficiaries: "", ago: 2 },
  { unitSlug: "cce", title: "Tidal-energy test rig with an industry partner", type: "Research output", status: "For review", stage: 1, level: 2, mappedTo: ["WURI · Industrial Application", "THE WUR · Industry"], sdgs: [7, 9], summary: "A 50 kW test rig co-funded by a sample engineering firm.", result: "Six months of output data logged.", beneficiaries: "Partner firm and 12 students", ago: 3, review: { step: 0, approvals: [] } },
  { unitSlug: "cce", title: "Coastal flood-mapping service for municipalities", type: "Narrative and outcomes", status: "For review", stage: 1, level: 3, mappedTo: ["THE Impact · SDG 14 Life Below Water", "QS Sustainability · Environmental Impact"], sdgs: [11, 13, 14], summary: "Open flood maps for four sample municipalities.", result: "Maps used in two local disaster plans.", beneficiaries: "About 38,000 residents (sample)", ago: 6, review: { step: 1, approvals: [{ step: 0, by: "Paolo Santiago", at: demoTime(-4) }] } },
  { unitSlug: "cce", title: "Graduate employment survey, engineering programmes", type: "Operational data", status: "Needs revision", stage: 1, level: 2, mappedTo: ["QS WUR · Employment Outcomes"], sdgs: [8], summary: "Survey of the last three graduating classes (sample).", result: "82% employed within six months (sample).", beneficiaries: "", ago: 12, comments: [{ by: "Paolo Santiago", role: "Super Administrator · Staff", date: demoDay(-8), text: "Please add the survey's response rate and the date it closed." }] },
  { unitSlug: "cce", title: "Joint coastal-resilience studio with two partner universities", type: "Narrative and outcomes", status: "Validated", stage: 2, level: 3, mappedTo: ["THE WUR · International Outlook", "THE Impact · SDG 17 Partnerships for the Goals"], sdgs: [17, 11], summary: "A shared design studio run with two sample partner universities.", result: "18 co-supervised student projects.", beneficiaries: "54 students", ago: 40, verifiedBy: "Signed memorandum and studio records" },
  { unitSlug: "cce", title: "Water reuse in the hydraulics laboratory", type: "Operational data", status: "Validated", stage: 3, level: 4, mappedTo: ["UI GreenMetric · Water"], sdgs: [6], summary: "Closed-loop water for the laboratory flumes.", result: "Laboratory water use down 61% (sample).", beneficiaries: "", ago: 75, verifiedBy: "Metered readings, audited by the facilities office" },
  { unitSlug: "cce", title: "Reef-monitoring buoys for a marine protected area", type: "Narrative and outcomes", status: "Validated", stage: 4, level: 5, mappedTo: ["THE Impact · SDG 14 Life Below Water", "WURI · Industrial Application"], sdgs: [14], summary: "Low-cost buoys reporting water quality every hour.", result: "Bleaching alerts now reach rangers two weeks earlier (sample).", beneficiaries: "Two fishing communities (sample)", ago: 140, verifiedBy: "Partner agency letter" },
  // Other units, so the Office's queue and the standings have something to show.
  { unitSlug: "fcd", title: "Walkability audit of the campus district", type: "Research output", status: "For review", stage: 1, level: 3, mappedTo: ["THE Impact · SDG 11 Sustainable Cities and Communities"], sdgs: [11], summary: "Street-by-street audit with the sample city government.", result: "Twelve crossings redesigned.", beneficiaries: "Commuting students and staff", ago: 1, review: { step: 0, approvals: [] } },
  { unitSlug: "fcd", title: "Student-to-faculty ratio, current term", type: "Operational data", status: "For review", stage: 1, level: 1, mappedTo: ["QS WUR · Faculty Student"], sdgs: [4], summary: "Headcounts from the sample registrar.", result: "", beneficiaries: "", ago: 4, review: { step: 0, approvals: [] } },
  { unitSlug: "fcd", title: "Heritage housing retrofit guide", type: "Policy", status: "Needs revision", stage: 1, level: 2, mappedTo: ["THE Impact · SDG 11 Sustainable Cities and Communities"], sdgs: [11], summary: "A guide for retrofitting older homes.", result: "", beneficiaries: "", ago: 15, comments: [{ by: "Celeste Navarro", role: "Super Administrator · Director", date: demoDay(-10), text: "Add the public link to the published guide." }] },
  { unitSlug: "fcd", title: "Teaching innovation awards programme", type: "Narrative and outcomes", status: "Validated", stage: 3, level: 3, mappedTo: ["THE WUR · Teaching"], sdgs: [4], summary: "Yearly awards for course redesign.", result: "31 courses redesigned (sample).", beneficiaries: "About 2,400 students (sample)", ago: 90 },
  { unitSlug: "cih", title: "Community health-worker training on three islands", type: "Narrative and outcomes", status: "Validated", stage: 4, level: 5, mappedTo: ["THE Impact · SDG 3 Good Health and Well-being", "QS Sustainability · Social Impact"], sdgs: [3], summary: "Training for barangay health workers (sample).", result: "Maternal check-up coverage up 23% (sample).", beneficiaries: "140 health workers", ago: 120 },
  { unitSlug: "cih", title: "Free clinic hours log", type: "Operational data", status: "For review", stage: 1, level: 2, mappedTo: ["THE Impact · SDG 3 Good Health and Well-being"], sdgs: [3], summary: "Weekly clinic hours offered to the public.", result: "1,900 consultations (sample).", beneficiaries: "Neighbouring communities", ago: 2, review: { step: 1, approvals: [{ step: 0, by: "Paolo Santiago", at: demoTime(-1) }] } },
  { unitSlug: "irs", title: "Co-authored river-basin papers, last five years", type: "Operational data", status: "Validated", stage: 2, level: 2, mappedTo: ["QS WUR · International Research Network", "THE WUR · Research Quality"], sdgs: [6, 17], summary: "Bibliometric export (sample).", result: "96 papers with 21 countries (sample).", beneficiaries: "", ago: 55 },
  { unitSlug: "irs", title: "Citation data correction request", type: "Operational data", status: "Needs revision", stage: 1, level: 1, mappedTo: ["QS WUR · Citations per Faculty"], sdgs: [], summary: "Corrections to author affiliations.", result: "", beneficiaries: "", ago: 20, comments: [{ by: "Paolo Santiago", role: "Super Administrator · Staff", date: demoDay(-17), text: "Attach the list of corrected records." }] },
  { unitSlug: "ocs", title: "Rooftop solar output, last twelve months", type: "Operational data", status: "For review", stage: 1, level: 3, mappedTo: ["UI GreenMetric · Energy and Climate Change", "QS Sustainability · Environmental Impact"], sdgs: [7, 13], summary: "Metered output of the sample campus arrays.", result: "640 MWh generated (sample).", beneficiaries: "", ago: 5, review: { step: 0, approvals: [] } },
  { unitSlug: "ocs", title: "Campus waste segregation programme", type: "Narrative and outcomes", status: "Validated", stage: 3, level: 4, mappedTo: ["UI GreenMetric · Waste"], sdgs: [12], summary: "Segregation at source in all buildings.", result: "Landfill waste down 38% (sample).", beneficiaries: "", ago: 100 },
];

function evidenceRecords(): Record<string, EvidenceRecord> {
  const out: Record<string, EvidenceRecord> = {};
  EVIDENCE.forEach((e, i) => {
    const id = `EV-D${String(i + 1).padStart(3, "0")}`;
    const by = ACCOUNTS.find((a) => a.id === COORDINATOR_OF[e.unitSlug])!;
    const file = `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}.pdf`;
    out[id] = {
      id,
      title: e.title,
      unitSlug: e.unitSlug,
      type: e.type,
      period: "2025–2026",
      submitted: demoDay(-e.ago),
      submittedBy: by.name,
      submittedById: by.id,
      status: e.status,
      stage: e.stage,
      ...(e.review && { review: e.review }),
      level: e.level,
      mappedTo: e.mappedTo,
      sdgs: e.sdgs,
      summary: e.summary,
      result: e.result,
      beneficiaries: e.beneficiaries,
      // A file name only: the demo keeps no file, so there is nothing to download.
      files: [file],
      ...(e.verifiedBy && { verifiedBy: e.verifiedBy }),
      comments: e.comments ?? [],
    };
  });
  return out;
}

const NOTICES: Notice[] = [
  { id: "N-D1", at: demoTime(-1, 10), to: "office", text: "Faculty of Civic Design submitted “Walkability audit of the campus district”.", href: "/admin/unit-submissions", readBy: [] },
  { id: "N-D2", at: demoTime(-8, 14), to: DEMO_PEOPLE.coordinator, text: "Revision requested on “Graduate employment survey, engineering programmes”.", href: "/portal/submit", readBy: [] },
  { id: "N-D3", at: demoTime(-40, 9), to: DEMO_PEOPLE.coordinator, text: "Accepted: “Joint coastal-resilience studio with two partner universities”.", href: "/portal/submit", readBy: [DEMO_PEOPLE.coordinator] },
];

/** A fresh copy of the demo's state, dated from today. */
export function demoState(ref: Reference): GovernanceState {
  const seed = buildSeed(ref);
  const { audit: _audit, ...base } = seed;
  const units = base.units.map((u) => {
    if (u.kind === "University") return { ...u, name: "Sample University", code: "SU" };
    const coordinator = COORDINATOR_OF[u.id];
    return coordinator ? { ...u, adminIds: [coordinator] } : u;
  });
  const records = evidenceRecords();
  return {
    ...base,
    units,
    accounts: structuredClone(ACCOUNTS),
    // One live session per person, so the viewer can be built; there is no cookie behind it.
    sessions: ACCOUNTS.map((a) => ({ id: `demo-session-${a.id}`, accountId: a.id, createdAt: demoTime(0, 0), lastSeen: demoTime(0, 0), mfa: false, device: "Demo" })),
    security: {
      ...base.security,
      sso: { ...base.security.sso, domains: ["demo.invalid"] },
      privacy: { ...base.security.privacy, officer: "Sample Data Protection Officer", email: "privacy@demo.invalid" },
    },
    // The Office's review in two steps, so a submission can be waiting on either one.
    workflows: base.workflows.map((w) =>
      w.id === "unit-submissions"
        ? { ...w, steps: [{ name: "Evidence review", enabled: true, approver: "office" }, { name: "Validation sign-off", enabled: true, approver: "office" }] }
        : w,
    ),
    config: { ...base.config, site: { ...base.config.site, asOf: demoDay(0) } },
    records: { ...base.records, evidence: records, counters: { ...base.records.counters, evidence: Object.keys(records).length, notice: NOTICES.length } },
    notices: structuredClone(NOTICES),
    auditHead: { seq: 0, hash: "" },
    recentAudit: [],
  };
}
