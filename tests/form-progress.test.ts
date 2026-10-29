import { describe, expect, it } from "vitest";
import { formProgress } from "@/lib/forms/check";
import type { FormSchema } from "@/lib/forms/types";

const schema: FormSchema = {
  sections: [{ id: "project", title: "Project", fields: [
    { id: "title", type: "text", label: "Title", required: true },
    { id: "email", type: "text", label: "Email", format: "email", required: true },
    { id: "extra", type: "text", label: "Extra details" },
  ] }],
};
const ctx = { units: [] };

describe("saved form completion", () => {
  it("starts empty, counts valid required answers, and ignores optional blanks", () => {
    expect(formProgress(schema, null, ctx)).toBe(0);
    expect(formProgress(schema, { title: "Outreach" }, ctx)).toBe(50);
    expect(formProgress(schema, { title: "Outreach", email: "bad" }, ctx)).toBe(50);
    expect(formProgress(schema, { title: "Outreach", email: "team@ust.edu.ph" }, ctx)).toBe(100);
  });

  it("excludes hidden sections, hidden fields, and explanatory notes", () => {
    const conditional: FormSchema = { sections: [
      { id: "main", title: "Main", fields: [
        { id: "event", type: "yesno", label: "Has an event?", required: true },
        { id: "place", type: "text", label: "Place", required: true, showIf: { field: "event", is: ["yes"] } },
        { id: "note", type: "note", label: "Instructions", text: "Read this." },
      ] },
      { id: "details", title: "Details", showIf: { field: "event", is: ["yes"] }, fields: [
        { id: "date", type: "date", label: "Date", required: true },
      ] },
    ] };
    expect(formProgress(conditional, { event: "no" }, ctx)).toBe(100);
    expect(formProgress(conditional, { event: "yes" }, ctx)).toBe(33);
  });

  it("counts visible questions when the form has no required questions", () => {
    const optional: FormSchema = { sections: [{ id: "s", title: "Feedback", fields: [
      { id: "rating", type: "number", label: "Rating" },
      { id: "again", type: "yesno", label: "Again?" },
    ] }] };
    expect(formProgress(optional, { rating: 0 }, ctx)).toBe(50);
    expect(formProgress(optional, { rating: 0, again: "no" }, ctx)).toBe(100);
    expect(formProgress({ sections: [] }, {}, ctx)).toBe(0);
  });
});
