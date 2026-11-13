/* The public pages' own copy, kept apart from their markup because the assistant's index reads it too (lib/assistant/server/sources.ts). */

export const STANDARDS = [
  "States the reporting period the ranking asks for",
  "Gives a measurable result, not only an activity",
  "Names who benefited and how the change was verified",
  "Links to an approved, dated document",
  "Uses a public address where the ranking requires one",
];

export const EXAMPLES: [string, string][] = [
  ["Clinic records showing blood-pressure control rose from 41% to 63% among 1,150 patients", "A list of clinic dates with photographs"],
  ["Metered water reuse for January to December 2025, with a metering certificate", "An estimate of water saved, with no meter data"],
  ["An approved policy with its approval date and a public address", "A draft policy behind a link that needs a login"],
];

export const POLICIES = [
  ["UST Aquinas Framework", "Institutional framework for research, teaching and community engagement"],
  ["Social Transformation Framework", "How Thomasian programmes measure change in the communities they serve"],
  ["Sustainability policy", "Campus operations, procurement and climate commitments"],
  ["Data governance for ranking evidence", "Ownership, validation and retention of submitted evidence"],
  ["Lifelong learning access policy", "Public access to short courses and the library"],
];
