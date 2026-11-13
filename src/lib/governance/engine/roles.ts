import { MODULES, ROLE, roleOf, withoutCommandControl } from "../catalog";
import type { Command } from "../commands";
import { canEditRolePermissions, has, normalize } from "../rbac";
import type { PermissionSet } from "../types";
import { deny, invalid, log, ok, type Ctx } from "./core";

/** Reject unknown modules and actions rather than silently dropping a malformed edit. */
function validPermissions(value: unknown): value is PermissionSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, actions]) => {
    const module = MODULES.find((m) => m.key === key);
    return module && Array.isArray(actions) && actions.every((a) => module.actions.includes(a));
  });
}

export function updateRolePermissions(ctx: Ctx, cmd: Extract<Command, { type: "role.permissions" }>) {
  const resource = { type: "Role", id: cmd.id, label: roleOf(cmd.id)?.name ?? "Role" };
  if (!ctx.actor.account || !canEditRolePermissions(ctx.actor.account, ctx.actor.grants))
    return deny(ctx, cmd.type, "Access", resource, "Only the Director can edit role permissions.");
  const role = roleOf(cmd.id, ctx.state.config.rolePermissions);
  if (role?.id === ROLE.superAdmin) return invalid("A Super Administrator's permissions are fixed by their position.");
  if (!role) return invalid("Choose an existing role.");
  if (!validPermissions(cmd.permissions) || !validPermissions(cmd.previous)) return invalid("Choose permissions from the listed modules and actions.");
  const current = role.permissions;
  if (JSON.stringify(normalize(current)) !== JSON.stringify(normalize(cmd.previous)))
    return invalid("These permissions changed while you were editing. Reopen the editor and try again.");
  // The Command & Control console stays with Super Administrators (catalog roleOf).
  const permissions = normalize(withoutCommandControl(cmd.permissions));
  const changes = MODULES.flatMap((m) => m.actions.flatMap((a) => has(current, m.key, a) === has(permissions, m.key, a) ? [] : [`${has(permissions, m.key, a) ? "Granted" : "Removed"} ${m.key}.${a}`]));
  if (!changes.length) return ok("Permissions are already up to date.");
  ctx.state.config.rolePermissions = { ...ctx.state.config.rolePermissions, [role.id]: { permissions } };
  log(ctx, cmd.type, "Access", resource, "Success", changes.join("; "));
  return ok(`${role.name} permissions saved.`);
}
