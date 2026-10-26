/*
 * The signed-in person as the interface sees them. Built on the server from the governance store and
 * passed to client components; the server still re-checks every change it is asked to make.
 */
import { canWith, type Grant, type Target } from "./rbac";
import type { Action, DataGrant, ModuleKey, PermissionSet, RoleId } from "./types";

export type Workspace = "office" | "portal";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  title: string;
  initials: string;
  /** Google profile photo, when they have one. */
  avatar?: string;
  external: boolean;
  unitId: string;
  unitName: string;
  roles: { id: RoleId; name: string; scope: string; expires?: string }[];
  /** The highest role, for labels. */
  roleName: string;
  grants: Grant[];
  perms: PermissionSet;
  workspaces: Workspace[];
  /** The unit the contributor workspace shows. */
  portal: { unitId: string; unitName: string; programId?: string; programName?: string };
  /** Administration sections this viewer may open. */
  admin: ModuleKey[];
  flags: string[];
  features: Record<string, boolean>;
  dataGrants: DataGrant[];
  /**
   * idleMinutes is what applies to this person (0: no idle sign-out); policyIdleMinutes is the Office's limit,
   * prefIdleMinutes their own shorter choice, stay whether they chose to stay signed in.
   */
  session: {
    id: string;
    startedAt: string;
    idleMinutes: number;
    policyIdleMinutes: number;
    prefIdleMinutes?: number;
    warnMinutes: number;
    absoluteHours: number;
    stay: boolean;
    mfa: boolean;
  };
  /** The person's own notification choices. */
  notify: { email: boolean; off: string[] };
}

export const viewerCan = (v: Viewer | null | undefined, m: ModuleKey, a: Action, t: Target = {}) => !!v && canWith(v.grants, m, a, t);

export const flag = (v: Viewer | null | undefined, id: string) => !!v?.flags.includes(id);

export const feature = (v: Viewer | null | undefined, id: string) => v?.features[id] ?? true;
