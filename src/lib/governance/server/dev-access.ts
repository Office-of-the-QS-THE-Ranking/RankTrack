import "server-only";

/*
 * Development only: a saved access profile (roles, scope, home unit) for one Google address, applied to that
 * account at its next sign-in. It lives in .data/dev-access.json (gitignored) and does nothing outside
 * `next dev`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROLE, roleOf } from "../catalog";
import { log, type Ctx } from "../engine/core";
import { addAssignment, createAccount } from "../engine/mutations";
import { legacyRole } from "../migrate";
import { UNIVERSITY, unitScope } from "../rbac";

export const DEV = process.env.NODE_ENV === "development";

export interface DevProfile {
  enabled: boolean;
  email: string;
  roleIds: string[];
  unitId: string;
  /** University-wide, or only the home unit and the units beneath it. */
  scope: "university" | "unit";
  /** Super admin: as the only University Administrator, your changes skip approval workflows. Off, every switched-on workflow applies. */
  superAdmin: boolean;
}

export const DEFAULT_PROFILE: DevProfile = {
  enabled: true,
  email: process.env.HUB_BOOTSTRAP_ADMIN?.trim().toLowerCase() ?? "",
  roleIds: [ROLE.admin],
  unitId: "rankings-office",
  scope: "university",
  superAdmin: true,
};

const FILE = path.join(process.cwd(), ".data", "dev-access.json");

export async function readProfile(): Promise<DevProfile> {
  if (!DEV) return { ...DEFAULT_PROFILE, enabled: false };
  try {
    const p: DevProfile = { ...DEFAULT_PROFILE, ...JSON.parse(await readFile(FILE, "utf8")) };
    // Profiles saved before the roles were consolidated name the old roles.
    return { ...p, roleIds: [...new Set(p.roleIds.map((id) => (roleOf(id) ? id : legacyRole(id))))] };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function writeProfile(p: DevProfile) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(p, null, 2));
}

/** Whether a lone administrator's changes skip approval: always outside development, else as the developer chose. */
export async function adminShortcut() {
  return !DEV || (await readProfile()).superAdmin;
}

/** Inside the sign-in transaction: give the profile's account exactly the saved roles. */
export function applyProfile(ctx: Ctx, p: DevProfile, email: string, name: string) {
  if (!DEV || !p.enabled || p.email.trim().toLowerCase() !== email) return;
  const s = ctx.state;
  const roles = p.roleIds.flatMap((id) => roleOf(id)?.id ?? []);
  const unitId = s.units.some((u) => u.id === p.unitId) ? p.unitId : (s.units[0]?.id ?? p.unitId);
  if (!roles.length) return;
  const scope = p.scope === "university" ? UNIVERSITY : unitScope(unitId);
  let a = s.accounts.find((x) => x.email.toLowerCase() === email);
  if (!a) a = createAccount(ctx, { name: name || email, email, title: "Developer", unitId, roleId: roles[0], scope });
  else a.assignments = [];
  a.unitId = unitId;
  a.status = "Active";
  a.statusReason = undefined;
  a.statusChangedAt = ctx.iso;
  for (const id of roles) if (!a.assignments.some((x) => x.roleId === id)) addAssignment(ctx, a, id, scope, undefined, "Developer settings");
  log(ctx, "account.dev-access", "Account", { type: "Account", id: a.id, label: a.name }, "Success", `Developer settings applied: ${roles.join(", ")} · ${p.scope}`);
}
