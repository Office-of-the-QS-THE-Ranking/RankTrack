import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { findInDirectory, mayLookUp } from "@/lib/governance/server/people-directory";
import { directoryPicked, lookupKey, personPhoto } from "@/lib/forms/people-lookup";
import { moduleOf, type FormContext } from "@/lib/forms/modules";
import { contactPersons } from "@/lib/forms/presets";
import { world } from "./helpers";

const PHOTO = "https://lh3.googleusercontent.com/a/abc=s96-c";

describe("finding people on a form in the University directory", () => {
  it("badges selected UST emails, including directory records without a photo", () => {
    expect(directoryPicked({ email: "acruz@ust.edu.ph", directoryEmail: "acruz@ust.edu.ph" })).toBe(true);
    expect(directoryPicked({ email: "ACRUZ@UST.EDU.PH", directoryEmail: "acruz@ust.edu.ph" })).toBe(true);
    expect(directoryPicked({ email: "acruz@ust.edu.ph", photo: PHOTO })).toBe(true);
    expect(directoryPicked({ email: "acruz@ust.edu.ph" })).toBe(false);
    expect(directoryPicked({ email: "changed@ust.edu.ph", directoryEmail: "acruz@ust.edu.ph", photo: PHOTO })).toBe(false);
    expect(directoryPicked({ email: "acruz@example.com", directoryEmail: "acruz@example.com" })).toBe(false);
  });

  it("retains a directory selection through saving and drops markers for mismatched emails", () => {
    const spec = contactPersons();
    const ctx = { units: [], answers: {}, fields: new Map() } as FormContext;
    const clean = (p: object) => moduleOf(spec).clean(spec as never, [p], ctx);
    expect(clean({ lastName: "Cruz", firstName: "Ana", email: "acruz@ust.edu.ph", directoryEmail: "acruz@ust.edu.ph" })).toEqual([expect.objectContaining({ directoryEmail: "acruz@ust.edu.ph" })]);
    expect(clean({ lastName: "Cruz", firstName: "Ana", email: "changed@ust.edu.ph", directoryEmail: "acruz@ust.edu.ph" })).toEqual([expect.not.objectContaining({ directoryEmail: expect.anything() })]);
  });
  it("matches Hub accounts by the start of the last and first names, without accents or case", async () => {
    const { state, eng, person } = world();
    const juan = person("Juan Dela Peña", "jdelapena@ust.edu.ph", ROLE.coordinator, eng.id);
    juan.avatar = PHOTO;
    person("Juana Reyes", "jreyes@ust.edu.ph", ROLE.coordinator, eng.id);
    person("Juan Peña", "juan@example.org", ROLE.coordinator, eng.id, true);
    const found = await findInDirectory(state, "peña", "ju", "ust.edu.ph");
    expect(found).toEqual([{ name: "Juan Dela Peña", email: "jdelapena@ust.edu.ph", photo: PHOTO }]);
    expect(await findInDirectory(state, "Reyes", "Juan", "ust.edu.ph")).toHaveLength(1);
    expect(await findInDirectory(state, "Santos", "Ana", "ust.edu.ph")).toEqual([]);
  });

  it("lets only University accounts look people up", () => {
    const { state } = world();
    state.security.sso.domains = ["ust.edu.ph"];
    expect(mayLookUp(state, { email: "a@ust.edu.ph", name: "A", via: "google" })).toBe(true);
    expect(mayLookUp(state, { email: "a@gmail.com", name: "A", via: "google" })).toBe(false);
    expect(mayLookUp(state, null)).toBe(false);
  });

  it("keeps a photo only from Google's photo host, and only beside an email", () => {
    expect(personPhoto(PHOTO)).toBe(PHOTO);
    expect(personPhoto("https://evil.example/x.png")).toBeUndefined();
    expect(personPhoto("http://lh3.googleusercontent.com/a")).toBeUndefined();
    expect(lookupKey("  dela   Peña ")).toBe("DELA PENA");
    const spec = contactPersons();
    const ctx = { units: [], answers: {}, fields: new Map() } as FormContext;
    const clean = (p: object) => moduleOf(spec).clean(spec as never, [p], ctx);
    expect(clean({ lastName: "Cruz", firstName: "Ana", email: "acruz@ust.edu.ph", photo: PHOTO })).toEqual([expect.objectContaining({ photo: PHOTO })]);
    expect(clean({ lastName: "Cruz", firstName: "Ana", photo: PHOTO })).toEqual([expect.not.objectContaining({ photo: PHOTO })]);
    expect(clean({ lastName: "Cruz", firstName: "Ana", email: "acruz@ust.edu.ph", photo: "https://evil.example/x.png" })).toEqual([expect.not.objectContaining({ photo: expect.anything() })]);
  });
});
