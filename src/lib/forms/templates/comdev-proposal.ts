/*
 * UST SIMBAHAYAN's Community Development (ComDev) Project Proposal, form S040-00-FO21 rev06 (23 Sep 2026), as a
 * digital form built from the presets. The paper's instructions became the form's own rules (two phases at
 * least, up to two program areas and three SDGs, fixed food and volunteer rates, totals that add up), its
 * "highlight your answer" lists became choices, its signature lines became one ticked e-signature, its "Summary of budget
 * under Community Service Fund (CSF)" adds itself up from the budget (with who each category is paid to on the
 * office's side), and its "Noted by / Endorsed by / Approval" pages became the review's sign-offs. Every name
 * is written in capitals, letters only, and every person's name (contacts, officers, the emergency contact,
 * speakers, persons in charge, recipients) in parts: last, first and an optional middle name. The live
 * form is the row seeded from this in supabase/migrations/20261028190000_digital_forms.sql and brought up to date
 * in 20261028200000_csf_summary.sql, 20261028210000_comdev_names_caps.sql, 20261028220000_comdev_name_parts.sql and
 * 20261028240000_comdev_esign_tick.sql;
 * this file is the template the Forms Builder starts from.
 */
import {
  academicUnit,
  affiliation,
  budgetPerPhase,
  contactPersons,
  csfSummary,
  declarations,
  emergencyContact,
  eSignature,
  expectedResults,
  linkTo,
  officers,
  officeUse,
  organizations,
  participants,
  phases,
  programAreas,
  projectFlow,
  resourceSpeakers,
  sentences,
  shortText,
  targetSdgs,
  volunteerCounterpart,
} from "../presets";
import type { FormKind, FormSchema, TableSpec, TextSpec } from "../types";

const OFFICE = "UST SIMBAHAYAN";

/** An organization's name in capitals, letters only; for a table, its Organization column. People's names always are. */
const caps = <S extends TextSpec | TableSpec>(spec: S): S =>
  spec.type === "table" ? { ...spec, columns: spec.columns.map((c) => (c.id === "name" && c.type === "text" ? { ...c, caps: true } : c)) } : { ...spec, caps: true };

export const COMDEV_PROPOSAL: { title: string; description: string; kind: FormKind; reference: string; issuerId: string; prefix: string; schema: FormSchema } = {
  title: "Community Development Project Proposal",
  description: "Propose a ComDev project for endorsement and approval.",
  kind: "proposal",
  reference: "UST:S040-00-FO21 rev06 09/23/26",
  issuerId: "simbahayan",
  prefix: "CDP",
  schema: {
    from: { name: "lead", email: "contacts" },
    sections: [
      {
        id: "project",
        title: "Project",
        icon: "flag",
        fields: [
          shortText("title", "Project title", { column: true }),
          caps(shortText("lead", "Lead organization", { max: 120, column: true })),
          caps(organizations("collaborators", "Collaborating organizations")),
          affiliation(),
          academicUnit("academicUnit", { showIf: { field: "affiliation", is: ["local"] } }),
          programAreas(),
          targetSdgs(),
        ],
      },
      {
        id: "people",
        title: "People",
        icon: "users",
        fields: [contactPersons(), officers("officers", "Liquidation officers", ["President", "Treasurer"], { hint: "They receive the budget and file the expense report." })],
      },
      {
        id: "schedule",
        title: "Where and when",
        icon: "calendar",
        fields: [
          shortText("community", "Partner community or institution", { help: "Write “Thomasians” if the participants are from UST.", max: 200 }),
          participants(),
          phases(),
        ],
      },
      {
        id: "plan",
        title: "Plan",
        icon: "target",
        fields: [
          sentences("background", "Why this project", "", 5, { help: undefined }),
          sentences("objective", "General objective", "", 5, { help: undefined }),
          expectedResults(),
          projectFlow(),
        ],
      },
      {
        id: "budget",
        title: "Budget",
        icon: "wallet",
        fields: [budgetPerPhase(), csfSummary(), volunteerCounterpart()],
      },
      {
        id: "safety",
        title: "Safety",
        icon: "shield",
        fields: [
          sentences("emergencyPlan", "Emergency plan", "Protocols for emergencies, health hazards and heat, and your first aider.", 0),
          { id: "hospital", type: "text", label: "Nearest hospital or clinic", help: "For face-to-face activities.", max: 200 },
          emergencyContact(),
          ...resourceSpeakers(),
        ],
      },
      {
        id: "sustain",
        title: "Sustainability",
        icon: "tree",
        fields: [
          linkTo("evaluation", "Evaluation form", { help: "With quantitative and qualitative measures.", placeholder: "https://forms.gle/…" }),
          sentences("ownership", "Project sustainability", "How the community will carry it on: trained local leaders, a community team, simple guides.", 0),
          sentences("environment", "Care for creation", "How you’ll care for the environment: reusable utensils, your own tumbler.", 0),
        ],
      },
      {
        id: "sign",
        title: "Sign",
        icon: "pen",
        fields: [
          declarations("declarations", OFFICE, [
            { id: "links", text: "Every link here opens, and simbahayan.office@ust.edu.ph has Editor access to it." },
            {
              id: "reports",
              text: "We will submit the terminal and expense reports within 15 working days after the project.",
              hint: "Submit an expense report only if you receive a CSF or are due a reimbursement, and bring it to the SIMBAHAYAN Office: expense reports sent online aren’t processed.",
            },
          ]),
          eSignature("esign", "this proposal", "for the lead organization, any collaborating organization and the liquidation officers"),
        ],
      },
    ],
    review: {
      stages: [
        { id: "adviser", role: "Student organization adviser", verb: "Noted", showIf: { field: "affiliation", is: ["local"] } },
        { id: "dean", role: "Dean", verb: "Endorsed", showIf: { field: "affiliation", is: ["local"] } },
        { id: "regent", role: "Regent", verb: "Endorsed", showIf: { field: "affiliation", is: ["local"] } },
        { id: "coordinator", role: "ComDev coordinator or NSTP moderator", verb: "Approved" },
        { id: "director", role: "UST SIMBAHAYAN Director", verb: "Approved" },
      ],
      fields: officeUse(),
    },
  },
};
