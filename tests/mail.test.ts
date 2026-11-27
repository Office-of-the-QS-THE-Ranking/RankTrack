import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { execute, makeCtx, GUEST, SYSTEM } from "@/lib/governance/engine";
import { emailTo, notify } from "@/lib/governance/engine/core";
import { remindDeadlines } from "@/lib/governance/engine/deadlines";
import { createUnit } from "@/lib/governance/engine/mutations";
import { updateNotificationPrefs } from "@/lib/governance/engine/profile";
import { decide, openRequest } from "@/lib/governance/engine/requests";
import { NOTIFY_KINDS, wantsNotice } from "@/lib/governance/notification-prefs";
import { UNIVERSITY } from "@/lib/governance/rbac";
import type { Reference } from "@/lib/reference";
import { renderEmail } from "@/lib/mail/layout";
import { composeEmail, fillText, isDirect, isRequired, mailDate, SAMPLE_VARS } from "@/lib/mail/messages";
import { resolveMail } from "@/lib/mail/recipients";
import { ref, world } from "./helpers";

const ORIGIN = "https://hub.example";

/** A world with the Office, its Director, a second specialist, and a coordinator in Engineering. */
function office() {
  const w = world();
  const hub = createUnit(makeCtx(w.state, SYSTEM, ref), { name: "Office of QS/THE Rankings", code: "RANKINGS-OFFICE", kind: "Office", parentId: w.university.id });
  const director = w.person("Maria Santos", "director@ust.edu.ph", ROLE.superAdmin, hub.id, false, UNIVERSITY, "director");
  const specialist = w.person("Ramon Cruz", "specialist@ust.edu.ph", ROLE.superAdmin, hub.id, false, UNIVERSITY, "specialist");
  const coordinator = w.person("Ana Reyes", "ana@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const template = (id: string) => w.state.config.templates.find((t) => t.id === id)!;
  return { ...w, hub, director, specialist, coordinator, template };
}

describe("the email layout", () => {
  const content = composeEmail({ templateId: "tpl-access-received", subject: "We received your access request", body: "{name}, your request is with the Office.\n\nKeep your reference code.", vars: SAMPLE_VARS, href: "/signin?track=RQ-0042" }, ORIGIN).content;

  it("sets the reference, the facts, the track and the button, and sends a plain-text copy", () => {
    const { html, text } = renderEmail(content, { origin: ORIGIN, office: { email: "rankings.office@ust.edu.ph" } });
    expect(html).toContain("RQ-0042");
    expect(html).toContain(`${ORIGIN}/brand/ust-seal-reverse.png`);
    expect(html).toContain(`href="${ORIGIN}/signin?track=RQ-0042"`);
    expect(html).toContain("Under review");
    expect(html).not.toMatch(/<script/i);
    expect(text).toContain("Reference code: RQ-0042");
    expect(text).toContain(`Track your request: ${ORIGIN}/signin?track=RQ-0042`);
    expect(text).toContain("rankings.office@ust.edu.ph");
  });

  it("escapes everything a person typed, so a name or a note can never become markup", () => {
    const { html } = renderEmail({ ...content, heading: `<img src=x onerror=alert(1)>`, paragraphs: [`"><script>alert(1)</script>`], note: { label: "From the Office", text: "<b>bold</b>" }, facts: [["Unit", "<i>x</i>"]] }, { origin: ORIGIN });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  it("drops a button whose address isn't a plain web address", () => {
    const { html, text } = renderEmail({ ...content, cta: { label: "Open", href: "javascript:alert(1)" } }, { origin: ORIGIN });
    expect(html).not.toContain("javascript:");
    expect(text).not.toContain("javascript:");
  });

  it("sets the masthead in type alone when the Hub has no public address", () => {
    const { html } = renderEmail(content, { origin: null });
    expect(html).not.toContain("<img");
    expect(html).toContain("PRESTIGE");
  });
});

describe("messages", () => {
  it("fill placeholders, and drop one with no value rather than show it in braces", () => {
    expect(fillText("{name}, {missing} your request {reference} was approved.", { name: "Ana", reference: "RQ-0001" })).toBe("Ana, your request RQ-0001 was approved.");
  });

  it("leave out facts with no value, the note with no words, and the button with nowhere to go", () => {
    const { content } = composeEmail({ templateId: "tpl-access-declined", subject: "About your access request", body: "{name}, your request {reference} was not approved.", vars: { name: "Ana", reference: "RQ-0002", comment: "" } }, null);
    expect(content.note).toBeUndefined();
    expect(content.cta).toBeUndefined();
    expect(content.reference).toEqual({ label: "Reference code", value: "RQ-0002" });
    const approved = composeEmail({ templateId: "tpl-access-approved", subject: "s", body: "b", vars: { name: "Ana", reference: "RQ-0002", role: "Student", unit: "", email: "ana@ust.edu.ph" }, href: "/signin" }, ORIGIN).content;
    expect(approved.facts).toEqual([
      ["Role", "Student"],
      ["Sign in with", "ana@ust.edu.ph"],
    ]);
    expect(approved.cta).toEqual({ label: "Sign in", href: `${ORIGIN}/signin` });
  });

  it("quote the Office's note on a declined request", () => {
    const { content } = composeEmail({ templateId: "tpl-access-declined", subject: "s", body: "b", vars: { comment: "The affiliation could not be confirmed." } }, ORIGIN);
    expect(content.note).toEqual({ label: "From the Office", text: "The affiliation could not be confirmed." });
  });

  it("know which are receipts and account notices, and which go to an address", () => {
    expect(isRequired("tpl-access-received")).toBe(true);
    expect(isRequired("tpl-invite")).toBe(true);
    expect(isRequired("tpl-submitted")).toBe(false);
    expect(isDirect("tpl-access-declined")).toBe(true);
    expect(isDirect("tpl-invite")).toBe(false);
  });

  it("write dates as Manila reads them", () => {
    expect(mailDate("2026-11-14T01:30:00.000Z")).toBe("14 Nov 2026, 09:30");
    expect(mailDate("2026-11-14T18:05:00.000Z")).toBe("15 Nov 2026, 02:05");
    expect(mailDate("2026-11-30")).toBe("30 Nov 2026");
  });

  it("every template the notification settings list is one the Hub ships or the analytics engine adds", () => {
    const w = world();
    const shipped = new Set(w.state.config.templates.map((t) => t.id));
    for (const id of NOTIFY_KINDS.flatMap((k) => k.templates)) expect(shipped.has(id) || id.startsWith("tpl-data-"), id).toBe(true);
  });
});

describe("who gets an email", () => {
  it("a notice posts to the bell, queues an email, or both, as its template's channel says", () => {
    const w = office();
    const ctx = w.ctxFor(w.coordinator);
    w.template("tpl-submitted").channel = "Email and in-app";
    notify(ctx, "office", "tpl-submitted", { unit: "Engineering", title: "Rainwater" }, "/admin/unit-submissions");
    expect(ctx.mail).toHaveLength(1);
    expect(w.state.notices).toHaveLength(1);
    w.template("tpl-submitted").channel = "In-app";
    notify(ctx, "office", "tpl-submitted", { unit: "Engineering", title: "Second" }, "/admin/unit-submissions");
    expect(ctx.mail).toHaveLength(1);
    expect(w.state.notices).toHaveLength(2);
    w.template("tpl-submitted").channel = "Email";
    notify(ctx, "office", "tpl-submitted", { unit: "Engineering", title: "Third" }, "/admin/unit-submissions");
    expect(ctx.mail).toHaveLength(2);
    expect(w.state.notices).toHaveLength(2);
    w.template("tpl-submitted").enabled = false;
    notify(ctx, "office", "tpl-submitted", { unit: "Engineering", title: "Fourth" }, "/admin/unit-submissions");
    expect(ctx.mail).toHaveLength(2);
  });

  it("the Office is everyone who would see the notice, less whoever caused it", () => {
    const w = office();
    const ctx = w.ctxFor(w.director);
    notify(ctx, "office", "tpl-submitted", { unit: "Engineering", title: "Rainwater" }, "/admin/unit-submissions");
    const jobs = resolveMail(w.state, ctx.mail, w.director.id, ctx.day);
    expect(jobs.map((j) => j.toEmail)).toEqual(["specialist@ust.edu.ph"]);
    expect(jobs[0]).toMatchObject({ templateId: "tpl-submitted", accountId: w.specialist.id, required: false, label: "New submission" });
  });

  it("a unit is the people who contribute for it, and only while their account is active", () => {
    const w = office();
    const other = w.person("Ben Lim", "ben@ust.edu.ph", ROLE.coordinator, w.sci.id);
    const ctx = w.ctxFor(w.director);
    notify(ctx, `unit:${w.eng.id}`, "tpl-revision", { title: "Rainwater", comment: "Add the resolution." }, "/portal/submit");
    expect(resolveMail(w.state, ctx.mail, w.director.id, ctx.day).map((j) => j.toEmail)).toEqual(["ana@ust.edu.ph"]);
    w.coordinator.status = "Suspended";
    expect(resolveMail(w.state, ctx.mail, w.director.id, ctx.day)).toEqual([]);
    expect(other.status).toBe("Active");
  });

  it("people choose: email off stops notifications, a kind switched off stops that kind, account notices always go", () => {
    const w = office();
    const ctx = w.ctxFor(w.director);
    notify(ctx, w.coordinator.id, "tpl-accepted", { title: "Rainwater", count: 2 }, "/portal/submit");
    notify(ctx, w.coordinator.id, "tpl-suspended", { name: "Ana", reason: "Policy." }, "/signin");
    const to = () => resolveMail(w.state, ctx.mail, w.director.id, ctx.day).map((j) => j.templateId);
    expect(to()).toEqual(["tpl-accepted", "tpl-suspended"]);
    w.coordinator.notifyPrefs = { off: ["reviews:email"] };
    expect(to()).toEqual(["tpl-suspended"]);
    w.coordinator.notifyPrefs = { email: false };
    expect(to()).toEqual(["tpl-suspended"]);
  });

  it("email is on until someone switches it off, and the choice is kept as the exception", () => {
    const w = office();
    expect(wantsNotice(undefined, "tpl-accepted", "email")).toBe(true);
    expect(wantsNotice({ email: false }, "tpl-accepted", "email")).toBe(false);
    expect(wantsNotice({ email: false }, "tpl-invite", "email")).toBe(true);
    expect(updateNotificationPrefs(w.ctxFor(w.coordinator), { email: false, off: [] }).ok).toBe(true);
    expect(w.coordinator.notifyPrefs).toEqual({ email: false });
    expect(updateNotificationPrefs(w.ctxFor(w.coordinator), { email: true, off: [] }).ok).toBe(true);
    expect(w.coordinator.notifyPrefs).toBeUndefined();
  });

  it("an address with no account is emailed directly, once per event", () => {
    const w = office();
    const ctx = makeCtx(w.state, GUEST, ref);
    emailTo(ctx, { email: "Applicant@Example.org", name: "Lee Tan" }, "tpl-access-received", { name: "Lee Tan", reference: "RQ-0009" }, "/signin?track=RQ-0009", "access-received:RQ-0009");
    emailTo(ctx, { email: "not an address" }, "tpl-access-received", { name: "x" });
    const jobs = resolveMail(w.state, ctx.mail, "guest", ctx.day);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ toEmail: "applicant@example.org", toName: "Lee Tan", required: true, dedupe: "access-received:RQ-0009|applicant@example.org" });
    expect(jobs[0].accountId).toBeUndefined();
  });

  it("a template switched off, or set to the bell only, sends nothing", () => {
    const w = office();
    const ctx = w.ctxFor(w.director);
    ctx.mail.push({ to: "office", templateId: "tpl-published", vars: {} });
    w.template("tpl-published").channel = "In-app";
    expect(resolveMail(w.state, ctx.mail, "x", ctx.day)).toEqual([]);
    w.template("tpl-published").channel = "Email";
    w.template("tpl-published").enabled = false;
    expect(resolveMail(w.state, ctx.mail, "x", ctx.day)).toEqual([]);
  });
});

describe("events that email", () => {
  const request = (w: ReturnType<typeof office>, by: "guest" | "director") => {
    const ctx = by === "guest" ? makeCtx(w.state, GUEST, ref) : w.ctxFor(w.director);
    return openRequest(ctx, "account-access", { kind: "account-access", name: "Lee Tan", email: "lee@ust.edu.ph", unitId: w.eng.id, roleId: ROLE.coordinator, title: "Coordinator" }, "Account for Lee Tan", "");
  };
  /** Approve every step, each by a different approver, as separation of duties asks. */
  const approve = (w: ReturnType<typeof office>, id: string) => {
    const mail = [];
    for (const who of [w.director, w.specialist]) {
      if (w.state.requests.find((r) => r.id === id)?.status !== "Pending") break;
      const ctx = w.ctxFor(who);
      expect(decide(ctx, id, "Approved").ok, who.name).toBe(true);
      mail.push(...ctx.mail);
    }
    return mail;
  };

  it("an approved access request tells the applicant they can sign in", () => {
    const w = office();
    const req = request(w, "guest");
    const mail = approve(w, req.id);
    expect(w.state.requests.find((r) => r.id === req.id)?.status).toBe("Approved");
    const sent = mail.find((m) => m.templateId === "tpl-access-approved");
    expect(sent).toMatchObject({ to: { email: "lee@ust.edu.ph", name: "Lee Tan" }, href: "/signin", dedupe: `access-approved:${req.id}` });
    expect(sent?.vars).toMatchObject({ reference: req.id, role: "Coordinator", unit: "Faculty of Engineering" });
  });

  it("a declined access request carries the approver's note", () => {
    const w = office();
    const req = request(w, "guest");
    const ctx = w.ctxFor(w.director);
    expect(decide(ctx, req.id, "Rejected", "The unit could not confirm this.").ok).toBe(true);
    const sent = ctx.mail.find((m) => m.templateId === "tpl-access-declined");
    expect(sent?.vars).toMatchObject({ reference: req.id, comment: "The unit could not confirm this." });
  });

  it("an account an administrator asked for is an invitation once approved, and silent if declined", () => {
    const w = office();
    const third = w.person("Carla Uy", "carla@ust.edu.ph", ROLE.superAdmin, w.hub.id, false, UNIVERSITY, "specialist");
    const req = request(w, "director");
    const mail = [];
    for (const who of [w.specialist, third]) {
      if (w.state.requests.find((r) => r.id === req.id)?.status !== "Pending") break;
      const ctx = w.ctxFor(who);
      expect(decide(ctx, req.id, "Approved").ok, who.name).toBe(true);
      mail.push(...ctx.mail);
    }
    expect(mail.find((m) => m.templateId === "tpl-invite")?.vars).toMatchObject({ name: "Lee Tan", inviter: "Maria Santos" });
    expect(mail.some((m) => m.templateId === "tpl-access-approved")).toBe(false);

    const again = office();
    const second = request(again, "director");
    const ctx = again.ctxFor(again.specialist);
    expect(decide(ctx, second.id, "Rejected", "Not this term.").ok).toBe(true);
    expect(ctx.mail.some((m) => typeof m.to !== "string")).toBe(false);
  });

  it("suspending an account tells its holder why", () => {
    const w = office();
    const ctx = w.ctxFor(w.director);
    expect(execute(ctx, { type: "account.status", id: w.coordinator.id, status: "Suspended", reason: "Left the faculty" }).ok).toBe(true);
    expect(ctx.mail).toEqual([{ to: w.coordinator.id, templateId: "tpl-suspended", vars: { name: "Ana Reyes", reason: "Left the faculty." }, href: "/signin", dedupe: undefined }]);
    // and it reaches them though the account is no longer active
    expect(resolveMail(w.state, ctx.mail, w.director.id, ctx.day).map((j) => j.toEmail)).toEqual(["ana@ust.edu.ph"]);
  });

  it("a submission sends the Office a notice and the submitter a receipt", () => {
    const w = office();
    const ctx = w.ctxFor(w.coordinator);
    const r = execute(ctx, {
      type: "evidence.submit",
      unitSlug: w.eng.id,
      input: { title: "Rainwater reuse", type: "Operational data", academicYear: "2025–2026", term: "First term", summary: "<p>We retrofitted gutters on three buildings.</p>", result: "4,820 cubic metres reused", beneficiaries: "Residents", level: 3, sdgs: [6], files: [], url: "https://www.ust.edu.ph/sustainability", mappedTo: ["THE Impact · SDG 6"] },
    });
    expect(r.ok).toBe(true);
    const jobs = resolveMail(w.state, ctx.mail, w.coordinator.id, ctx.day);
    const receipt = jobs.find((j) => j.templateId === "tpl-receipt");
    expect(receipt).toMatchObject({ toEmail: "ana@ust.edu.ph", href: `/portal/submit#${r.data}` });
    expect(receipt?.vars).toMatchObject({ reference: r.data, unit: "Faculty of Engineering", title: "Rainwater reuse" });
    expect(jobs.filter((j) => j.templateId === "tpl-submitted").map((j) => j.toEmail).sort()).toEqual(["director@ust.edu.ph", "specialist@ust.edu.ph"]);
    // the receipt is an email only: nothing is added to the submitter's own bell
    expect(w.state.notices.some((n) => n.templateId === "tpl-receipt")).toBe(false);
  });

  it("the Office is reminded on the days a ranking is about to close, once", () => {
    const w = office();
    const rankings = { ...ref, rankings: [{ slug: "qs-wur", name: "QS World University Rankings", short: "QS WUR", family: "qs", deadline: "2026-12-01" }], families: { qs: { key: "qs", body: "QS" } } } as unknown as Reference;
    w.state.config.bodies = [{ key: "QS", name: "QS", short: "QS", enabled: true, website: "https://qs.com" }];
    w.state.config.rankings = [{ slug: "qs-wur", enabled: true, public: true, deadline: "2026-12-01" }];
    w.state.config.dashboard.deadlineWarningDays = 21;
    const on = (today: string) => {
      const ctx = makeCtx(w.state, SYSTEM, rankings);
      remindDeadlines(ctx, today);
      return ctx.mail;
    };
    expect(on("2026-11-09")).toEqual([]);
    const week = on("2026-11-24");
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ to: "office", templateId: "tpl-deadline", href: "/admin/rankings/qs-wur", dedupe: "deadline:qs-wur:2026-12-01:7" });
    expect(week[0].vars).toEqual({ ranking: "QS World University Rankings", days: "7 days", date: "1 Dec 2026" });
    expect(on("2026-11-10")[0]?.vars.days).toBe("21 days");
    expect(on("2026-11-30")[0]?.vars.days).toBe("1 day");
    w.state.config.rankings[0].enabled = false;
    expect(on("2026-11-24")).toEqual([]);
  });
});

describe("message settings", () => {
  it("the Office chooses how a message is sent; one for people without an account stays email only", () => {
    const w = office();
    const ctx = w.ctxFor(w.director);
    expect(execute(ctx, { type: "config.template", id: "tpl-published", channel: "Email and in-app" }).ok).toBe(true);
    expect(w.template("tpl-published").channel).toBe("Email and in-app");
    const refused = execute(ctx, { type: "config.template", id: "tpl-access-received", channel: "In-app" });
    expect(refused.ok).toBe(false);
    expect(w.template("tpl-access-received").channel).toBe("Email");
    expect(execute(ctx, { type: "config.template", id: "tpl-published", channel: "Fax" as never }).ok).toBe(false);
  });
});

describe("the mail migration", () => {
  const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/20261114140000_mail.sql"), "utf8");
  it("ships the same messages as the seed, under the same names", () => {
    const w = world();
    for (const id of ["tpl-access-received", "tpl-access-approved", "tpl-access-declined", "tpl-receipt", "tpl-form-receipt"]) {
      const t = w.state.config.templates.find((x) => x.id === id)!;
      expect(t.channel, id).toBe("Email");
      expect(sql, id).toContain(`'${id}', '${t.name}', '${t.event}'`);
      expect(sql, id).toContain(`'${t.subject}'`);
    }
  });
  it("keeps the queue and the key from anyone but the Hub's own server", () => {
    expect(sql).toMatch(/alter table public\.mail_settings enable row level security/);
    expect(sql).toMatch(/alter table public\.mail_outbox enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.mail_settings, public\.mail_outbox from anon, authenticated/);
  });
});
