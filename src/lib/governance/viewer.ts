/*
 * The signed-in person as the interface sees them. Built on the server from the governance store and
 * passed to client components; the server still re-checks every change it is asked to make.
 */
import { canWith, type Grant, type Target } from "./rbac";
import type { Action, DataGrant, ModuleKey, PermissionSet } from "./types";

export type Workspace = "office" | "portal";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  title: string;
  initials: string;
  external: boolean;
  unitId: string;
  unitName: string;
  roles: { id: string; name: string; scope: string; expires?: string; system: boolean }[];
  /** The highest role, for labels. */
  roleName: string;
  grants: Grant[];
  perms: PermissionSet;
  tier: number;
  technical: boolean;
  superAdmin: boolean;
  workspaces: Workspace[];
  /** The unit the contributor workspace shows, and whether the viewer may switch it. */
  portal: { unitId: string; unitName: string; programId?: string; programName?: string; canSwitch: boolean; units: { id: string; name: string }[] };
  /** Administration sections this viewer may open. */
  admin: ModuleKey[];
  flags: string[];
  features: Record<string, boolean>;
  dataGrants: DataGrant[];
  session: { id: string; startedAt: string; idleMinutes: number; warnMinutes: number; absoluteHours: number; mfa: boolean };
}

export const viewerCan = (v: Viewer | null | undefined, m: ModuleKey, a: Action, t: Target = {}) => !!v && (v.superAdmin || canWith(v.grants, m, a, t));

export const flag = (v: Viewer | null | undefined, id: string) => !!v?.flags.includes(id);

export const feature = (v: Viewer | null | undefined, id: string) => v?.features[id] ?? true;
