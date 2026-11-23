import { DEMO_PEOPLE } from "./state";
import { DEMO_BASE } from "./paths";

/** The roles a visitor can try, each one of the Hub's real roles held by a fictional person. */
export const DEMO_ROLES = [
  { key: "coordinator", label: "Coordinator", hint: "Contributor · sends evidence", account: DEMO_PEOPLE.coordinator, side: "unit", home: DEMO_BASE },
  { key: "administrator", label: "Administrator", hint: "A new unit · empty states", account: DEMO_PEOPLE.administrator, side: "unit", home: DEMO_BASE },
  { key: "staff", label: "Office Staff", hint: "Reviewer · approves and returns", account: DEMO_PEOPLE.staff, side: "office", home: `${DEMO_BASE}/unit-submissions` },
  { key: "director", label: "Director", hint: "Office admin · the whole picture", account: DEMO_PEOPLE.director, side: "office", home: `${DEMO_BASE}/office` },
] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];
export type DemoRoleKey = DemoRole["key"];

export const roleByKey = (key: string | null | undefined) => DEMO_ROLES.find((r) => r.key === key);

/** The role a page opens in when the visitor hasn't picked one that fits it. */
export const defaultRole = (side: "unit" | "office"): DemoRole => (side === "office" ? DEMO_ROLES[2] : DEMO_ROLES[0]);
