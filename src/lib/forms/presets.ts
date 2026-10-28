/*
 * Presets: questions and blocks of questions the University's forms ask again and again, ready to drop into a
 * form. Each returns specs built from the modules, with the wording and rules UST's offices use, and takes the
 * few things that change between forms (an id, a limit, rates). The Forms Builder lists them in PRESETS; a form
 * built from them keeps its own copy in the forms table, so editing a preset never changes a live form.
 * docs/digital-forms.md describes each one.
 */
import type {
  BudgetSpec,
  BudgetSummarySpec,
  ChoiceOption,
  ChoiceSpec,
  ConsentSpec,
  CountsSpec,
  FieldSpec,
  LinkSpec,
  ParagraphSpec,
  PeopleSpec,
  ReviewSpec,
  SdgsSpec,
  StageSpec,
  TableSpec,
  TextSpec,
  UnitSpec,
  YesNoSpec,
} from "./types";

export const UST_DOMAIN = "ust.edu.ph";

/* ---------- Who ---------- */

/** A title, a name, any one line. */
export const shortText = (id: string, label: string, more: Partial<TextSpec> = {}): TextSpec => ({ id, type: "text", label, required: true, max: 160, ...more });

/** Organizations named one per row ("Collaborating organizations"). Empty means none. */
export const organizations = (id: string, label: string, more: Partial<TableSpec> = {}): TableSpec => ({
  id,
  type: "table",
  label,
  help: "Leave empty if none.",
  max: 10,
  add: "Add organization",
  columns: [{ id: "name", label: "Organization", type: "text", required: true, max: 120 }],
  ...more,
});

/** Where a student project comes from: a University-wide organization, NSTP, a local organization or unit, or other. */
export const affiliation = (id = "affiliation"): ChoiceSpec => ({
  id,
  type: "choice",
  label: "Affiliation",
  required: true,
  display: "cards",
  options: [
    { value: "uso", label: "University-wide student organization" },
    { value: "nstp", label: "NSTP", hint: "CWTS or LTS" },
    { value: "local", label: "Local student organization or academic unit" },
  ],
  other: "Others",
});

/** A college or faculty from the Hub's directory. */
export const academicUnit = (id: string, more: Partial<UnitSpec> = {}): UnitSpec => ({ id, type: "unit", label: "Academic unit", required: true, sections: ["academic"], ...more });

/** People to reach about a response: names (last, first, middle, in capitals), phones and UST emails. */
export const contactPersons = (id = "contacts", max = 2): PeopleSpec => ({
  id,
  type: "people",
  label: "Contact persons",
  required: true,
  ask: ["phone", "email"],
  domain: UST_DOMAIN,
  min: 1,
  max,
  noun: "contact person",
});

/** One named person per role ("President", "Treasurer"), each with a UST email. */
export const officers = (id: string, label: string, roles: string[], more: Partial<PeopleSpec> = {}): PeopleSpec => ({
  id,
  type: "people",
  label,
  required: true,
  ask: label === "Liquidation officers" ? ["phone", "email"] : ["email"],
  domain: UST_DOMAIN,
  roles,
  max: roles.length,
  ...more,
});

/* ---------- What ---------- */

/** The University's community development program areas. */
export const PROGRAM_AREAS: ChoiceOption[] = [
  { value: "health", label: "Health and wellness" },
  { value: "education", label: "Equitable and inclusive education" },
  { value: "governance", label: "Leadership and good governance" },
  { value: "enterprise", label: "Employability and social enterprise" },
  { value: "pastoral", label: "Socio-pastoral ministry and evangelization" },
  { value: "heritage", label: "Culture and heritage" },
  { value: "sports", label: "Sports development" },
  { value: "environment", label: "Environmental sustainability and action" },
  { value: "family", label: "Family and household development" },
];

export const programAreas = (id = "areas", max = 2): ChoiceSpec => ({
  id,
  type: "choice",
  label: "Program areas",
  help: `Up to ${max}.`,
  required: true,
  multiple: true,
  max,
  display: "chips",
  options: PROGRAM_AREAS,
});

export const targetSdgs = (id = "sdgs", max = 3): SdgsSpec => ({ id, type: "sdgs", label: "Target SDGs", help: `Up to ${max}.`, required: true, max, column: true });

/** A few sentences that answer one question. */
export const sentences = (id: string, label: string, help: string, count = 5, more: Partial<ParagraphSpec> = {}): ParagraphSpec => ({
  id,
  type: "paragraph",
  label,
  help: count ? `${help} Up to ${count} sentences.` : help,
  required: true,
  sentences: count || undefined,
  max: 3000,
  ...more,
});

/** One answer per aspect, the aspects fixed: expected results for the project, its implementers and the community. */
export const expectedResults = (id = "results", aspects = ["Project", "Implementers", "Community"]): TableSpec => ({
  id,
  type: "table",
  label: "Expected results",
  required: true,
  rows: aspects,
  columns: [{ id: "result", label: "Expected result", type: "paragraph", required: true, max: 600, wide: true }],
});

/* ---------- Where and when ---------- */

/** Participants by group, with the total: the community and each kind of Thomasian. */
export const participants = (id = "participants"): CountsSpec => ({
  id,
  type: "counts",
  label: "Target participants",
  required: true,
  total: "Total participants",
  rows: [
    { id: "community", label: "Community or institution" },
    { id: "students", label: "Thomasian students" },
    { id: "faculty", label: "Thomasian academic staff" },
    { id: "administrators", label: "Thomasian administrators" },
    { id: "support", label: "Thomasian support staff" },
    { id: "alumni", label: "UST alumni" },
    { id: "guests", label: "Guests" },
  ],
});

export const MODES: ChoiceOption[] = [
  { value: "online", label: "Online" },
  { value: "campus", label: "In campus" },
  { value: "offcampus", label: "Off campus" },
  { value: "hybrid", label: "Hybrid" },
];

/** A project's phases: a name, how it runs, its dates and venue, and a meeting link when it's online. */
export const phases = (id = "phases", min = 2, max = 6): TableSpec => ({
  id,
  type: "table",
  label: "Phases",
  hint: min === 2 ? "Minimum of two (2) Phases" : `Minimum of ${min} Phases`,
  required: true,
  numbered: "Phase",
  min,
  max,
  add: "Add phase",
  columns: [
    { id: "name", label: "Phase Title", type: "text", required: true, max: 60, examples: ["Preparation", "Implementation", "Evaluation"] },
    { id: "mode", label: "Mode", type: "choice", required: true, options: MODES },
    { id: "dates", label: "Dates", type: "daterange", required: true },
    { id: "venue", label: "Venue or platform", type: "text", required: true, max: 200, placeholder: "Building, street, barangay, city, province", wide: true },
    { id: "link", label: "Meeting link", type: "link", placeholder: "https://meet.google.com/…", showIf: { column: "mode", is: ["online", "hybrid"] }, wide: true },
  ],
});

/** What happens in each phase: when, what, and who leads it. */
export const projectFlow = (id = "flow", phasesId = "phases"): TableSpec => ({
  id,
  type: "table",
  label: "Project flow",
  required: true,
  min: 1,
  max: 40,
  add: "Add activity",
  columns: [
    { id: "phase", label: "Phase", type: "choice", required: true, optionsFrom: phasesId },
    { id: "time", label: "Time", type: "text", required: true, max: 60, placeholder: "8:00–9:00 AM" },
    { id: "activity", label: "Activity", type: "text", required: true, max: 120 },
    { id: "lead", label: "Person in charge", type: "name", required: true, wide: true },
    { id: "position", label: "Position", type: "text", max: 120 },
    { id: "details", label: "Details", type: "paragraph", max: 600, wide: true },
  ],
});

/* ---------- Money ---------- */

/** SIMBAHAYAN's fixed rates, in pesos. */
export const RATES = { meal: 175, snack: 100, studentVolunteer: 500, staffVolunteer: 2000, communityVolunteer: 1000 } as const;

const FUNDS = [
  { id: "csf", label: "Community Service Fund (CSF)" },
  { id: "org", label: "Organizational Counterpart" },
  { id: "community", label: "Community Counterpart" },
];

/** A project budget per phase: food at fixed CSF rates, transport, materials and others, each line paid from a source. */
export const budgetPerPhase = (id = "budget", phasesId = "phases", rates = RATES): BudgetSpec => ({
  id,
  type: "budget",
  label: "Budget",
  hint: "CSF is the Community Service Fund. SIMBAHAYAN contributes to a project but never covers all of it, so show what your organization and the community put in.",
  required: true,
  column: true,
  per: phasesId,
  sources: FUNDS,
  categories: [
    {
      id: "food",
      label: "Food",
      presets: [
        { item: "Lunch or dinner", rate: rates.meal, locked: true },
        { item: "Snack", rate: rates.snack, locked: true },
      ],
    },
    {
      id: "transport",
      label: "Transportation",
      custom: true,
      presets: [
        { item: "Van", hint: "Up to 10 people" },
        { item: "Coaster", hint: "Up to 25 people" },
        { item: "Bus", hint: "Up to 45 people" },
      ],
    },
    { id: "materials", label: "Materials and supplies", custom: true, perDay: false },
    {
      id: "others",
      label: "Others",
      custom: true,
      presets: [
        { item: "Token", hint: "Attach the speaker’s CV or bionote." },
        { item: "Honorarium", recipient: true, hint: "Attach the speaker’s CV or bionote." },
        { item: "Load (mobile data or SMS)", hint: "Online activities only." },
      ],
    },
  ],
});

/** Who the Community Service Fund pays, as the office records it. */
export const PAYEES: ChoiceOption[] = [
  { value: "scdo", label: "SCDO" },
  { value: "purchasing", label: "Purchasing" },
  { value: "supplier", label: "Supplier" },
];

/**
 * A budget's CSF lines added up by category, from every phase: the paper's "Summary of budget under Community
 * Service Fund (CSF)". The proponent sees each line with the subtotals and the overall total; with `payee`, the
 * office says who each category is paid to.
 */
export const csfSummary = (id = "csfSummary", budgetId = "budget", payee?: ChoiceOption[]): BudgetSummarySpec => ({
  id,
  type: "budgetsummary",
  label: "Summary of budget under Community Service Fund (CSF)",
  ...(payee ? { payee } : { help: "Every Community Service Fund line, from all phases. The final approved budget is set after review." }),
  budget: budgetId,
  source: "csf",
});

/** The value of volunteers' time at fixed daily rates: a hypothetical counterpart, no money released. */
export const volunteerCounterpart = (id = "counterpart", rates = RATES): BudgetSpec => ({
  id,
  type: "budget",
  label: "Volunteer counterpart",
  required: true,
  fixed: true,
  theoretical: true,
  sources: FUNDS.slice(1),
  categories: [
    {
      id: "volunteers",
      label: "Volunteers",
      presets: [
        { item: "Student volunteers", rate: rates.studentVolunteer, locked: true, source: "org" },
        { item: "Staff volunteers", rate: rates.staffVolunteer, locked: true, source: "org" },
        { item: "Partner community volunteers", rate: rates.communityVolunteer, locked: true, source: "community" },
      ],
    },
  ],
});

/* ---------- Safety ---------- */

export const emergencyContact = (id = "emergencyContact"): PeopleSpec => ({
  id,
  type: "people",
  label: "Emergency contact",
  help: "From the lead organization.",
  ask: ["phone", "email"],
  emailOptional: true,
  max: 1,
  noun: "emergency contact",
});

/** Whether there are speakers, and if so who, from where, and what they're paid. */
export const resourceSpeakers = (askId = "hasSpeakers", id = "speakers"): [YesNoSpec, TableSpec] => [
  { id: askId, type: "yesno", label: "Will you have resource speakers?", required: true },
  {
    id,
    type: "table",
    label: "Resource speakers",
    hint: "Requested amounts are subject to SIMBAHAYAN’s approval. For a token or honorarium from the CSF, prepare the speaker’s CV or bionote.",
    required: true,
    showIf: { field: askId, is: ["yes"] },
    min: 1,
    max: 10,
    add: "Add speaker",
    columns: [
      { id: "name", label: "Speaker", type: "name", required: true, wide: true },
      {
        id: "from",
        label: "Affiliation",
        type: "choice",
        required: true,
        options: [
          { value: "staff", label: "Thomasian · academic staff" },
          { value: "alumni", label: "Thomasian · alumni" },
          { value: "external", label: "Non-Thomasian" },
        ],
      },
      { id: "education", label: "Highest education", type: "text", required: true, max: 120 },
      { id: "years", label: "Years of service", type: "number" },
      { id: "paid", label: "Token or honorarium from CSF", type: "choice", required: true, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
      { id: "amount", label: "Amount requested", type: "money", showIf: { column: "paid", is: ["yes"] } },
    ],
  },
];

/* ---------- Links ---------- */

export const linkTo = (id: string, label: string, more: Partial<LinkSpec> = {}): LinkSpec => ({ id, type: "link", label, required: true, ...more });

/* ---------- Sign ---------- */

/** The Data Privacy Act consent the University's forms carry, plus whatever else the office asks proponents to agree to. */
export const declarations = (id: string, office: string, more: ConsentSpec["statements"] = []): ConsentSpec => ({
  id,
  type: "consent",
  label: "Declarations",
  required: true,
  statements: [
    {
      id: "privacy",
      text: `We consent to the use of the personal information in this form for documentation and coordination, and to photos and videos for ${office}’s reports and promotions.`,
      hint: `In compliance with the Data Privacy Act of 2012 (RA 10173), the personal information collected through this form is used solely for documentation and coordination of the activity. By submitting it, proponents consent to the taking and use of photos and videos for reporting and official promotional materials of ${office}.`,
    },
    { id: "informed", text: "We will tell every collaborator and participant about this consent before the activity starts." },
    ...more,
  ],
});

/**
 * The e-signature: one box to tick that signs the form electronically, for everyone it names, in place of the
 * paper's signature lines. The response's arrival dates it.
 */
export const eSignature = (id: string, what = "this form", forWhom?: string): ConsentSpec => ({
  id,
  type: "consent",
  label: "E-signature",
  required: true,
  statements: [
    {
      id: "signed",
      text: `We sign ${what} electronically${forWhom ? `, ${forWhom}` : ""}.`,
      hint: "This takes the place of signatures on the paper form. The Hub dates it when the form is sent.",
    },
  ],
});

/* ---------- Review ---------- */

/** Sign-offs in order, as on a paper form's "Noted by / Endorsed by / Approved by" lines. */
export const approvalChain = (stages: StageSpec[]): StageSpec[] => stages;

/**
 * What an office fills in on a funded proposal: the proposed budget code, the summary of budget under the CSF with
 * who each category is paid to, the final approved budget and budget code, the cash requisition and comments.
 */
export const officeUse = (budgetId = "budget"): FieldSpec[] => [
  { id: "budgetCode", type: "text", label: "Proposed budget code", half: true, max: 60 },
  csfSummary("payableTo", budgetId, PAYEES),
  { id: "finalBudget", type: "money", label: "Final approved CSF budget", half: true },
  { id: "finalCode", type: "text", label: "Final budget code", half: true, max: 60 },
  { id: "requisition", type: "text", label: "Cash requisition number", half: true, max: 60 },
  { id: "encodedOn", type: "date", label: "Date of encoding", half: true },
  { id: "comments", type: "paragraph", label: "Comments", max: 2000 },
];

export const review = (stages: StageSpec[], fields: FieldSpec[]): ReviewSpec => ({ stages, fields });

/** The palette the Forms Builder offers: every preset by name. */
export const PRESETS: { key: string; name: string; group: "Who" | "What" | "Where and when" | "Money" | "Safety" | "Sign" | "Review"; build: () => FieldSpec | FieldSpec[] | StageSpec[] }[] = [
  { key: "organizations", name: "Organizations", group: "Who", build: () => organizations("organizations", "Collaborating organizations") },
  { key: "affiliation", name: "Affiliation", group: "Who", build: () => affiliation() },
  { key: "academic-unit", name: "Academic unit", group: "Who", build: () => academicUnit("unit") },
  { key: "contact-persons", name: "Contact persons", group: "Who", build: () => contactPersons() },
  { key: "officers", name: "Officers by role", group: "Who", build: () => officers("officers", "Liquidation officers", ["President", "Treasurer"]) },
  { key: "program-areas", name: "Program areas", group: "What", build: () => programAreas() },
  { key: "target-sdgs", name: "Target SDGs", group: "What", build: () => targetSdgs() },
  { key: "expected-results", name: "Expected results", group: "What", build: () => expectedResults() },
  { key: "participants", name: "Target participants", group: "Where and when", build: () => participants() },
  { key: "phases", name: "Phases", group: "Where and when", build: () => phases() },
  { key: "project-flow", name: "Project flow", group: "Where and when", build: () => [phases(), projectFlow()] },
  { key: "budget", name: "Budget per phase", group: "Money", build: () => [phases(), budgetPerPhase()] },
  { key: "csf-summary", name: "Summary of budget under CSF", group: "Money", build: () => [phases(), budgetPerPhase(), csfSummary()] },
  { key: "counterpart", name: "Volunteer counterpart", group: "Money", build: () => volunteerCounterpart() },
  { key: "emergency", name: "Emergency plan", group: "Safety", build: () => [sentences("emergencyPlan", "Emergency plan", "What you’ll do in an emergency.", 0), emergencyContact()] },
  { key: "speakers", name: "Resource speakers", group: "Safety", build: () => resourceSpeakers() },
  { key: "declarations", name: "Data privacy consent", group: "Sign", build: () => declarations("declarations", "the office") },
  { key: "signature", name: "E-signature", group: "Sign", build: () => eSignature("esign") },
  { key: "approvals", name: "Noted, endorsed, approved", group: "Review", build: () => approvalChain([{ id: "approver", role: "Approver", verb: "Approved" }]) },
  { key: "office-use", name: "Office use: budget codes", group: "Review", build: () => officeUse() },
];
