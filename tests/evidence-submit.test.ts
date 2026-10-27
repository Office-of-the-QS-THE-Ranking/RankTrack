import { describe, expect, it } from "vitest";
import type { Command } from "@/lib/governance/commands";
import { execute } from "@/lib/governance/engine";
import { ROLE } from "@/lib/governance/catalog";
import { EVIDENCE_SUMMARY } from "@/lib/governance/evidence-files";
import { evidenceById } from "@/lib/governance/records";
import { world } from "./helpers";

type Input = Extract<Command, { type: "evidence.submit" }>["input"];

/* Submit evidence writes its description in the post editor, so the server keeps that formatting, cleaned. */
function submit(summary: string, extra: Partial<Input> = {}) {
  const w = world();
  const own = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const r = execute(w.ctxFor(own), {
    type: "evidence.submit",
    unitSlug: w.eng.id,
    input: {
      title: "Rainwater reuse",
      type: "Operational data",
      period: "Calendar year 2025",
      summary,
      result: "4,820 cubic metres reused",
      beneficiaries: "Residents of Barangay 455",
      level: 3,
      sdgs: [6],
      files: [],
      url: "https://www.ust.edu.ph/sustainability",
      mappedTo: ["THE Impact · SDG 6"],
      ...extra,
    },
  });
  return { r, record: r.ok && typeof r.data === "string" ? evidenceById(w.state, r.data) : undefined };
}

describe("evidence descriptions", () => {
  it("keep the editor's formatting", () => {
    const { r, record } = submit("<p>We <strong>retrofitted</strong> gutters.</p><ul><li>Three buildings</li></ul>");
    expect(r.ok).toBe(true);
    expect(record?.summary).toContain("<strong>retrofitted</strong>");
    expect(record?.summary).toContain("<li>Three buildings</li>");
  });

  it("lose anything the editor doesn't allow", () => {
    const { record } = submit('<p onclick="steal()">Hello<script>alert(1)</script> <a href="javascript:alert(1)">link</a></p>');
    expect(record?.summary).not.toMatch(/script|onclick|javascript:/i);
    expect(record?.summary).toContain("Hello");
  });

  it("still accept plain text", () => {
    expect(submit("Gutters on three buildings.").record?.summary).toBe("Gutters on three buildings.");
  });

  it("are saved empty when only empty paragraphs were written", () => {
    expect(submit("<p><br></p>").record?.summary).toBe("");
  });

  it("are refused past the length limit", () => {
    const { r } = submit(`<p>${"a".repeat(EVIDENCE_SUMMARY.text + 1)}</p>`);
    expect(r.ok).toBe(false);
  });
});

describe("evidence sections", () => {
  it("keep the background, how it was verified, the links and the references", () => {
    const { r, record } = submit("<p>Gutters.</p>", {
      background: "  Flooding closed the campus twice a year.  ",
      verifiedBy: "Barangay records",
      links: [{ url: "https://news.example.org/rain", label: "Inquirer feature" }],
      references: [
        { title: "Rainwater harvesting in Manila", source: "Journal of Water, 2024", url: "https://doi.org/10.1000/rain" },
        { title: "", source: "", url: "" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(record?.background).toBe("Flooding closed the campus twice a year.");
    expect(record?.verifiedBy).toBe("Barangay records");
    expect(record?.links).toEqual([
      { url: "https://news.example.org/rain", label: "Inquirer feature" },
      { url: "https://www.ust.edu.ph/sustainability", label: "" },
    ]);
    expect(record?.files).toContain("https://news.example.org/rain");
    expect(record?.references).toEqual([{ title: "Rainwater harvesting in Manila", source: "Journal of Water, 2024", url: "https://doi.org/10.1000/rain" }]);
  });

  it("leave out what wasn't given", () => {
    const { record } = submit("Gutters.");
    expect(record?.background).toBeUndefined();
    expect(record?.references).toBeUndefined();
  });

  it("refuse a link that isn't a full address", () => {
    expect(submit("Gutters.", { links: [{ url: "news.example.org", label: "" }] }).r.ok).toBe(false);
  });

  it("refuse a reference without a title", () => {
    expect(submit("Gutters.", { references: [{ title: "", source: "Inquirer", url: "" }] }).r.ok).toBe(false);
  });

  it("need a file or a link", () => {
    expect(submit("Gutters.", { url: "", links: [] }).r.ok).toBe(false);
  });
});
