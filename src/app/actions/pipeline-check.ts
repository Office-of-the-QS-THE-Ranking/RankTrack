"use server";

/*
 * Process Pipelines › Integrity check. Runs a pipeline's draft through the engine on a throwaway copy of the Hub
 * (lib/governance/pipeline-check.ts) and returns the report. Read-only: nothing is committed, logged or sent.
 */
import { informationFlow } from "@/app/actions/process-pipelines";
import { INFO_PIPELINES, checkInformation, type InfoPipeline } from "@/lib/governance/information-check";
import { checkPipeline as dryRun, type PipelineCheck, type PipelineDraft } from "@/lib/governance/pipeline-check";
import { canWith } from "@/lib/governance/rbac";
import { allowAccount } from "@/lib/governance/server/limits";
import { reference } from "@/lib/governance/server/reference";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import type { WorkflowKey } from "@/lib/governance/types";

type Result = { ok: true; check: PipelineCheck } | { ok: false; message: string };

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** The draft as the studio sends it, or null when it isn't one. Save's own rules are checked by the dry run. */
function readDraft(v: unknown): PipelineDraft | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (!isBool(d.enabled) || !isBool(d.separation) || !isBool(d.notify) || typeof d.slaDays !== "number" || !Array.isArray(d.steps) || d.steps.length > 5) return null;
  const steps = d.steps.map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}));
  if (steps.some((s) => typeof s.name !== "string" || (s.enabled !== undefined && !isBool(s.enabled)) || (s.approver !== undefined && typeof s.approver !== "string"))) return null;
  return {
    enabled: d.enabled,
    slaDays: d.slaDays,
    separation: d.separation,
    notify: d.notify,
    steps: steps.map((s) => ({ name: s.name as string, enabled: s.enabled as boolean | undefined, approver: s.approver as PipelineDraft["steps"][number]["approver"] })),
  };
}

export async function checkPipeline(id: WorkflowKey, draft: PipelineDraft): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!canWith(viewer.grants, "workflows", "view")) return { ok: false, message: "Your role cannot see process pipelines." };
  if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many checks in a short time. Wait a minute and try again." };
  const d = readDraft(draft);
  if (!d || typeof id !== "string") return { ok: false, message: "The pipeline's settings were incomplete. Reload the page and try again." };
  const [state, ref] = await Promise.all([readState(), reference()]);
  try {
    return { ok: true, check: dryRun(state, ref, id, d, viewer.id) };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "The integrity check could not finish. Try again." };
  }
}

/** Check an information pipeline: its sources read live, its health, and the workflow pipelines that govern it. */
export async function checkInformationPipeline(key: InfoPipeline): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!canWith(viewer.grants, "workflows", "view")) return { ok: false, message: "Your role cannot see process pipelines." };
  if (!(await allowAccount(viewer.id, "command"))) return { ok: false, message: "Too many checks in a short time. Wait a minute and try again." };
  if (typeof key !== "string" || !Object.hasOwn(INFO_PIPELINES, key)) return { ok: false, message: "Unknown pipeline. Reload the page and try again." };
  const t0 = performance.now();
  const flow = await informationFlow().catch(() => ({ ok: false as const, message: "Could not read the pipelines' figures." }));
  const readMs = performance.now() - t0;
  const [state, ref] = await Promise.all([readState(), reference()]);
  try {
    return { ok: true, check: checkInformation(key, flow.ok ? flow.flow : null, flow.ok ? undefined : flow.message, readMs, state, ref, viewer.id) };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "The integrity check could not finish. Try again." };
  }
}
