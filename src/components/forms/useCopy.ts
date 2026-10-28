"use client";

/*
 * A form's answers on its page. Answered straight from the form's link they live on this page (the responder keeps
 * a draft on the device). In a team copy they're the copy's, and live:
 *
 * - Each change goes to the other pages as it's typed, over the copy's Supabase Realtime channel (a few times a
 *   second at most), and shows there at once unless they're editing that question themselves.
 * - It's saved to the server by question once typing pauses: 3 seconds while the channel is up (the others already
 *   see it), 1 second while it's down, and at least every 10 seconds while typing goes on, or at once when the tab is
 *   hidden. The save tells the other pages, which then take the copy as saved. The server's copy is the record
 *   (lib/forms/copies.ts): a change seen live is settled by it.
 * - The channel says who is here, on which step and in which question (`peers`), for the faces and the coloured
 *   flags on the questions others are in.
 * - Every few seconds (less often while the channel is up) the page asks the server what changed, so a missed
 *   message or a dropped channel loses nothing; that ask also says when the copy has been sent.
 *
 * A page that can't reach the server keeps its changes and tries again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { pullFormCopy, saveFormCopy, type CopyPulse } from "@/app/actions/form-copies";
import { toast } from "@/components/ui/toast";
import { liveChannel, markSaved, newBook, patchOf, peerColor, profileAvatar, takeLive, takeRemote, unsaved, type CopyAccess } from "@/lib/forms/copies";
import type { Answers, Value } from "@/lib/forms/types";
import type { CopyStage, CopyView } from "@/lib/governance/hub-types";

/**
 * A save waits this long after the last change: longer while the channel is up, since the others already see it, and
 * never longer than SAVE_MAX_MS after the first change not yet saved. Changes go live at most every LIVE_MS; the
 * server is asked for others' changes every PULL_MS, or PULL_LIVE_MS while the channel is up.
 */
const SAVE_MS = 3000;
const SAVE_SOLO_MS = 1000;
const SAVE_MAX_MS = 10_000;
const LIVE_MS = 120;
const PULL_MS = 4000;
const PULL_LIVE_MS = 15_000;
const RETRY_MS = 5000;

export type CopySync = "saved" | "saving" | "offline";

/** Someone else with the copy open: where they are, and their colour. */
export interface Peer {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  /** The step they're on (-1 the privacy notice), and the question they're in; unknown without the live channel. */
  step?: number;
  field?: string | null;
}

export interface CopyLive {
  sync: CopySync;
  /** The live channel is up. */
  realtime: boolean;
  /** Everyone else with the copy open. */
  peers: Peer[];
  edited?: { by: string; at: string };
  label: string;
  access: CopyAccess;
  sent?: { ref: string; at: string; stages: CopyStage[] };
  /** The copy is gone, or private to others now. */
  lost?: "gone" | "denied";
}

type Fail = Extract<CopyPulse, { ok: false }>;

/** What a page shares about itself on the channel. */
type Here = { name: string; avatar?: string; step: number; field: string | null };

/** This browser's id among the pages in a copy: random, kept on the device. */
function deviceId() {
  const fresh = () => crypto.getRandomValues(new Uint8Array(12)).reduce((s, b) => s + "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36], "");
  try {
    const kept = localStorage.getItem("hub-form-device");
    if (kept && /^[a-z0-9]{12}$/.test(kept)) return kept;
    const made = fresh();
    localStorage.setItem("hub-form-device", made);
    return made;
  } catch {
    return fresh();
  }
}

/** One Supabase client per page, for Realtime only: no session of its own. */
let realtime: Promise<SupabaseClient> | null = null;
const realtimeClient = () =>
  (realtime ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  ));

const peersOf = (ch: RealtimeChannel, me: string): Peer[] =>
  Object.entries(ch.presenceState<Here>())
    .filter(([id]) => id !== me)
    .map(([id, metas]) => {
      const m = metas.at(-1);
      return { id, name: m?.name?.trim() || "Guest", avatar: profileAvatar(m?.avatar), color: peerColor(id), step: typeof m?.step === "number" ? m.step : undefined, field: typeof m?.field === "string" ? m.field : null };
    });

export function useAnswers(
  code: string,
  copy?: CopyView,
  options: {
    /** The page's name for the others. */
    name?: string;
    avatar?: string;
    /** A value typed elsewhere, as this page may show it (the form's rules, while filled in); null for a question it doesn't have. */
    accept?: (key: string, raw: unknown) => { value: Value | undefined } | null;
  } = {},
) {
  const ref = useRef<Answers>(copy?.answers ?? {});
  const [answers, setAnswers] = useState<Answers>(ref.current);
  const book = useRef(newBook(ref.current));
  const version = useRef(copy?.version ?? 0);
  const halted = useRef(false);
  const kick = useRef<((changed: string[]) => void) | null>(null);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const hereRef = useRef<Here>({ name: options.name ?? "", avatar: profileAvatar(options.avatar), step: -1, field: null });
  const shareHere = useRef<(() => void) | null>(null);
  const sentRef = useRef<(() => void) | null>(null);
  const accept = useRef(options.accept);
  accept.current = options.accept;
  const [live, setLive] = useState<CopyLive | null>(() =>
    copy
      ? {
          sync: "saved",
          realtime: false,
          peers: copy.here.map((p) => ({ ...p, color: peerColor(p.id) })),
          edited: copy.edited,
          label: copy.label,
          access: copy.access,
          ...(copy.sent && { sent: { ref: copy.ref, ...copy.sent } }),
        }
      : null,
  );
  const token = copy?.token;
  const firstLive = copy?.live;
  const sentAtStart = !!copy?.sent;

  const show = useCallback((next: Answers) => {
    ref.current = next;
    setAnswers(next);
  }, []);

  /** Change the answers on this page; in a copy, the others see it at once and it's saved a moment later. */
  const update = useCallback(
    (next: Answers | ((a: Answers) => Answers)) => {
      const before = ref.current;
      show(typeof next === "function" ? next(before) : next);
      if (!kick.current) return;
      const after = ref.current;
      kick.current([...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]));
    },
    [show],
  );

  /** Where this page is, for the others: the step, and the question with the cursor in it. */
  const setHere = useCallback((here: { step: number; field: string | null }) => {
    if (hereRef.current.step === here.step && hereRef.current.field === here.field) return;
    hereRef.current = { ...hereRef.current, ...here };
    shareHere.current?.();
  }, []);

  useEffect(() => {
    if (!token || sentAtStart || !firstLive) return;
    halted.current = false;
    // This run of the effect, left behind once it's cleaned up (React runs effects twice in development).
    let disposed = false;
    const off = () => disposed || halted.current;
    const device = deviceId();
    let busy: Promise<void> | null = null;
    let timer: number | undefined;
    let failures = 0;
    let said = "";
    let soon = false;
    // The live channel, and what's waiting to go out on it.
    let channelName = "";
    let channel: RealtimeChannel | null = null;
    let connected = false;
    let pending: { set: Answers; unset: Set<string> } = { set: {}, unset: new Set() };
    let liveTimer: number | undefined;
    let hereTimer: number | undefined;
    // Answers shown live from another page, until the server settles them.
    const settle = new Set<string>();
    let lastLive = 0;
    // When the oldest change not yet saved was made: 0 while everything is saved.
    let unsavedSince = 0;
    const saveIn = () => Math.max(0, Math.min(connected ? SAVE_MS : SAVE_SOLO_MS, unsavedSince + SAVE_MAX_MS - Date.now()));

    const stop = () => {
      halted.current = true;
      window.clearTimeout(timer);
      window.clearTimeout(liveTimer);
      window.clearTimeout(hereTimer);
      leave();
    };
    const dirty = () => unsaved(ref.current, book.current).length > 0;
    const settled = () => {
      failures = 0;
      said = "";
    };
    const setPeers = () => {
      const ch = channel;
      if (ch) setLive((l) => l && { ...l, peers: peersOf(ch, device) });
    };

    const fail = (r: Fail | null) => {
      if (r?.why === "gone" || r?.why === "denied") {
        stop();
        setLive((l) => l && { ...l, lost: r.why as "gone" | "denied" });
        return;
      }
      // Sent by someone else: the next ask brings the receipt.
      if (r?.why === "sent") {
        soon = true;
        return;
      }
      failures++;
      setLive((l) => l && { ...l, sync: "offline" });
      const message = r?.message ?? "The copy can’t be reached right now. Your changes stay here and are saved once it can.";
      if (message !== said) toast((said = message), "error");
    };

    /* ---------- The live channel ---------- */

    function leave() {
      const ch = channel;
      channel = null;
      connected = false;
      if (ch) void realtimeClient().then((c) => c.removeChannel(ch));
    }

    async function join(id: string) {
      const name = liveChannel(id);
      if (name === channelName) return;
      leave();
      channelName = name;
      const client = await realtimeClient().catch(() => null);
      if (!client || off() || channelName !== name) return;
      // A channel on this topic left a moment ago must be gone before it's joined again: the client hands back the old one.
      for (const old of client.getChannels()) if (old.topic === `realtime:${name}`) await client.removeChannel(old);
      if (off() || channelName !== name) return;
      const ch = client.channel(name, { config: { broadcast: { self: false }, presence: { key: device } } });
      channel = ch;
      ch.on("broadcast", { event: "edit" }, ({ payload }) => {
        const { set, unset } = (payload ?? {}) as { set?: Record<string, unknown>; unset?: unknown };
        let next: Answers | null = null;
        const take = (k: string, raw: unknown) => {
          const ok = accept.current?.(k, raw);
          if (!ok) return;
          next = takeLive(next ?? ref.current, k, ok.value, book.current, settle) ?? next;
        };
        if (set && typeof set === "object") for (const [k, v] of Object.entries(set)) take(k, v);
        if (Array.isArray(unset)) for (const k of unset) if (typeof k === "string") take(k, undefined);
        if (next) {
          lastLive = Date.now();
          show(next);
        }
      })
        .on("broadcast", { event: "saved" }, ({ payload }) => {
          // Someone saved: take the copy as saved soon, which settles what was shown live.
          if (typeof payload?.version === "number" && payload.version > version.current && !busy) plan(150);
          else soon = true;
        })
        .on("presence", { event: "sync" }, setPeers)
        .subscribe((status) => {
          if (channel !== ch) return;
          connected = status === "SUBSCRIBED";
          setLive((l) => l && { ...l, realtime: connected });
          if (connected) void ch.track(hereRef.current);
        });
    }

    const sendLive = () => {
      window.clearTimeout(liveTimer);
      liveTimer = undefined;
      const set = pending.set;
      const unset = [...pending.unset];
      pending = { set: {}, unset: new Set() };
      // Off the channel, the save carries the change instead.
      if (connected && channel && (Object.keys(set).length || unset.length)) void channel.send({ type: "broadcast", event: "edit", payload: { set, unset } });
    };

    sentRef.current = () => {
      // Sending moved the copy one version on: the others take it, and its receipt, at once.
      if (connected && channel) void channel.send({ type: "broadcast", event: "saved", payload: { version: version.current + 1 } });
    };

    shareHere.current = () => {
      window.clearTimeout(hereTimer);
      hereTimer = window.setTimeout(() => connected && channel && void channel.track(hereRef.current), 200);
    };

    /* ---------- Saving and asking ---------- */

    const save = async (keys: string[]) => {
      const sent = ref.current;
      const { set, unset } = patchOf(sent, keys);
      setLive((l) => l && { ...l, sync: "saving" });
      const r = await saveFormCopy({ code, token, known: version.current, set, unset }).catch(() => null);
      if (off()) return;
      if (!r || !r.ok) return fail(r);
      settled();
      markSaved(sent, keys, r.kept, book.current);
      // Typed while saving: those changes start their own wait.
      unsavedSince = dirty() ? Date.now() : 0;
      version.current = r.version;
      if (r.answers) show(takeRemote(ref.current, r.answers, book.current, settle));
      if (connected && channel) void channel.send({ type: "broadcast", event: "saved", payload: { version: r.version } });
      setLive((l) => l && { ...l, sync: dirty() ? "saving" : "saved" });
    };

    const pull = async () => {
      // Answers shown live that no save has settled for a while: ask for the whole copy.
      const stale = settle.size > 0 && Date.now() - lastLive > 8000;
      const r = await pullFormCopy({ code, token, known: stale ? -1 : version.current, device }).catch(() => null);
      if (off()) return;
      if (!r || !r.ok) return fail(r);
      settled();
      if (r.answers) show(takeRemote(ref.current, r.answers, book.current, settle));
      version.current = r.version;
      void join(r.live);
      setLive(
        (l) =>
          l && {
            ...l,
            sync: dirty() ? "saving" : "saved",
            // The channel knows who is where; without it, the server's list.
            peers: connected && channel ? peersOf(channel, device) : r.here.filter((p) => p.id !== device).map((p) => ({ ...p, color: peerColor(p.id) })),
            edited: r.edited,
            label: r.label,
            access: r.access,
            ...(r.sent && { sent: r.sent }),
          },
      );
      if (r.sent) {
        stop();
        toast(`This copy was sent as ${r.sent.ref}.`, "info");
      }
    };

    const run = (): Promise<void> => {
      if (busy) return busy;
      if (off()) return Promise.resolve();
      window.clearTimeout(timer);
      soon = false;
      const keys = unsaved(ref.current, book.current);
      busy = (keys.length ? save(keys) : pull()).finally(() => {
        busy = null;
        plan();
      });
      return busy;
    };

    function plan(ms?: number) {
      if (off()) return;
      window.clearTimeout(timer);
      const wait = ms ?? (failures ? Math.min(30_000, RETRY_MS * failures) : dirty() ? saveIn() : soon ? 150 : document.visibilityState === "hidden" ? undefined : connected ? PULL_LIVE_MS : PULL_MS);
      if (wait !== undefined) timer = window.setTimeout(() => void run(), wait);
    }

    kick.current = (changed) => {
      for (const k of changed) {
        if (ref.current[k] === undefined) {
          pending.unset.add(k);
          delete pending.set[k];
        } else {
          pending.set[k] = ref.current[k];
          pending.unset.delete(k);
        }
        // Edited here now: whatever came live for it is this page's to settle.
        settle.delete(k);
      }
      if (liveTimer === undefined) liveTimer = window.setTimeout(sendLive, LIVE_MS);
      if (!unsavedSince) unsavedSince = Date.now();
      // Waiting to save shows as saving, not as saved.
      setLive((l) => (l && l.sync === "saved" ? { ...l, sync: "saving" } : l));
      if (!busy) plan(saveIn());
    };
    flushRef.current = async () => {
      for (let i = 0; i < 5 && !halted.current; i++) {
        if (busy) await busy;
        if (!dirty()) return true;
        await run();
        if (failures) return false;
      }
      return !dirty();
    };

    const onVisible = () => {
      // Back in view: catch up at once. Hidden (another tab, a locked phone): save what's waiting now.
      if (document.visibilityState === "visible" ? !busy : dirty()) plan(0);
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!dirty()) return;
      void run();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onLeave);
    void join(firstLive);
    plan(600);
    return () => {
      disposed = true;
      stop();
      kick.current = null;
      flushRef.current = null;
      shareHere.current = null;
      sentRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [code, token, firstLive, sentAtStart, show]);

  /** Save what's left before sending: true once the server has every change. */
  const flush = useCallback(async () => (flushRef.current ? flushRef.current() : true), []);

  /** This page sent the copy: stop keeping it in step. */
  const markSent = useCallback((sent: { ref: string; at: string; stages: CopyStage[] }) => {
    sentRef.current?.();
    halted.current = true;
    setLive((l) => l && { ...l, sent, peers: [] });
  }, []);

  return { answers, update, live, setLive, flush, markSent, setHere };
}
