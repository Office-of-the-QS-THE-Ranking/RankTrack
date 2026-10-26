import "server-only";

/*
 * Development only: a saved access profile (roles, scope, home unit) for one Google address, applied to that
 * account at its next sign-in. It lives in Supabase (hub_dev_access, one row) and does nothing outside
 * `next dev`, and nothing even there unless HUB_DEV_ACCESS=on: a development server pointed at the live
 * Supabase project would otherwise rewrite a real account's roles. It never brings back a suspended or
 * deactivated account.
 */
import { adminDb } from "@/lib/supabase/server";
import { ROLE, roleOf } from "../catalog";
import { log, type Ctx } from "../engine/core";
import { addAssignment, createAccount } from "../engine/mutations";
import { legacyRole } from "../migrate";
import { UNIVERSITY, unitScope } from "../rbac";

export const DEV = process.env.NODE_ENV === "development" && process.env.HUB_DEV_ACCESS === "on";

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

export async function readProfile(): Promise<DevProfile> {
  if (!DEV) return { ...DEFAULT_PROFILE, enabled: false };
  const { data, error } = await adminDb().from("hub_dev_access").select("*").eq("id", 1).maybeSingle();
  if (error) console.error(`Developer settings could not be read: ${error.message}`);
  if (!data) return DEFAULT_PROFILE;
  // Profiles saved before the roles were consolidated name the old roles.
  const roleIds = [...new Set(data.role_ids.map((id) => (roleOf(id) ? id : legacyRole(id))))];
  return { enabled: data.enabled, email: data.email, roleIds, unitId: data.unit_id, scope: data.scope as DevProfile["scope"], superAdmin: data.super_admin };
}

export async function writeProfile(p: DevProfile) {
  const { error } = await adminDb()
    .from("hub_dev_access")
    .upsert({ id: 1, enabled: p.enabled, email: p.email, role_ids: p.roleIds, unit_id: p.unitId, scope: p.scope, super_admin: p.superAdmin, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Developer settings could not be saved: ${error.message}`);
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
  if (a && (a.status === "Suspended" || a.status === "Deactivated")) {
    log(ctx, "account.dev-access", "Account", { type: "Account", id: a.id, label: a.name }, "Denied", `Developer settings not applied: the account is ${a.status.toLowerCase()}`);
    return;
  }
  if (!a) a = createAccount(ctx, { name: name || email, email, title: "Developer", unitId, roleId: roles[0], scope });
  else a.assignments = [];
  a.unitId = unitId;
  if (a.status !== "Active") {
    a.status = "Active";
    a.statusChangedAt = ctx.iso;
  }
  for (const id of roles) if (!a.assignments.some((x) => x.roleId === id)) addAssignment(ctx, a, id, scope, undefined, "Developer settings");
  log(ctx, "account.dev-access", "Account", { type: "Account", id: a.id, label: a.name }, "Success", `Developer settings applied: ${roles.join(", ")} · ${p.scope}`);
}
