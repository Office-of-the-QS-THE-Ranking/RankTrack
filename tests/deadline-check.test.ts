import { describe, expect, it } from "vitest";
import { actorFor, execute, makeCtx } from "@/lib/governance/engine";
import { recordCheck } from "@/lib/governance/engine/deadlines";
import { ROLE } from "@/lib/governance/catalog";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { DEADLINE_LABEL, parseDay, readSentence, readTable, readWatch, type Reading } from "@/lib/governance/deadline-read";
import type { DeadlineSource, Reference } from "@/lib/reference";
import { world } from "./helpers";

const TODAY = "2026-10-27";

/* Shaped like the live pages (October 2026): QS's Key Dates table, THE's participation page and article, GreenMetric's guideline list. */
const QS: DeadlineSource = {
  id: "qs-cycle",
  body: "QS",
  name: "QS help centre: Rankings Cycle",
  page: "https://support.qs.com/hc/en-gb/articles/15441557138716",
  fetchUrl: "https://support.qs.com/api/v2/help_center/en-gb/articles/15441557138716.json",
  kind: "table",
  pattern: null,
  rules: [
    { row: "Survey Contacts Submission window 1", slugs: ["qs-wur"], label: "Survey contacts, first window closes" },
    { row: "Institution Data", slugs: ["qs-wur", "qs-subject"], deadline: true },
    { row: "Sustainability Data", slugs: ["qs-sustainability"], deadline: true },
  ],
  note: "",
};
const QS_BODY = `<table><tbody>
<tr><td> </td><td><strong>Date Starts</strong></td><td><strong>Date Ends</strong></td></tr>
<tr><td><a href="#"><strong>Survey Contacts Submission</strong></a> window 1</td><td>15 September 2026</td><td>27 November 2026</td></tr>
<tr><td><a href="#"><strong>Academic Survey</strong></a></td><td>November 2026</td><td>Early March 2027</td></tr>
<tr><td><strong>Institution Data</strong></td><td>15 September 2026</td><td>5 February 2027</td></tr>
<tr><td><strong>Sustainability Data</strong></td><td>6 January 2027</td><td>15 April 2027</td></tr>
</tbody></table>`;

const THE_WUR: DeadlineSource = {
  id: "the-wur",
  body: "THE",
  name: "THE: How to participate",
  page: "https://www.timeshighereducation.com/how-participate-times-higher-education-rankings",
  fetchUrl: "https://www.timeshighereducation.com/how-participate-times-higher-education-rankings",
  kind: "sentence",
  pattern: "World University Rankings:[\\s\\S]{0,2000}?portal will be open from [^.]*? to (?<due>\\d{1,2} [A-Za-z]+(?: \\d{4})?)",
  rules: [{ slugs: ["the-wur", "the-subject"], deadline: true }],
  note: "",
};
const THE_PAGE = `<script>var x = "portal will be open from May to 1 June";</script>
<h3>How to participate in the Times Higher Education World University Rankings:</h3>
<ul><li>Publish at least 1,000 papers</li></ul>
<p>The portal will be open from January to <strong>30 March</strong>.</p>
<h3>How to participate in the Times Higher Education Sustainability Impact Ratings:</h3>
<p>The portal will be open from September to mid-November.</p>`;

const THE_IMPACT: DeadlineSource = { ...THE_WUR, id: "the-impact", pattern: "required data by (?<due>\\d{1,2} [A-Za-z]+ \\d{4})", rules: [{ slugs: ["the-impact"], deadline: true }] };
const THE_ARTICLE = `<p>To participate in the ratings, which will be published in June next year, university members subscribed to the network must provide the required data by 9&nbsp;November 2026.</p>`;

const GM: DeadlineSource = { ...THE_WUR, id: "greenmetric", kind: "watch", pattern: "guidelines/(\\d{4})/english", rules: [{ slugs: ["greenmetric"] }] };
const GM_PAGE = `<a href="https://uigreenmetric.com/resources/university/guidelines/2026/english">English</a>
<a href="https://uigreenmetric.com/resources/university/guidelines/2026/indonesian">Indonesian</a>
<a href="https://uigreenmetric.com/resources/university/guidelines/2025/english">English</a>`;

describe("reading dates", () => {
  it("reads a day with or without a year, and refuses vague or impossible ones", () => {
    expect(parseDay("27 November 2026", TODAY)).toBe("2026-11-27");
    expect(parseDay("15 Sep 2026.", TODAY)).toBe("2026-09-15");
    expect(parseDay("30 March", TODAY)).toBe("2027-03-30");
    expect(parseDay("30 October", TODAY)).toBe("2026-10-30");
    expect(parseDay("Early March 2027", TODAY)).toBeNull();
    expect(parseDay("November 2026", TODAY)).toBeNull();
    expect(parseDay("31 February 2027", TODAY)).toBeNull();
  });

  it("reads the rows of QS's Key Dates table it is told to, at their closing date", () => {
    const { found, missing } = readTable(QS_BODY, QS, TODAY);
    expect(missing).toEqual([]);
    expect(found.map((f) => [f.slug, f.target, f.label, f.due])).toEqual([
      ["qs-wur", "milestone", "Survey contacts, first window closes", "2026-11-27"],
      ["qs-wur", "deadline", DEADLINE_LABEL, "2027-02-05"],
      ["qs-subject", "deadline", DEADLINE_LABEL, "2027-02-05"],
      ["qs-sustainability", "deadline", DEADLINE_LABEL, "2027-04-15"],
    ]);
  });

  it("reports a row the table no longer has", () => {
    const { found, missing } = readTable(QS_BODY.replace("Institution Data", "Institutional data"), QS, TODAY);
    expect(missing).toEqual(["Institution Data"]);
    expect(found.some((f) => f.target === "deadline" && f.slug === "qs-wur")).toBe(false);
  });

  it("reads THE's portal sentence from the right section, not from scripts", () => {
    const { found } = readSentence(THE_PAGE, THE_WUR, TODAY);
    expect(found.map((f) => [f.slug, f.due])).toEqual([
      ["the-wur", "2027-03-30"],
      ["the-subject", "2027-03-30"],
    ]);
    expect(found[0].quote).toBe("The portal will be open from January to 30 March.");
    expect(readSentence(THE_ARTICLE, THE_IMPACT, TODAY).found[0].due).toBe("2026-11-09");
  });

  it("finds nothing when the sentence no longer gives a day", () => {
    expect(readSentence(THE_PAGE.replace("30 March", "late March"), THE_WUR, TODAY).found).toEqual([]);
  });

  it("lists what a watched page shows", () => {
    expect(readWatch(GM_PAGE, GM)).toEqual(["2025", "2026"]);
  });
});

/* The engine side: findings, applying, dismissing and setting by hand. */
function setup() {
  const w = world();
  const rankings = [
    { slug: "qs-wur", short: "QS WUR", name: "QS World University Rankings", family: "QS", deadline: "2027-01-30" },
    { slug: "qs-subject", short: "QS by Subject", name: "QS WUR by Subject", family: "QS", deadline: "2027-01-30" },
  ];
  const ref = { directory: [], rankings, deadlineSources: [QS], families: {} } as unknown as Reference;
  const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  const coordinator = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const as = (a: typeof admin) => makeCtx(w.state, actorFor(w.state, a), ref);
  const reading: Reading = { sourceId: "qs-cycle", url: QS.page, status: "Read", signature: "abc", note: "", found: readTable(QS_BODY, QS, TODAY).found.filter((f) => f.slug !== "qs-sustainability") };
  return { w, admin, coordinator, as, reading, config: w.state.config };
}

describe("the deadline check", () => {
  it("raises each date that differs from the Hub's once, and tells the Office", () => {
    const { as, admin, reading, config, w } = setup();
    const r = recordCheck(as(admin), [reading]);
    expect(r.ok).toBe(true);
    expect(config.findings.map((f) => [f.slug, f.label, f.due, f.state])).toEqual(
      expect.arrayContaining([
        ["qs-wur", DEADLINE_LABEL, "2027-02-05", "New"],
        ["qs-subject", DEADLINE_LABEL, "2027-02-05", "New"],
        ["qs-wur", "Survey contacts, first window closes", "2026-11-27", "New"],
      ]),
    );
    expect(w.state.notices.some((n) => n.to === "office" && n.text.startsWith("QS WUR:"))).toBe(true);
    expect(config.watch[0]).toMatchObject({ id: "qs-cycle", status: "Read", hash: "abc" });
    recordCheck(as(admin), [reading]);
    expect(config.findings).toHaveLength(3);
  });

  it("applies a date as the ranking's deadline, noting where it came from", () => {
    const { as, admin, reading, config } = setup();
    recordCheck(as(admin), [reading]);
    const f = config.findings.find((x) => x.slug === "qs-wur" && x.target === "deadline")!;
    expect(execute(as(admin), { type: "deadline.apply", id: f.id }).ok).toBe(true);
    expect(config.rankings.find((r) => r.slug === "qs-wur")).toMatchObject({ deadline: "2027-02-05", deadlineSource: "Automatic", deadlineUrl: QS.page });
    expect(f.state).toBe("Applied");
    const m = config.findings.find((x) => x.target === "milestone")!;
    execute(as(admin), { type: "deadline.apply", id: m.id });
    expect(config.calendar).toEqual([expect.objectContaining({ slug: "qs-wur", label: "Survey contacts, first window closes", due: "2026-11-27", source: "Automatic" })]);
  });

  it("doesn't raise a dismissed date again", () => {
    const { as, admin, reading, config } = setup();
    recordCheck(as(admin), [reading]);
    for (const f of [...config.findings]) execute(as(admin), { type: "deadline.dismiss", id: f.id });
    recordCheck(as(admin), [reading]);
    expect(config.findings.filter((f) => f.state === "New")).toHaveLength(0);
  });

  it("keeps a date set by hand, with its other dates", () => {
    const { as, admin, config } = setup();
    const r = execute(as(admin), { type: "deadline.set", slug: "qs-wur", deadline: "2027-02-10", entries: [{ label: "Survey contacts close", due: "2026-12-01" }] });
    expect(r.ok).toBe(true);
    expect(config.rankings.find((x) => x.slug === "qs-wur")).toMatchObject({ deadline: "2027-02-10", deadlineSource: "Manual", deadlineBy: "Maria Santos" });
    expect(config.calendar.map((e) => [e.label, e.due, e.source])).toEqual([["Survey contacts close", "2026-12-01", "Manual"]]);
    const kept = config.calendar[0].id;
    execute(as(admin), { type: "deadline.set", slug: "qs-wur", entries: [] });
    expect(config.calendar.some((e) => e.id === kept)).toBe(false);
  });

  it("refuses bad dates, a second deadline row and people who may not change deadlines", () => {
    const { as, admin, coordinator } = setup();
    expect(execute(as(admin), { type: "deadline.set", slug: "qs-wur", deadline: "next week" }).ok).toBe(false);
    expect(execute(as(admin), { type: "deadline.set", slug: "qs-wur", entries: [{ label: DEADLINE_LABEL, due: "2027-01-01" }] }).ok).toBe(false);
    const denied = execute(as(coordinator), { type: "deadline.set", slug: "qs-wur", deadline: "2027-02-10" });
    expect(denied.ok).toBe(false);
    expect(recordCheck(as(coordinator), []).ok).toBe(false);
  });
});
