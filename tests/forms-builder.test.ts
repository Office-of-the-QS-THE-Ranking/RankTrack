import { describe, expect, it } from "vitest";
import { PALETTE, blankField, blankSchema, dependents, fitPreset, keyFrom, renameField, schemaProblem, takenIds, withoutField } from "@/lib/forms/builder";
import { PRESETS } from "@/lib/forms/presets";
import { readSchema } from "@/lib/forms/schema";
import type { FieldSpec, FormSchema } from "@/lib/forms/types";

const one = (fields: FieldSpec[]): FormSchema => ({ sections: [{ id: "s1", title: "Step", fields }] });

describe("Forms Builder", () => {
  it("makes answer keys from labels, free of what's taken", () => {
    expect(keyFrom("Name of the project", new Set())).toBe("nameOfTheProject");
    expect(keyFrom("Title", new Set(["title"]))).toBe("title2");
    expect(keyFrom("2024 budget", new Set())).toBe("question2024Budget");
  });

  it("builds every palette module so the schema gate takes it", () => {
    let schema = blankSchema();
    for (const type of PALETTE.flatMap((g) => g.types)) {
      const made = blankField(type, takenIds(schema), schema.sections[0].fields);
      expect(made, type).not.toBeNull();
      schema = one([...schema.sections[0].fields, made!]);
    }
    expect(schemaProblem(schema)).toBeNull();
  });

  it("asks for a budget before a budget summary", () => {
    expect(blankField("budgetsummary", new Set())).toBeNull();
  });

  it("fits every preset into a blank form", () => {
    for (const p of PRESETS.filter((x) => x.group !== "Review")) {
      const drop = fitPreset(p.key, blankSchema())!;
      expect(schemaProblem(one(drop.fields)), p.key).toBeNull();
    }
  });

  it("reuses fields a preset needs and renames ones that clash", () => {
    const withPhases = one(fitPreset("phases", blankSchema())!.fields);
    const budget = fitPreset("budget", withPhases)!;
    expect(budget.fields.some((f) => f.id === "phases")).toBe(false);
    expect(readSchema(one([...withPhases.sections[0].fields, ...budget.fields]))).not.toBeTypeOf("string");

    const clash = one([{ id: "phases", type: "text", label: "Phases" }]);
    const fitted = fitPreset("project-flow", clash)!;
    const table = fitted.fields.find((f) => f.type === "table" && f.label === "Phases")!;
    expect(table.id).not.toBe("phases");
    const flow = fitted.fields.find((f) => f.type === "table" && f !== table)!;
    expect(flow.type === "table" && flow.columns.some((c) => c.optionsFrom === table.id)).toBe(true);
  });

  it("drops review presets into the review", () => {
    const drop = fitPreset("approvals", blankSchema())!;
    expect(drop.review).toBe(true);
    expect(drop.stages).toHaveLength(1);
  });

  it("renames a key everywhere it's read and removes conditions on a removed field", () => {
    const schema: FormSchema = {
      sections: [
        { id: "s1", title: "One", fields: [{ id: "q1", type: "yesno", label: "Any?" }, { id: "name", type: "text", label: "Name" }] },
        { id: "s2", title: "Two", showIf: { field: "q1", is: ["yes"] }, fields: [{ id: "q2", type: "text", label: "Which", showIf: { field: "q1", is: ["yes"] } }] },
      ],
      from: { name: "name" },
    };
    const renamed = renameField(schema, "q1", "any");
    expect(renamed.sections[1].showIf?.field).toBe("any");
    expect(renamed.sections[1].fields[0].showIf?.field).toBe("any");
    expect(dependents(schema, "q1")).toEqual(["Which", "Two"]);
    const gone = withoutField(withoutField(schema, "q1"), "name");
    expect(gone.sections[1].showIf).toBeUndefined();
    expect(gone.sections[1].fields[0].showIf).toBeUndefined();
    expect(gone.from).toBeUndefined();
    expect(schemaProblem(gone)).toBeNull();
  });
});
