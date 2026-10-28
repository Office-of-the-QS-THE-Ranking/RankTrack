import { MODULES, ROLE, roleOf } from "../catalog";
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
    return deny(ctx, cmd.type, "Access", resource, "Only Administrators in the Office of QS/THE Rankings can edit role permissions.");
  const role = roleOf(cmd.id, ctx.state.config.rolePermissions);
  if (!role || (cmd.scope !== "unit" && cmd.scope !== "university") || (cmd.scope === "university" && !role.universityPermissions))
    return invalid("Choose an existing role and permission scope.");
  if (!validPermissions(cmd.permissions) || !validPermissions(cmd.previous)) return invalid("Choose permissions from the listed modules and actions.");
  const current = cmd.scope === "university" ? role.universityPermissions! : role.permissions;
  if (JSON.stringify(normalize(current)) !== JSON.stringify(normalize(cmd.previous)))
    return invalid("These permissions changed while you were editing. Reopen the editor and try again.");
  const permissions = normalize(cmd.permissions);
  if (cmd.id === ROLE.admin && cmd.scope === "university") {
    permissions.roles = MODULES.find((m) => m.key === "roles")!.actions;
  }
  const changes = MODULES.flatMap((m) => m.actions.flatMap((a) => has(current, m.key, a) === has(permissions, m.key, a) ? [] : [`${has(permissions, m.key, a) ? "Granted" : "Removed"} ${m.key}.${a}`]));
  if (!changes.length) return ok("Permissions are already up to date.");
  ctx.state.config.rolePermissions = {
    ...ctx.state.config.rolePermissions,
    [role.id]: {
      permissions: cmd.scope === "unit" ? permissions : role.permissions,
      ...(role.universityPermissions ? { universityPermissions: cmd.scope === "university" ? permissions : role.universityPermissions } : {}),
    },
  };
  log(ctx, cmd.type, "Access", resource, "Success", `${cmd.scope === "university" ? "Rankings Office" : "Unit"}: ${changes.join("; ")}`);
  return ok(`${role.name} permissions saved.`);
}
