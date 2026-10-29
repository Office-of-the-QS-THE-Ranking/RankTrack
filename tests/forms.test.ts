import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { execute } from "@/lib/governance/engine";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";
import { analyze } from "@/lib/forms/analytics";
import { budgetTotals, partsOf, sourceSummary } from "@/lib/forms/budget";
import { afterRowRemoved, checkAnswers, respondentOf, shownSections } from "@/lib/forms/check";
import { responsesCsv } from "@/lib/forms/csv";
import { dateEntries, datesLabel, dayLabel, formatPhone, peso, rangeLabel } from "@/lib/forms/format";
import { hasEmoji, lettersOnly, noEmoji } from "@/lib/forms/letters";
import { PRIVACY_VERSION, readConsent } from "@/lib/forms/privacy";
import { fieldMap, moduleOf, sentenceCount } from "@/lib/forms/modules";
import { emptyReview, standing } from "@/lib/forms/review";
import { readSchema } from "@/lib/forms/schema";
import { COMDEV_PROPOSAL } from "@/lib/forms/templates/comdev-proposal";
import type { Answers, BudgetSpec, BudgetSummarySpec, BudgetValue, ReviewState, Row } from "@/lib/forms/types";
import { world } from "./helpers";

describe("phone formatting", () => {
  it("adds mobile-number separators progressively", () => {
    for (const [input, expected] of [["", ""], ["0", "0"], ["0919", "0919"], ["09190", "0919-0"], ["0919095", "0919-095"], ["09190957", "0919-095-7"], ["09190957995", "0919-095-7995"]]) expect(formatPhone(input)).toBe(expected);
  });

  it("formats pasted local and Philippine international numbers without dropping digits", () => {
    for (const input of ["0919 095 7995", "0919-095-7995", "+63 919 095 7995", "639190957995"]) expect(formatPhone(input)).toBe("0919-095-7995");
  });

  it("preserves other international numbers, landlines and invalid input for validation", () => {
    for (const input of ["(02) 8731-3001", "+1 212 555 1234", "call me", "091909579951"]) expect(formatPhone(input)).toBe(input);
  });
});

const schema = COMDEV_PROPOSAL.schema;
const ctx = { units: [{ id: "eng", name: "Faculty of Engineering", section: "academic" as const }] };
const check = (answers: unknown) => checkAnswers(schema.sections, answers, ctx);
const field = (id: string) => fieldMap(schema.sections).get(id)!;

/** A complete proposal from a University-wide organization. */
const proposal = (): Answers => ({
  title: "Kalinga sa Komunidad",
  lead: "UST Red Cross Youth",
  affiliation: { picked: ["uso"] },
  areas: { picked: ["health", "education"] },
  sdgs: [3, 4],
  contacts: [{ name: "Ana Reyes", phone: "0917 123 4567", email: "ana.reyes@ust.edu.ph" }],
  officers: [
    { name: "Ben Cruz", phone: "09171234567", email: "ben.cruz@ust.edu.ph" },
    { name: "Carla Diaz", phone: "09177654321", email: "carla.diaz@ust.edu.ph" },
  ],
  community: "Barangay 431, Sampaloc",
  participants: { community: 60, students: 25 },
  phases: [
    { name: "Preparation", mode: "online", dates: { from: "2026-11-02", to: "2026-11-02" }, venue: "Google Meet", link: "https://meet.google.com/abc-defg-hij" },
    { name: "Implementation", mode: "offcampus", dates: { from: "2026-11-14", to: "2026-11-15" }, venue: "Barangay 431 Hall, Sampaloc, Manila" },
  ],
  background: "Families in the barangay lack first aid skills. The nearest clinic is far. Dr. Santos asked for help.",
  objective: "Train fifty residents in basic first aid.",
  results: [{ result: "A first aid module" }, { result: "Officers trained as facilitators" }, { result: "Fifty residents certified" }],
  flow: [
    { phase: "1", time: "9:00–10:00 AM", activity: "Planning meeting", lead: { lastName: "Reyes", firstName: "Ana" }, position: "Project head" },
    { phase: "2", time: "8:00 AM–12:00 NN", activity: "First aid training", lead: { lastName: "Cruz", firstName: "Ben" }, position: "President" },
  ],
  budget: {
    lines: [
      { key: "a", part: 1, category: "food", item: "Lunch or dinner", qty: 60, rate: 175, days: 2, source: "csf" },
      { key: "b", part: 1, category: "transport", item: "Coaster", qty: 1, rate: 6000, days: 1, source: "org" },
      { key: "c", part: 0, category: "materials", item: "First aid kits", qty: 10, rate: 450, days: 3, source: "csf" },
    ],
  },
  counterpart: { lines: [{ key: "v", category: "volunteers", item: "Student volunteers", qty: 20, rate: 1, days: 2, source: "community" }] },
  emergencyPlan: "Two first aiders on site, a cooling station, and the barangay's ambulance on call.",
  emergencyContact: [{ name: "Ana Reyes", phone: "0917 123 4567" }],
  hasSpeakers: "yes",
  speakers: [{ name: { lastName: "Santos", firstName: "Lea", middleName: "" }, from: "staff", education: "Doctor of Medicine", years: 12, paid: "yes", amount: 2000 }],
  evaluation: "https://forms.gle/abc123",
  ownership: "Trained residents form a barangay first aid team.",
  environment: "Reusable utensils and water jugs only.",
  declarations: ["privacy", "informed", "links", "reports"],
  esign: ["signed"],
});

/** Typed signatures, from before the e-signature became a box to tick: answers sent then are still checked and read. */
const signing = (answers: Answers) =>
  checkAnswers(
    [
      {
        id: "sign",
        title: "Sign",
        fields: [
          { id: "signLead", type: "signature", label: "Lead organization", required: true, signers: ["Lead organization representative"] },
          { id: "signOfficers", type: "signature", label: "Liquidation officers", required: true, signers: ["President", "Treasurer"] },
        ],
      },
    ],
    { signLead: [{ name: "Ana Reyes", on: "" }], signOfficers: [{ name: "Ben Cruz", on: "" }, { name: "Carla Diaz", on: "" }], ...answers },
    ctx,
  );

describe("digital forms", () => {
  it("formats amounts with Php in totals and exports", () => {
    expect(peso(12300.5)).toBe("Php 12,300.50");
    expect(peso(12300, true)).toBe("Php 12,300");
    expect(peso(12300.5, true)).toBe("Php 12,300.50");
    expect(peso(0)).toBe("Php 0.00");
  });
  it("seeds a template that passes the server's own schema check", () => {
    const read = readSchema(schema);
    expect(typeof read).not.toBe("string");
    expect(readSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", type: "text", label: "X", showIf: { field: "later", is: ["y"] } }] }] })).toMatch(/doesn’t come before/);
    expect(readSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", type: "rocket", label: "X" }] }] })).toMatch(/doesn’t know/);
    expect(readSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", type: "text", label: "X" }, { id: "x", type: "text", label: "Y" }] }] })).toMatch(/share the id/);
  });

  it("takes a complete proposal and drops what was never asked", () => {
    const { answers, problems } = check({ ...proposal(), sneaky: "<script>", academicUnit: "eng" });
    expect(problems).toEqual([]);
    expect(answers).not.toHaveProperty("sneaky");
    // The academic unit is asked of local organizations only.
    expect(answers).not.toHaveProperty("academicUnit");
    expect(respondentOf(schema, answers)).toEqual({ name: "UST RED CROSS YOUTH", email: "ana.reyes@ust.edu.ph" });
  });

  it("asks what applies, and only that", () => {
    const local = check({ ...proposal(), affiliation: { picked: ["local"] } });
    expect(local.problems.map((p) => p.field)).toEqual(["academicUnit"]);
    expect(check({ ...proposal(), affiliation: { picked: ["local"] }, academicUnit: "eng" }).problems).toEqual([]);
    expect(check({ ...proposal(), affiliation: { picked: ["local"] }, academicUnit: "nowhere" }).problems[0].message).toBe("Choose a unit from the list.");
    // Others needs its words.
    expect(check({ ...proposal(), affiliation: { picked: ["other"] } }).problems[0].message).toMatch(/Others/);
    // No speakers, no speaker table.
    const quiet = check({ ...proposal(), hasSpeakers: "no", budget: { lines: [(proposal().budget as BudgetValue).lines[0]] } });
    expect(quiet.problems).toEqual([]);
    expect(quiet.answers).not.toHaveProperty("speakers");
    // One tick signs for everyone, collaborators included.
    expect(check({ ...proposal(), collaborators: [{ name: "Thomasian Nursing Society" }] }).problems).toEqual([]);
    expect(check({ ...proposal(), esign: [] }).problems.map((p) => `${p.field}: ${p.message}`)).toEqual(["esign: Tick each box to continue."]);
    // A meeting link only for phases that meet online.
    const phases = check(proposal()).answers.phases as Row[];
    expect([phases[0].link, phases[1].link]).toEqual(["https://meet.google.com/abc-defg-hij", undefined]);
    expect(shownSections(schema, proposal()).map((s) => s.id)).toEqual(["project", "people", "schedule", "plan", "budget", "safety", "sustain", "sign"]);
  });

  it("holds the paper form's rules", () => {
    const rule = (change: Answers) => check({ ...proposal(), ...change }).problems.map((p) => `${p.field}: ${p.message}`);
    expect(rule({ areas: { picked: ["health", "education", "sports"] } })).toEqual(["areas: Choose up to 2."]);
    expect(rule({ sdgs: [1, 2, 3, 4] })).toEqual(["sdgs: Choose up to 3 SDGs."]);
    expect(rule({ objective: "One. Two. Three. Four. Five. Six." })[0]).toMatch(/^objective: Keep it to 5 sentences/);
    expect(rule({ contacts: [{ name: "Ana", phone: "0917 123 4567", email: "ana@gmail.com" }] })).toEqual(["contacts: Use an @ust.edu.ph email address."]);
    expect(rule({ contacts: [{ name: "Ana", phone: "call me", email: "ana@ust.edu.ph" }] })[0]).toMatch(/phone number/);
    // One phase short: and what pointed at the missing one says so too.
    expect(rule({ phases: [(proposal().phases as Row[])[0]] })).toEqual(["phases: Add at least 2 phases.", "flow: Row 2: choose phase from the list.", "budget: A line belongs to a phase that’s gone. Check the budget."]);
    expect(rule({ evaluation: "http://forms.gle/x" })[0]).toMatch(/https/);
    expect(rule({ declarations: ["privacy"] })).toEqual(["declarations: Tick each box to continue."]);
    expect(signing({ signOfficers: [{ name: "Ben Cruz", on: "" }] }).problems[0].message).toMatch(/treasurer/);
    expect(sentenceCount("Dr. Santos visited St. Jude. It went well.")).toBe(2);
  });

  it("keeps contact name parts in capitals, requires first and last names, and allows no middle name", () => {
    const contact = { lastName: " Reyes ", firstName: " Ana ", middleName: "", name: "Ignored", phone: "0917 123 4567", email: "ana@ust.edu.ph" };
    const result = check({ ...proposal(), contacts: [contact] });
    expect(result.problems).toEqual([]);
    expect(result.answers.contacts).toEqual([{ ...contact, lastName: "REYES", firstName: "ANA", name: "ANA REYES" }]);
    expect(check({ ...proposal(), contacts: [{ ...contact, middleName: " Maria " }] }).answers.contacts).toMatchObject([{ middleName: "MARIA", name: "ANA MARIA REYES" }]);
    for (const [key, label] of [["lastName", "last"], ["firstName", "first"]]) {
      expect(check({ ...proposal(), contacts: [{ ...contact, [key]: " " }] }).problems).toEqual([{ section: "people", field: "contacts", message: `Enter the contact person’s ${label} name.` }]);
    }
    // Previously saved full names remain readable without guessing how to divide them.
    expect(check(proposal()).answers.contacts).toEqual([{ ...(proposal().contacts as object[])[0], name: "ANA REYES" }]);
  });

  it("writes every name in capitals, letters only", () => {
    const { answers, problems } = check({ ...proposal(), collaborators: [{ name: "Thomasian Nursing Society" }] });
    expect(problems).toEqual([]);
    expect(answers.lead).toBe("UST RED CROSS YOUTH");
    expect(answers.collaborators).toEqual([{ name: "THOMASIAN NURSING SOCIETY" }]);
    expect((answers.officers as { name: string }[]).map((p) => p.name)).toEqual(["BEN CRUZ", "CARLA DIAZ"]);
    expect((answers.emergencyContact as { name: string }[])[0].name).toBe("ANA REYES");
    expect((answers.speakers as Row[])[0].name).toEqual({ lastName: "SANTOS", firstName: "LEA", middleName: "" });
    expect((answers.flow as Row[])[0].lead).toEqual({ lastName: "REYES", firstName: "ANA", middleName: "" });
    expect((signing({ signLead: [{ name: "Maria Dela Cruz Santos", on: "" }] }).answers.signLead as { name: string }[])[0].name).toBe("MARIA DELA CRUZ SANTOS");
    // The project title isn't a name, and keeps its case.
    expect(answers.title).toBe("Kalinga sa Komunidad");
    const rule = (change: Answers) => check({ ...proposal(), ...change }).problems.map((p) => `${p.field}: ${p.message}`);
    const letters = "Use letters only, like JUAN DELA CRUZ.";
    expect(rule({ lead: "UST Red Cross Youth 2" })).toEqual([`lead: ${letters}`]);
    expect(rule({ officers: [{ name: "Ben Cruz", phone: "09171234567", email: "ben.cruz@ust.edu.ph" }, { name: "Carla_Diaz!", phone: "09177654321", email: "carla.diaz@ust.edu.ph" }] })).toEqual([`officers: ${letters}`]);
    const signRule = (change: Answers) => signing(change).problems.map((p) => `${p.field}: ${p.message}`);
    expect(signRule({ signLead: [{ name: "Ana Reyes 3", on: "" }] })).toEqual([`signLead: ${letters}`]);
    // Letters and spaces only: no full stops, hyphens or apostrophes either.
    for (const odd of ["Ma. Reyes", "Dela Cruz-Santos", "D’Souza", "O'Brien"]) expect(signRule({ signLead: [{ name: odd, on: "" }] })).toEqual([`signLead: ${letters}`]);
    expect(rule({ contacts: [{ lastName: "Peña", firstName: "Zoë", name: "", phone: "0917 123 4567", email: "ana@ust.edu.ph" }] })).toEqual([]);
    expect(rule({ speakers: [{ ...(proposal().speakers as Row[])[0], name: { lastName: "Santos", firstName: "Lea @" } }] })).toEqual(["speakers: Row 1: use letters only, like JUAN DELA CRUZ."]);
  });

  it("takes a response only with both statements of the current privacy notice", () => {
    expect(readConsent({ version: PRIVACY_VERSION, agreed: ["others", "mine", "extra"] })).toEqual({ version: PRIVACY_VERSION, agreed: ["mine", "others"] });
    expect(readConsent({ version: PRIVACY_VERSION, agreed: ["mine"] })).toBeNull();
    expect(readConsent({ version: "2020-01-01", agreed: ["mine", "others"] })).toBeNull();
    expect(readConsent(undefined)).toBeNull();
  });

  it("takes no emoji in any answer", () => {
    const { answers, problems } = check({
      ...proposal(),
      title: "Kalinga 🌱 sa Komunidad",
      objective: "Train fifty residents 👩‍⚕️ in first aid.\nAll of them. 🇵🇭",
      contacts: [{ lastName: "Reyes 😀", firstName: "Ana", name: "", phone: "0917 123 4567", email: "ana.reyes@ust.edu.ph" }],
    });
    expect(problems).toEqual([]);
    expect(answers.title).toBe("Kalinga sa Komunidad");
    expect(answers.objective).toBe("Train fifty residents in first aid.\nAll of them.");
    expect(answers.contacts).toMatchObject([{ lastName: "REYES", name: "ANA REYES" }]);
    expect(hasEmoji("1️⃣ ❤️ 👍🏽")).toBe(true);
    expect(noEmoji("Ñ É ü — 50% · ₱100")).toBe("Ñ É ü — 50% · ₱100");
    expect(lettersOnly("Juan2 Dela-Cruz!")).toBe("Juan DelaCruz");
  });

  it("asks every person's name in parts: last, first and an optional middle name", () => {
    const rule = (change: Answers) => check({ ...proposal(), ...change }).problems.map((p) => `${p.field}: ${p.message}`);
    const speaker = (proposal().speakers as Row[])[0];
    expect(rule({ speakers: [{ ...speaker, name: { lastName: "Santos", firstName: "" } }] })).toEqual(["speakers: Row 1: enter the speaker’s first name."]);
    expect(rule({ officers: [{ lastName: "Cruz", firstName: "", name: "", phone: "09171234567", email: "ben.cruz@ust.edu.ph" }, { lastName: "Diaz", firstName: "Carla", name: "", phone: "09177654321", email: "carla.diaz@ust.edu.ph" }] })).toEqual(["officers: Enter the president’s first name."]);
    expect(rule({ emergencyContact: [{ lastName: "", firstName: "Ana", name: "", phone: "0917 123 4567" }] })).toEqual(["emergencyContact: Enter the emergency contact’s last name."]);
    const signed = signing({ signLead: [{ lastName: "dela cruz", firstName: "juan", middleName: "santos", name: "", on: "" }] });
    expect(signed.answers.signLead).toMatchObject([{ lastName: "DELA CRUZ", firstName: "JUAN", middleName: "SANTOS", name: "JUAN SANTOS DELA CRUZ" }]);
    expect(signing({ signLead: [{ lastName: "Reyes", firstName: "", name: "REYES", on: "" }] }).problems.map((p) => `${p.field}: ${p.message}`)).toEqual(["signLead: Enter your first name."]);
    const honorarium = { key: "h", part: 1, category: "others", item: "Honorarium", qty: 1, rate: 2000, days: 1, source: "csf" };
    const paid = (recipientName: object) => check({ ...proposal(), budget: { lines: [...(proposal().budget as { lines: object[] }).lines, { ...honorarium, recipientName }] } });
    expect((paid({ lastName: "Santos", firstName: "Lea" }).answers.budget as { lines: { recipient?: string }[] }).lines.at(-1)).toMatchObject({ recipient: "LEA SANTOS", recipientName: { lastName: "SANTOS", firstName: "LEA" } });
    expect(paid({ lastName: "Santos", firstName: "" }).problems.map((p) => p.message)).toEqual(["Enter the honorarium recipient’s first name."]);
  });

  it("preserves transportation payment methods and drops unsupported values", () => {
    for (const method of ["cash", "ovrf", "unsupported"]) {
      const sent = proposal();
      const budget = sent.budget as BudgetValue;
      for (const line of budget.lines) Object.assign(line, { transportPayment: method });
      const saved = check(sent).answers.budget as BudgetValue;
      expect(saved.lines.some((line) => line.category === "transport")).toBe(true);
      for (const line of saved.lines) {
        expect(line.transportPayment).toBe(line.category === "transport" && method !== "unsupported" ? method : undefined);
      }
    }
  });

  it("allows emergency contact email to be empty and checks it when provided", () => {
    const sent = proposal();
    const person = (sent.emergencyContact as { email?: string; phone?: string }[])[0];
    expect(check(sent).problems).toEqual([]);
    person.email = "Emergency@Example.org";
    const saved = check(sent);
    expect(saved.problems).toEqual([]);
    expect(saved.answers.emergencyContact).toMatchObject([{ email: "emergency@example.org" }]);
    person.email = "invalid";
    expect(check(sent).problems.some((p) => p.field === "emergencyContact")).toBe(true);
    delete person.email;
    delete person.phone;
    expect(check(sent).problems.some((p) => p.field === "emergencyContact" && p.message.includes("phone"))).toBe(true);
  });

  it("keeps liquidation officer phones for existing email-only forms", () => {
    const sections = schema.sections.map((section) => ({
      ...section,
      fields: section.fields.map((f) => f.type === "people" && f.id === "officers" ? { ...f, ask: ["email"] as ["email"] } : f),
    }));
    const sent = proposal();
    const result = checkAnswers(sections, sent, ctx);
    expect(result.problems).toEqual([]);
    expect((result.answers.officers as { phone?: string }[]).map((p) => p.phone)).toEqual(["09171234567", "09177654321"]);
    delete (sent.officers as { phone?: string }[])[0].phone;
    expect(checkAnswers(sections, sent, ctx).problems.some((p) => p.field === "officers" && p.message.includes("phone"))).toBe(true);
  });

  it("saves separate phase dates without turning them into a range", () => {
    const sent = proposal();
    (sent.phases as Row[])[0].dates = { from: "", to: "", dates: ["2026-11-09", "2026-11-02", "2026-11-09", "2026-99-99"] };
    const { answers, problems } = check(sent);
    expect(problems).toEqual([]);
    expect((answers.phases as Row[])[0].dates).toEqual({ from: "", to: "", dates: ["2026-11-02", "2026-11-09"] });
    const csv = responsesCsv(schema, [{ ref: "CDP-0001", submittedAt: "2026-11-01T02:00:00.000Z", status: "received", answers, review: emptyReview() }], ctx);
    expect(csv).toContain("Date only - November 2, 2026; Date only - November 9, 2026");
    (sent.phases as Row[])[0].dates = { from: "", to: "", dates: [] };
    expect(check(sent).problems.some((p) => p.field === "phases")).toBe(true);
  });

  it("requires a Phase Title in both new and previously saved phase tables", () => {
    const sent = proposal();
    delete (sent.phases as Row[])[0].name;
    expect(check(sent).problems.some((p) => p.field === "phases" && p.message.includes("phase title"))).toBe(true);
    const legacy = schema.sections.map((section) => ({ ...section, fields: section.fields.map((field) => field.type === "table" && field.id === "phases" ? { ...field, columns: field.columns.map((col) => col.id === "name" ? { ...col, label: "Name", required: false } : col) } : field) }));
    expect(checkAnswers(legacy, sent, ctx).problems.some((p) => p.field === "phases" && p.message.includes("phase title"))).toBe(true);
  });

  it("saves ranges and individual dates together in the same phase", () => {
    const sent = proposal();
    const dates = { from: "", to: "", entries: [
      { mode: "range" as const, from: "2026-10-01", to: "2026-10-26" },
      { mode: "day" as const, from: "2026-11-05", to: "" },
    ] };
    (sent.phases as Row[])[0].dates = dates;
    const { answers, problems } = check(sent);
    expect(problems).toEqual([]);
    expect((answers.phases as Row[])[0].dates).toEqual(dates);
    const csv = responsesCsv(schema, [{ ref: "CDP-0001", submittedAt: "2026-11-01T02:00:00.000Z", status: "received", answers, review: emptyReview() }], ctx);
    expect(csv).toContain("Date range - October 1, 2026 - October 26, 2026; Date only - November 5, 2026");
  });

  it("rejects unfinished, invalid and reversed date entries", () => {
    for (const entry of [
      { mode: "range" as const, from: "2026-10-26", to: "2026-10-01" },
      { mode: "range" as const, from: "2026-10-01", to: "" },
      { mode: "day" as const, from: "2026-02-30", to: "" },
      { mode: "day" as const, from: "", to: "" },
    ]) {
      const sent = proposal();
      (sent.phases as Row[])[0].dates = { from: "", to: "", entries: [{ mode: "day", from: "2026-11-05", to: "" }, entry] };
      expect(check(sent).problems.some((p) => p.field === "phases")).toBe(true);
    }
  });

  it("uses full month-first dates and reads previously saved selections", () => {
    expect(dayLabel("2026-11-05")).toBe("November 5, 2026");
    expect(rangeLabel("2026-10-01", "2026-10-26")).toBe("October 1, 2026 - October 26, 2026");
    expect(dateEntries({ from: "2026-10-01", to: "2026-10-26" })).toEqual([{ mode: "range", from: "2026-10-01", to: "2026-10-26" }]);
    expect(dateEntries({ from: "2026-11-05", to: "2026-11-05" })).toEqual([{ mode: "day", from: "2026-11-05", to: "2026-11-05" }]);
    expect(datesLabel({ from: "", to: "", dates: ["2026-10-01", "2026-10-05"] })).toBe("Date only - October 1, 2026; Date only - October 5, 2026");
  });

  it("keeps fixed rates fixed and adds the budget up by source and phase", () => {
    const sent = proposal();
    (sent.budget as BudgetValue).lines[0].rate = 999;
    const { answers } = check(sent);
    const budget = answers.budget as BudgetValue;
    expect(budget.lines[0].rate).toBe(175);
    // Materials don't count days.
    expect(budget.lines[2].days).toBe(1);
    const spec = field("budget") as BudgetSpec;
    const t = budgetTotals(spec, budget, partsOf(spec, answers));
    expect(t.total).toBe(60 * 175 * 2 + 6000 + 10 * 450);
    expect(t.bySource).toEqual({ csf: 21000 + 4500, org: 6000, community: 0 });
    expect(t.byPart.map((p) => p.total)).toEqual([4500, 27000]);
    // The volunteer counterpart keeps its own rates and sources whatever is sent.
    const counterpart = answers.counterpart as BudgetValue;
    expect(counterpart.lines.map((l) => [l.item, l.rate, l.source, l.qty])).toEqual([
      ["Student volunteers", 500, "org", 20],
      ["Staff volunteers", 2000, "org", 0],
      ["Partner community volunteers", 1000, "community", 0],
    ]);
    // A line for a phase that isn't there is reported.
    const stray = proposal();
    (stray.budget as BudgetValue).lines.push({ key: "z", part: 5, category: "food", item: "Snack", qty: 5, rate: 100, days: 1, source: "csf" });
    expect(check(stray).problems.map((p) => p.field)).toEqual(["budget"]);
  });

  it("adds the CSF up by category from every phase, as the paper's summary of budget under the CSF", () => {
    const { answers, problems } = check({ ...proposal(), csfSummary: { food: "scdo" } });
    expect(problems).toEqual([]);
    // The proponent's summary only reads the budget: nothing is kept for it.
    expect(answers).not.toHaveProperty("csfSummary");
    const sum = sourceSummary(field("budget") as BudgetSpec, answers.budget as BudgetValue, "csf");
    expect(sum.categories.filter((c) => c.total).map((c) => [c.id, c.total, c.lines.length])).toEqual([
      ["food", 21000, 1],
      ["materials", 4500, 1],
    ]);
    expect(sum.total).toBe(25500);
    // The office's summary asks who each category with CSF is paid to.
    const office = schema.review!.fields.find((f) => f.id === "payableTo") as BudgetSummarySpec;
    expect([office.type, office.source, office.payee?.map((o) => o.value)]).toEqual(["budgetsummary", "csf", ["scdo", "purchasing", "supplier"]]);
    const all = fieldMap(schema.sections, schema.review!.fields);
    const reviewed = checkAnswers([{ id: "review", title: "Office", fields: [office] }], { payableTo: { food: "scdo", transport: "nobody", materials: "supplier" } }, ctx, answers, schema.sections.flatMap((x) => x.fields));
    expect(reviewed.answers.payableTo).toEqual({ food: "scdo", materials: "supplier" });
    const strict = { ...office, required: true };
    const full = { ...ctx, answers, fields: all };
    expect(moduleOf(strict).problem(strict, { food: "scdo" }, full)).toBe("Choose who the materials and supplies is paid to.");
    expect(moduleOf(strict).problem(strict, { food: "scdo", materials: "supplier" }, full)).toBe("");
    expect(moduleOf(office).text(office, { food: "scdo" }, full)).toBe("Food Php 21,000.00 to SCDO; Materials and supplies Php 4,500.00; total Php 25,500.00");
    // A summary must add up a budget that comes before it, and one of its sources.
    const budgetField = { id: "b", type: "budget", label: "Budget", sources: [{ id: "csf", label: "CSF" }], categories: [{ id: "food", label: "Food", custom: true }] };
    expect(readSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "s", type: "budgetsummary", label: "Sum", budget: "b", source: "csf" }, budgetField] }] })).toMatch(/doesn’t come before/);
    expect(readSchema({ sections: [{ id: "a", title: "A", fields: [budgetField, { id: "s", type: "budgetsummary", label: "Sum", budget: "b", source: "org" }] }] })).toMatch(/source the budget doesn’t have/);
  });

  it("moves what points at a phase when that phase goes", () => {
    const answers = afterRowRemoved(schema, proposal(), "phases", 0);
    expect((answers.budget as BudgetValue).lines.map((l) => [l.item, l.part])).toEqual([
      ["Lunch or dinner", 0],
      ["Coaster", 0],
    ]);
    expect((answers.flow as Row[]).map((r) => r.phase)).toEqual([undefined, "1"]);
  });

  it("signs off in order, by the stages a response goes through", () => {
    const uso = proposal();
    const local = { ...proposal(), affiliation: { picked: ["local"] }, academicUnit: "eng" };
    expect(standing(schema, uso, emptyReview()).stages.map((s) => s.id)).toEqual(["coordinator", "director"]);
    expect(standing(schema, local, emptyReview()).stages.map((s) => s.id)).toEqual(["adviser", "dean", "regent", "coordinator", "director"]);
    const signed = (decision: "approved" | "returned" | "declined") => ({ decision, name: "Signatory", on: "2026-11-20", by: "Office", at: "2026-11-20T00:00:00.000Z" });
    const review: ReviewState = { stages: { coordinator: signed("approved") }, fields: {} };
    expect(standing(schema, uso, review)).toMatchObject({ status: "in-review", next: { id: "director" } });
    expect(standing(schema, uso, { ...review, stages: { ...review.stages, director: signed("approved") } }).status).toBe("approved");
    expect(standing(schema, uso, { ...review, stages: { ...review.stages, director: signed("returned") } })).toMatchObject({ status: "returned", next: null });
    expect(standing(schema, uso, emptyReview()).status).toBe("received");
  });

  it("checks the office's own fields against the response", () => {
    const office = schema.review!.fields;
    const ok = checkAnswers([{ id: "review", title: "Office", fields: office }], { finalBudget: "25,500", budgetCode: " CSF-26-014 " }, ctx, proposal());
    expect(ok.problems).toEqual([]);
    expect(ok.answers).toEqual({ finalBudget: 25500, budgetCode: "CSF-26-014" });
  });

  it("sums responses up field by field", () => {
    const local = { ...proposal(), affiliation: { picked: ["local"] }, academicUnit: "eng", areas: { picked: ["health"] }, sdgs: [3] };
    // As kept: cleaned the way the server stores them.
    const stats = analyze(schema, [proposal(), local].map((answers, i) => ({ answers: check(answers).answers, status: "received" as const, submittedAt: new Date(Date.now() - i * 86_400_000).toISOString() })), ctx);
    expect([stats.total, stats.week]).toEqual([2, 2]);
    const of = (id: string) => stats.fields.find((f) => f.id === id)!;
    const areas = of("areas");
    expect(areas.kind === "bars" && areas.bars.find((b) => b.key === "health")!.count).toBe(2);
    const sdgs = of("sdgs");
    expect(sdgs.kind === "sdgs" && sdgs.sdgs[0]).toEqual({ n: 3, count: 2 });
    const unit = of("academicUnit");
    expect([unit.shown, unit.answered]).toEqual([1, 1]);
    const budget = of("budget");
    expect(budget.kind === "budget" && budget.sources.map((s) => s.sum)).toEqual([51000, 12000, 0]);
    const counts = of("participants");
    expect(counts.kind === "counts" && counts.sum).toBe(170);
  });

  it("exports a spreadsheet that can't run formulas", () => {
    const answers = { ...proposal(), title: "=HYPERLINK(\"http://x\")" };
    const csv = responsesCsv(schema, [{ ref: "CDP-0001", submittedAt: "2026-11-01T02:00:00.000Z", status: "received", answers, review: emptyReview() }], ctx);
    const [head, row] = csv.split("\r\n");
    expect(head.startsWith("Reference,Submitted,Status,Noted by (Student organization adviser)")).toBe(true);
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it("lets the people who run forms change them, in order, and keeps them in the store", () => {
    const w = world();
    const coord = w.person("Ana Reyes", "ana@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    const details = { title: COMDEV_PROPOSAL.title, kind: COMDEV_PROPOSAL.kind, description: COMDEV_PROPOSAL.description, reference: COMDEV_PROPOSAL.reference };
    // The Office's forms are its editors'.
    expect(execute(w.ctxFor(coord), { type: "form.save", ...details, schema }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.save", ...details }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.save", ...details, schema }).ok).toBe(true);
    const [form] = w.state.records.forms;
    expect([form.id, form.status, form.prefix, form.unitId]).toEqual(["FM-0001", "draft", "CDPP", undefined]);
    expect(form.code).toMatch(/^[a-z2-9]{8}$/);
    // A unit runs its own.
    expect(execute(w.ctxFor(coord), { type: "form.save", unitId: w.eng.id, title: "Seminar evaluation", kind: "evaluation", schema: { sections: [{ id: "s", title: "S", fields: [{ id: "q", type: "yesno", label: "Useful?" }] }] } }).ok).toBe(true);
    // Draft → open → closed → open; never back to draft, and only a draft can go.
    expect(execute(w.ctxFor(admin), { type: "form.status", id: form.id, status: "closed" }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.status", id: form.id, status: "open" }).ok).toBe(true);
    expect(execute(w.ctxFor(admin), { type: "form.status", id: form.id, status: "draft" }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.delete", id: form.id }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, ...details, schema }).message).toMatch(/only while a form is a draft/);
    // Details change at any time (the kind only while it's a draft); leaving a detail out clears it.
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, title: "ComDev Project Proposal", kind: "application", closesOn: "2026-12-15", prefix: "cdp" }).message).toMatch(/kind changes only while/);
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, title: "ComDev Project Proposal", kind: "proposal", closesOn: "2026-12-15", prefix: "cdp" }).ok).toBe(true);
    expect([form.title, form.closesOn, form.prefix, form.reference]).toEqual(["ComDev Project Proposal", "2026-12-15", "CDP", undefined]);
    // A copy starts as a draft, with its own link.
    expect(execute(w.ctxFor(admin), { type: "form.duplicate", id: form.id }).ok).toBe(true);
    const copy = w.state.records.forms[0];
    expect([copy.status, copy.title, copy.code === form.code, copy.closesOn]).toEqual(["draft", "Copy of ComDev Project Proposal", false, undefined]);
    expect(execute(w.ctxFor(coord), { type: "form.delete", id: copy.id }).ok).toBe(false);
    expect(execute(w.ctxFor(admin), { type: "form.delete", id: copy.id }).ok).toBe(true);
    // The store keeps a form as it was written.
    const back = fromRows(toRows(w.state)).records.forms;
    expect(back).toEqual(w.state.records.forms);
  });
});
