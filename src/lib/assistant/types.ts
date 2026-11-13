/* What the assistant's server and its screens say to each other. */
import type { ModelAccess, ModelState, ModelTier, Plan, ProviderId, ProviderStatus } from "./rules";

export interface ChatSource {
  /** The number the answer cites it by. */
  n: number;
  title: string;
  href: string;
  /** The unit that wrote it, when it hasn't been through the Office's review. */
  from?: string;
}

/** One line of /api/chat's streamed reply. */
export type ChatEvent =
  | { t: "delta"; text: string }
  /** The whole answer so far is replaced: citations were cleaned. */
  | { t: "replace"; text: string }
  /** The Hub pages the answer cited: none for a general answer. */
  | { t: "sources"; sources: ChatSource[]; internal?: boolean }
  | { t: "notice"; text: string }
  | { t: "error"; message: string }
  | { t: "done" };

/** A model as the chat's settings list it for one person. Every model is listed; "off" ones show as unavailable. */
export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  /** Who makes it, in a word: Google, OpenAI. */
  maker: string;
  tier: ModelTier;
  state: ModelState;
  isDefault: boolean;
}

export interface ChatOptions {
  /** Why nothing can be asked yet, for the person asking. */
  unavailable?: string;
  models: ModelOption[];
}

export interface ProviderRow {
  id: ProviderId;
  label: string;
  keyUrl: string;
  billingUrl: string;
  hasFreePlan: boolean;
  plan: Plan;
  status: ProviderStatus;
  statusAt: string | null;
  keyHint: string | null;
  keyLength: number;
  connectedAt: string | null;
  connectedBy: string | null;
  accountRef: string | null;
  budget: number | null;
  low: number;
  bought: number;
  spentTotal: number;
  spentMonth: number;
  left: number | null;
}

export interface ModelRow {
  id: string;
  provider: ProviderId;
  label: string;
  inputUsd: number;
  outputUsd: number;
  enabled: boolean;
  access: ModelAccess;
  dailyLimit: number | null;
  isDefault: boolean;
}

export interface AccessRequestRow {
  modelId: string;
  modelLabel: string;
  accountId: string;
  name: string;
  unit: string;
  requestedAt: string;
}

export interface CreditRow {
  id: number;
  provider: ProviderId;
  amount: number;
  note: string;
  by: string;
  at: string;
}

export interface UsageRow {
  day: string;
  model: string;
  provider: string;
  unit: string;
  role: string;
  /** answered cited the Hub, general didn't; refused only appears on rows from before general conversation. */
  outcome: "answered" | "general" | "refused" | "stopped" | "error";
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * Work a model does for the Office rather than for the person chatting. The chat is the Assistant; the Reviewer checks
 * the rules' suggestions against an evidence file's pages (lib/review). A job's model is set here, once, and must be
 * on a plan that doesn't share data.
 */
export interface JobRow {
  id: "reviewer";
  label: string;
  does: string;
  enabled: boolean;
  modelId: string | null;
  backupModelId: string | null;
  /** Runs a day, across the Hub. */
  dailyLimit: number;
  runsToday: number;
  /** Over the usage period: runs, how many failed, and what they cost. */
  runs: number;
  failed: number;
  cost: number;
  /** Every model, with why it can't do this job right now, if it can't. */
  models: { id: string; label: string; problem: string | null }[];
}

/** Everything on the Agentic Control tab of Command & Control. */
export interface AgenticControlDesk {
  now: string;
  paused: boolean;
  fallbackModel: string | null;
  index: { builtAt: string | null; chunks: number; error: string | null };
  /** Whether Cloudflare's account ID is already known from the R2 settings. */
  accountKnown: boolean;
  providers: ProviderRow[];
  models: ModelRow[];
  jobs: JobRow[];
  requests: AccessRequestRow[];
  credits: CreditRow[];
  usage: UsageRow[];
}
