import "server-only";

/*
 * Builds the search index from sourceDocs(): cuts each document into passages, embeds only the ones that changed, and
 * removes the ones that no longer exist. It stops within a time budget and picks up where it left off next time, so even
 * a first build fits the daily round's time limit. Called from the daily cron and the AI tab's Rebuild button.
 */
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/server";
import { EMBEDDING_PROVIDER, splitPassages } from "../rules";
import { embed, openKey } from "./providers";
import { sourceDocs } from "./sources";

const BATCH = 32;
const BUDGET_MS = 45_000;

export interface IndexResult {
  ok: boolean;
  message: string;
  chunks?: number;
  complete?: boolean;
}

export async function rebuildIndex(budgetMs = BUDGET_MS): Promise<IndexResult> {
  const db = adminDb();
  const report = async (patch: { index_chunks?: number; index_error: string | null; index_built_at?: string }) => {
    await db.from("assistant_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
  };
  try {
    const { data: provider, error: providerError } = await db.from("assistant_providers").select("key_sealed, account_ref").eq("id", EMBEDDING_PROVIDER).single();
    if (providerError) throw new Error(providerError.message);
    const key = openKey(provider.key_sealed);
    if (!key) return { ok: false, message: "Connect Cloudflare first: it builds the search index." };

    const started = Date.now();
    const docs = await sourceDocs();
    const wanted = docs.flatMap((doc) =>
      splitPassages(doc.text).map((content, i) => ({
        id: `${doc.id}#${i}`,
        source_id: doc.id,
        title: doc.title,
        href: doc.href,
        content,
        level: doc.level,
        module: doc.module ?? null,
        action: doc.action ?? null,
        unit_id: doc.unitId ?? null,
        hash: createHash("sha256").update(JSON.stringify([doc.title, doc.href, doc.level, doc.module, doc.action, doc.unitId, content])).digest("hex"),
      })),
    );

    const existing = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("assistant_chunks").select("id, hash").range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const c of data ?? []) existing.set(c.id, c.hash);
      if ((data?.length ?? 0) < 1000) break;
    }

    // Stale passages go first: whatever else happens, nothing withdrawn stays answerable.
    const keep = new Set(wanted.map((w) => w.id));
    const gone = [...existing.keys()].filter((id) => !keep.has(id));
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await db.from("assistant_chunks").delete().in("id", gone.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }

    const changed = wanted.filter((w) => existing.get(w.id) !== w.hash);
    let done = 0;
    for (let i = 0; i < changed.length && Date.now() - started < budgetMs; i += BATCH) {
      const batch = changed.slice(i, i + BATCH);
      const vectors = await embed(batch.map((b) => `${b.title}\n${b.content}`), key, provider.account_ref);
      const rows = batch.map((b, k) => ({ ...b, embedding: JSON.stringify(vectors[k]), updated_at: new Date().toISOString() }));
      const { error } = await db.from("assistant_chunks").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
      done += batch.length;
    }

    const complete = done === changed.length;
    const chunks = existing.size - gone.length + changed.filter((c, i) => i < done && !existing.has(c.id)).length;
    await report({ index_chunks: chunks, index_error: null, ...(complete && { index_built_at: new Date().toISOString() }) });
    return {
      ok: true,
      chunks,
      complete,
      message: complete ? `The index is up to date: ${chunks.toLocaleString("en-PH")} passages.` : `Indexed ${done.toLocaleString("en-PH")} of ${changed.length.toLocaleString("en-PH")} changes. Run it again to finish.`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The index couldn’t be built.";
    console.error(`Assistant index: ${message}`);
    await report({ index_error: message.slice(0, 300) }).catch(() => {});
    return { ok: false, message: "The index couldn’t be built. Try again in a moment." };
  }
}
