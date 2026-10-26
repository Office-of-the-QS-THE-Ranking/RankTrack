/*
 * What the Administration console receives: the parts of the governance store this viewer may see,
 * with derived facts filled in on the server.
 */
import type { RuleResult } from "./quality";
import type {
  Account,
  ApprovalRequest,
  AuditEvent,
  BackupState,
  Classification,
  Dataset,
  OrgUnit,
  Role,
  SecurityPolicy,
  SystemConfig,
  TermMeta,
  Workflow,
  WorkflowKey,
  WorkflowStep,
} from "./types";
import type { Viewer } from "./viewer";

export interface AccountRow extends Account {
  inactive: boolean;
  idleDays: number;
  sessions: number;
  lastSeen?: string;
  workspaces: ("office" | "portal")[];
  canEdit: boolean;
  mfaRequired: boolean;
  roleNames: string[];
}

export interface RoleRow extends Role {
  members: number;
  /** The viewer could assign this role (it sits inside their own permissions). */
  grantable: boolean;
}

export interface UnitRow extends OrgUnit {
  accounts: number;
  records: number;
  participating: boolean;
  canEdit: boolean;
  canManage: boolean;
}

export interface DatasetRow extends Dataset {
  stewardName: string;
  ownerName: string;
  quality: number;
  canEdit: boolean;
  canClassify: boolean;
}

export interface RequestRow extends ApprovalRequest {
  requesterName: string;
  workflowName: string;
  stepName: string;
  steps: WorkflowStep[];
  canDecide: boolean;
  blocked?: string;
  overdue: boolean;
  mine: boolean;
}

export interface DuplicateRow {
  key: string;
  score: number;
  a: { id: string; title: string; unit: string; submitted: string; submittedBy: string; status: string };
  b: { id: string; title: string; unit: string; submitted: string; submittedBy: string; status: string };
  decision?: { decision: "Merged" | "Dismissed"; keep?: string; by: string; at: string };
}

export interface TermRow extends TermMeta {
  definition: string;
  stewardName: string;
  rankings: string[];
}

export interface Attention {
  section: string;
  text: string;
  tone: "danger" | "revise" | "review";
  /** Which tab or record the section should open on. */
  focus?: string;
}

export interface Health {
  accounts: { active: number; pending: number; suspended: number; deactivated: number; inactive: number; external: number; temporary: number };
  sessions: number;
  units: { active: number; archived: number; participating: number };
  datasets: Record<Classification, number>;
  alertsOpen: number;
  requests: { pending: number; overdue: number; mine: number };
  audit: { entries: number; last24h: number; denied24h: number; lastAt: string };
  backup: { lastAt?: string; lastId?: string; ageMinutes?: number; rpoMinutes: number; withinRpo: boolean; atRiskMinutes: number; lastTest?: { at: string; result: string } };
  keysOverdue: number;
  quality: number;
  flagsOn: number;
  bodiesOn: number;
  rankingsTracked: number;
  rankingsPublic: number;
  evidence: { total: number; review: number; revise: number; validated: number };
  activity: { day: string; total: number; denied: number }[];
  attention: Attention[];
}

export interface ConsoleData {
  now: string;
  day: string;
  viewer: Viewer;
  health: Health;
  accounts?: AccountRow[];
  roles: RoleRow[];
  units: UnitRow[];
  datasets?: DatasetRow[];
  rules?: RuleResult[];
  duplicates?: DuplicateRow[];
  terms?: TermRow[];
  security?: SecurityPolicy;
  audit?: { events: AuditEvent[]; total: number };
  workflows: Workflow[];
  /** Workflows that the viewer's own changes wait on: switched on, with enough other administrators to decide them. */
  approvals: WorkflowKey[];
  requests: RequestRow[];
  config?: SystemConfig & { rankingMeta: { slug: string; name: string; short: string; family: string; body: string }[] };
  backup?: BackupState;
  /** People the viewer can pick from (stewards, administrators, flag audiences). */
  people: { id: string; name: string; unitId: string; status: string }[];
  /** Names for scope pickers, open to every administrator. */
  catalog: { cycles: string[]; datasets: { id: string; name: string; classification: Classification }[]; bodies: { key: string; name: string }[] };
}
