"use server";

/*
 * Process Pipelines › Information: the live figures on each information pipeline's nodes, counted where the pipeline
 * writes (analytics_*, review_files, assistant_settings, form_responses and the governance store). Read only, and
 * only counts and times: never a row's contents.
 */
import { canWith } from "@/lib/governance/rbac";
import type { InformationFlow } from "@/lib/governance/pipeline-flow";
import { publishedDocuments } from "@/lib/governance/server/documents";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { adminDb } from "@/lib/supabase/server";

type Result = { ok: true; flow: InformationFlow } | { ok: false; message: string };
type Counted = PromiseLike<{ count: number | null; error: unknown }>;
type Latest<K extends string> = PromiseLike<{ data: Partial<Record<K, string | null>> | null; error: unknown }>;

/** A head count, or undefined when the table couldn't be read. */
const counted = async (q: Counted) => {
  const { count, error } = await q;
  return error || count === null ? undefined : count;
};

/** The newest row's time, or null when there is none, or undefined when the table couldn't be read. */
const latest = async <K extends string>(q: Latest<K>, key: K) => {
  const { data, error } = await q;
  return error ? undefined : (data?.[key] ?? null);
};

const all = <T extends Record<string, unknown>>(o: T) => (Object.values(o).some((v) => v === undefined) ? undefined : (o as { [K in keyof T]: Exclude<T[K], undefined> }));

export async function informationFlow(): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (!canWith(viewer.grants, "workflows", "view")) return { ok: false, message: "Your role cannot see process pipelines." };
  try {
    const db = adminDb();
    const values = (status: string) => counted(db.from("analytics_values").select("id", { count: "exact", head: true }).eq("status", status));
    const [h, review, revise, validated, open, imports, lastImport, lastSnapshot, editions, read, lastRead, settings, responses] = await Promise.all([
      hub(),
      values("For review"),
      values("Needs revision"),
      values("Validated"),
      counted(db.from("analytics_campaigns").select("id", { count: "exact", head: true }).eq("status", "Open")),
      counted(db.from("analytics_imports").select("id", { count: "exact", head: true })),
      latest(db.from("analytics_imports").select("at").order("at", { ascending: false }).limit(1).maybeSingle(), "at"),
      latest(db.from("analytics_snapshots").select("at").order("at", { ascending: false }).limit(1).maybeSingle(), "at"),
      db.from("analytics_editions").select("id").eq("status", "Active"),
      counted(db.from("review_files").select("sha256", { count: "exact", head: true })),
      latest(db.from("review_files").select("read_at").order("read_at", { ascending: false }).limit(1).maybeSingle(), "read_at"),
      db.from("assistant_settings").select("index_chunks, index_built_at, index_error, paused").eq("id", 1).maybeSingle(),
      counted(db.from("form_responses").select("id", { count: "exact", head: true })),
    ]);
    const active = editions.error ? undefined : (editions.data ?? []).map((e) => e.id);
    const indicators = active === undefined ? undefined : active.length ? await counted(db.from("analytics_indicators").select("code", { count: "exact", head: true }).in("edition_id", active)) : 0;
    const { config, records } = h.state;
    const checked = config.watch.map((w) => w.checkedAt).sort().at(-1);
    const s = settings.error ? undefined : settings.data;
    const flow: InformationFlow = {
      at: new Date().toISOString(),
      values: all({ review, revise, validated }),
      campaigns: all({ open }),
      imports: imports === undefined || lastImport === undefined ? undefined : { count: imports, lastAt: lastImport ?? undefined },
      snapshots: lastSnapshot === undefined ? undefined : { lastAt: lastSnapshot ?? undefined },
      editions: active === undefined || indicators === undefined ? undefined : { active: active.length, indicators },
      files: read === undefined || lastRead === undefined ? undefined : { read, lastAt: lastRead ?? undefined },
      index: s ? { chunks: s.index_chunks, builtAt: s.index_built_at ?? undefined, failed: !!s.index_error, paused: s.paused } : undefined,
      responses: all({ count: responses }),
      forms: { open: records.forms.filter((f) => f.status === "open").length },
      deadlines: {
        sources: config.watch.length,
        checkedAt: checked,
        waiting: config.findings.filter((f) => f.state === "New").length,
        failed: config.watch.filter((w) => w.status === "Failed").length,
      },
      site: { rankings: h.publicRankings.length, stories: h.publishedStories.length, documents: publishedDocuments(h.state).length },
    };
    return { ok: true, flow };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Could not read the pipelines' figures. Try again." };
  }
}
