import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { execute } from "@/lib/governance/engine";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";
import { formWhoFor, formWhoOf, statePack, stateUnpack } from "@/lib/governance/server/email-verify";
import { COPY_TOKEN, copyEmail, formBack, initials, markSaved, newBook, patchOf, peerColor, peerLocation, profileAvatar, takeLive, takeRemote, unsaved } from "@/lib/forms/copies";
import { fieldMap, moduleOf, type FormContext } from "@/lib/forms/modules";
import { COMDEV_PROPOSAL } from "@/lib/forms/templates/comdev-proposal";
import type { Answers } from "@/lib/forms/types";
import { world } from "./helpers";

process.env.HUB_VERIFY_SECRET ??= "test-secret";

describe("jumping to a collaborator", () => {
  const sections = [{ fields: [{ id: "title" }, { id: "affiliation" }] }, { fields: [{ id: "contacts" }] }];

  it("finds the active question, including when the reported step is stale", () => {
    expect(peerLocation({ step: 0, field: "contacts" }, sections)).toEqual({ step: 1, field: "contacts" });
    expect(peerLocation({ field: "affiliation" }, sections)).toEqual({ step: 0, field: "affiliation" });
  });

  it("opens the reported step when no visible question is selected", () => {
    expect(peerLocation({ step: 1, field: null }, sections)).toEqual({ step: 1, field: null });
    expect(peerLocation({ step: 0, field: "hidden-question" }, sections)).toEqual({ step: 0, field: null });
  });

  it("opens the privacy notice without following an old question", () => {
    expect(peerLocation({ step: -1, field: "contacts" }, sections)).toEqual({ step: -1, field: null });
  });

  it("does not navigate on missing or invalid presence", () => {
    for (const step of [undefined, NaN, Infinity, -2, 0.5, 2]) expect(peerLocation({ step }, sections)).toBeNull();
    expect(peerLocation({ field: "hidden-question" }, sections)).toBeNull();
  });
});

const fields = fieldMap(COMDEV_PROPOSAL.schema.sections);
const clean = (id: string, raw: unknown, draft: boolean) => {
  const spec = fields.get(id)!;
  const ctx: FormContext = { units: [], answers: {}, fields, draft };
  return moduleOf(spec).clean(spec, raw, ctx);
};

describe("team copies: saving by question", () => {
  it("sends only what changed here", () => {
    const book = newBook({ title: "Kalinga", lead: "UST Red Cross" });
    const local: Answers = { title: "Kalinga sa Komunidad", lead: "UST Red Cross", venue: "Brgy. 630" };
    expect(unsaved(local, book).sort()).toEqual(["title", "venue"]);
    const cleared: Answers = { lead: "UST Red Cross" };
    expect(patchOf(cleared, unsaved(cleared, book))).toEqual({ set: {}, unset: ["title"] });
  });

  it("takes others' changes without touching what's being typed here", () => {
    const book = newBook({ title: "Kalinga", lead: "UST Red Cross", venue: "Brgy. 630" });
    // Here: the title is being typed, not yet saved.
    const local: Answers = { title: "Kalinga sa", lead: "UST Red Cross", venue: "Brgy. 630" };
    // There: someone changed the lead and the title, and cleared the venue.
    const server: Answers = { title: "Kalinga Project", lead: "UST Rotaract" };
    const next = takeRemote(local, server, book);
    expect(next).toEqual({ title: "Kalinga sa", lead: "UST Rotaract" });
    // The title still goes up with the next save, over theirs.
    expect(unsaved(next, book)).toEqual(["title"]);
    // Taking the same answers again changes nothing.
    expect(takeRemote(next, server, book)).toEqual(next);
  });

  it("keeps a page's own value after the server tidies it, until someone else changes it", () => {
    const book = newBook({});
    const typing: Answers = { lead: "UST Red Cross " };
    const keys = unsaved(typing, book);
    // The server keeps it trimmed; this page keeps typing on its own value.
    markSaved(typing, keys, { lead: "UST Red Cross" }, book);
    expect(unsaved(typing, book)).toEqual([]);
    expect(takeRemote(typing, { lead: "UST Red Cross" }, book)).toEqual(typing);
    // Someone else's change does come in.
    expect(takeRemote(typing, { lead: "UST Rotaract" }, book)).toEqual({ lead: "UST Rotaract" });
  });
});

describe("team copies: live", () => {
  it("shows what others type at once, without saving it here, until the server settles it", () => {
    const book = newBook({ title: "Kalinga" });
    const settle = new Set<string>();
    // Typed on another page.
    const shown = takeLive({ title: "Kalinga" }, "title", "Kalinga sa", book, settle)!;
    expect(shown).toEqual({ title: "Kalinga sa" });
    expect(unsaved(shown, book)).toEqual([]);
    expect([...settle]).toEqual(["title"]);
    // Not over a question being edited here.
    const mine: Answers = { ...shown, lead: "UST Red" };
    expect(takeLive(mine, "lead", "UST Rotaract", book, settle)).toBeNull();
    // The other page never saved: the server's word settles it, though the server's value didn't change.
    expect(takeRemote(shown, { title: "Kalinga" }, book, settle)).toEqual({ title: "Kalinga" });
    expect(settle.size).toBe(0);
  });

  it("gives each page a steady colour", () => {
    expect(peerColor("abc123")).toBe(peerColor("abc123"));
    expect(peerColor("abc123")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("team copies: cleaning while filled in", () => {
  it("keeps blank rows, people and budget lines where they were added", () => {
    const phases = [{ name: "Preparation" }, {}, { name: "Outreach" }];
    expect(clean("phases", phases, false)).toHaveLength(2);
    expect(clean("phases", phases, true)).toHaveLength(3);
    const contacts = [{ lastName: "Dela Cruz", firstName: "Juan" }, {}];
    expect(clean("contacts", contacts, false)).toHaveLength(1);
    expect(clean("contacts", contacts, true)).toHaveLength(2);
    const budget = { lines: [{ key: "n1abc", category: "materials", item: "", qty: 0, rate: 0, days: 1, source: "csf", part: 0 }] };
    expect(clean("budget", budget, false)).toBeUndefined();
    const kept = clean("budget", budget, true) as { lines: { key: string }[] };
    expect(kept.lines.map((l) => l.key)).toEqual(["n1abc"]);
    // Still cleaned: names in capitals, no emoji, known options only.
    expect(clean("contacts", [{ lastName: "dela cruz 😀", firstName: "juan" }], true)).toMatchObject([{ lastName: "DELA CRUZ", firstName: "JUAN" }]);
    expect(clean("affiliation", { picked: ["nope"] }, true)).toBeUndefined();
  });
});

describe("team copies: links and people", () => {
  it("returns from Google only to a form or one of its copies", () => {
    expect(formBack("/f/comdev-proposal")).toBe("/f/comdev-proposal");
    expect(formBack("/f/comdev-proposal/AbCdEfGhIjKlMnOpQrSt_-")).toBe("/f/comdev-proposal/AbCdEfGhIjKlMnOpQrSt_-");
    for (const bad of ["https://evil.example/f/comdev-proposal", "//evil.example", "/f/comdev-proposal/short", "/admin", "/f/../admin", "/f/comdev-proposal?x=1"]) expect(formBack(bad)).toBeNull();
    expect(COPY_TOKEN.test("AbCdEfGhIjKlMnOpQrSt_-")).toBe(true);
  });

  it("reads emails and initials", () => {
    expect(copyEmail(" Juan.Cruz@UST.edu.ph ")).toBe("juan.cruz@ust.edu.ph");
    expect(copyEmail("juan@ust")).toBe("");
    expect(copyEmail("a,b@ust.edu.ph")).toBe("");
    expect(initials("Juan Dela Cruz")).toBe("JC");
    expect(initials("maria@ust.edu.ph")).toBe("M");
  });

  it("signs who a form's pages know, and where Google returns", () => {
    const who = formWhoFor("Juan@UST.edu.ph", "Juan Dela Cruz");
    expect(formWhoOf(who)).toEqual({ email: "juan@ust.edu.ph", name: "Juan Dela Cruz" });
    expect(formWhoOf(who.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(formWhoOf(undefined)).toBeNull();
    const avatar = "https://lh3.googleusercontent.com/a/profile-photo=s96-c";
    const photoProof = formWhoFor("Juan@UST.edu.ph", "Juan Dela Cruz", avatar);
    expect(formWhoOf(photoProof)).toEqual({ email: "juan@ust.edu.ph", name: "Juan Dela Cruz", avatar });
    const forgedPhoto = photoProof.split(".");
    forgedPhoto[3] = Buffer.from("https://example.com/other-photo").toString("base64url");
    expect(formWhoOf(forgedPhoto.join("."))).toBeNull();
    expect(formWhoOf(formWhoFor("juan@ust.edu.ph", "Juan", "javascript:alert(1)"))).toEqual({ email: "juan@ust.edu.ph", name: "Juan" });
    const pack = statePack("s", "n", "juan@ust.edu.ph", "/f/comdev-proposal");
    expect(stateUnpack(pack)).toEqual({ state: "s", nonce: "n", email: "juan@ust.edu.ph", back: "/f/comdev-proposal" });
    expect(stateUnpack(statePack("s", "n", "juan@ust.edu.ph"))).toEqual({ state: "s", nonce: "n", email: "juan@ust.edu.ph" });
    expect(stateUnpack(statePack("s", "n", "", "/f/comdev-proposal"))).toEqual({ state: "s", nonce: "n", email: "", back: "/f/comdev-proposal" });
    expect(stateUnpack(statePack("s", "n", ""))).toBeNull();
    const parts = pack.split(".");
    parts[3] = Buffer.from("/f/other-form").toString("base64url");
    expect(stateUnpack(parts.join("."))).toBeNull();
  });

  it("accepts bounded HTTPS profile photos and rejects unsupported image addresses", () => {
    expect(profileAvatar("https://lh3.googleusercontent.com/a/photo")).toBe("https://lh3.googleusercontent.com/a/photo");
    for (const bad of [undefined, "", "javascript:alert(1)", "data:image/svg+xml,photo", "http://example.com/photo", "https://user:pass@example.com/photo", `https://example.com/${"a".repeat(1100)}`]) expect(profileAvatar(bad)).toBeUndefined();
  });
});

describe("team copies: the form's setting", () => {
  it("follows the kind (proposals and terminal reports), and is kept in the store", () => {
    const w = world();
    const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    const details = { title: COMDEV_PROPOSAL.title, kind: COMDEV_PROPOSAL.kind, description: COMDEV_PROPOSAL.description };
    expect(execute(w.ctxFor(admin), { type: "form.save", ...details, schema: COMDEV_PROPOSAL.schema }).ok).toBe(true);
    const [form] = w.state.records.forms;
    expect(form.copies).toBe(true);
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, ...details, closesOn: "2026-12-15" }).ok).toBe(true);
    expect(form.copies).toBe(true);
    expect(fromRows(toRows(w.state)).records.forms).toEqual(w.state.records.forms);
    // A survey is answered one response at a time; a terminal report is copied again.
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, ...details, kind: "survey" }).ok).toBe(true);
    expect(form.copies).toBeUndefined();
    expect(execute(w.ctxFor(admin), { type: "form.save", id: form.id, ...details, kind: "terminal-report" }).ok).toBe(true);
    expect(form.copies).toBe(true);
    expect(fromRows(toRows(w.state)).records.forms).toEqual(w.state.records.forms);
  });
});
