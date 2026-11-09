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

export const FAQ = [
  [
    "Can one document count for several rankings?",
    "Yes. Submit it once; the Office maps it to every indicator it supports and credits your unit each time.",
  ],
  [
    "What makes evidence acceptable?",
    "It names the reporting period, the measurable result, who benefited and how that was verified, and links to an approved document.",
  ],
  ["Why was a submission returned?", "Most returns are for the wrong reporting period, a missing approval date or a link that needs a login."],
  ["Who confirms official figures?", "The data owner for each indicator. The Office checks consistency but does not change official values."],
  [
    "When will a unit know where its evidence counts?",
    "As soon as a reviewer accepts it. The unit's dashboard lists every ranking and indicator it supports.",
  ],
];

export const POLICIES = [
  ["UST Aquinas Framework", "Institutional framework for research, teaching and community engagement"],
  ["Social Transformation Framework", "How Thomasian programmes measure change in the communities they serve"],
  ["Sustainability policy", "Campus operations, procurement and climate commitments"],
  ["Data governance for ranking evidence", "Ownership, validation and retention of submitted evidence"],
  ["Lifelong learning access policy", "Public access to short courses and the library"],
];

export const GOVERNANCE = [
  ["Office of the Rector", "The Office of QS/THE Rankings operates under the Office of the Rector."],
  ["Director", "Engr. Nestor R. Ong heads the Office. The Office Clerk, Office Assistant and Ranking Specialists report directly to the Director."],
  ["Functional supervision", "Engr. Rodablas P. Nicolas provides functional or indirect supervision to the Ranking Specialists."],
  ["Academic and support units", "Coordinate with the Office to collect and consolidate data and implement action plans."],
  ["Office of International Relations & Programs", "Works with the Office on data collection and stakeholder coordination."],
];
