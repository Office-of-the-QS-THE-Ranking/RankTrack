import type { IconName } from "@/components/ui/Icon";

/* The Knowledge Center's own copy: what reviewers check, worked examples, templates, training, policies and
   questions. Indicator terms, rankings and the calendar come from the reference data. */

/** What reviewers check before an item counts. */
export const CHECKS: { icon: IconName; title: string; text: string }[] = [
  { icon: "calendar", title: "Right period", text: "The reporting period the ranking asks for" },
  { icon: "target", title: "Measurable result", text: "A result, not only an activity" },
  { icon: "users", title: "Verified reach", text: "Who benefited, and how it was checked" },
  { icon: "scroll", title: "Approved document", text: "Signed off and dated" },
  { icon: "globe", title: "Public link", text: "Opens without signing in, where required" },
];

/** The same work, as evidence that counts and as evidence that does not. */
export const EXAMPLES: { icon: IconName; topic: string; good: string; bad: string }[] = [
  {
    icon: "heart",
    topic: "Outcome",
    good: "Clinic records: blood-pressure control up from 41% to 63% across 1,150 patients",
    bad: "A list of clinic dates with photographs",
  },
  {
    icon: "water",
    topic: "Measurement",
    good: "Metered water reuse for January–December 2025, with a metering certificate",
    bad: "An estimate of water saved, with no meter data",
  },
  {
    icon: "governance",
    topic: "Policy",
    good: "An approved policy with its approval date and a public URL",
    bad: "A draft shared through a link that needs a login",
  },
];

export const TEMPLATES = [
  { name: "Evidence submission", file: "evidence-submission-template.csv", cols: ["Title", "Reporting period", "Measurable result", "Unit of measure", "Beneficiaries", "Number of beneficiaries", "SDGs", "Evidence files or URL", "Rankings"] },
  { name: "Impact story", file: "impact-story-template.csv", cols: ["Challenge", "Thomasian response", "Implementation", "Measurable outcome", "Beneficiaries", "SDGs", "Rankings", "Replication guidance", "Lessons for other institutions"] },
  { name: "Reporting-period data", file: "reporting-data-template.csv", cols: ["Indicator", "Ranking", "Reporting period", "Value", "Unit", "Source document", "Data owner"] },
];

export type TrainingKind = "Recorded" | "Workshop" | "Guide";

export const TRAINING: { title: string; kind: TrainingKind; length: string }[] = [
  { title: "Orientation: evidence that counts", kind: "Recorded", length: "42 min" },
  { title: "Orientation: public URLs and policies", kind: "Recorded", length: "18 min" },
  { title: "Writing outcome evidence, not activity reports", kind: "Workshop", length: "90 min" },
  { title: "Mapping one record to several rankings", kind: "Guide", length: "6 pages" },
];

export const POLICIES: [string, string][] = [
  ["UST Aquinas Framework", "Research, teaching and community engagement"],
  ["Social Transformation Framework", "How programmes measure change in communities"],
  ["Sustainability policy", "Campus operations, procurement and climate"],
  ["Data governance for ranking evidence", "Ownership, validation and retention"],
  ["Lifelong learning access policy", "Public access to short courses and the library"],
];

export const FAQ: [string, string][] = [
  ["Can one document count for several rankings?", "Yes. Submit it once; the Office maps it to every indicator it supports and credits your unit each time."],
  ["What makes evidence acceptable?", "It names the reporting period, the measurable result, who benefited and how that was verified, and links to an approved document."],
  ["Why was my submission returned?", "Most returns are for the wrong reporting period, a missing approval date or a link that needs a login."],
  ["Who confirms official figures?", "The data owner for each indicator. The Office checks consistency but does not change official values."],
  ["When will I know where my evidence counts?", "As soon as a reviewer accepts it. Your dashboard lists every ranking and indicator it supports."],
];
