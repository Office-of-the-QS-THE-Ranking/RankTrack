/*
 * Team copies of a digital form. A form with copies on doesn't open on its questions: its link builds a copy, and
 * each copy is one response from the start, with the form's next reference and a link of its own. Everyone who
 * opens that link fills in the same answers, saved on the server as they type. A copy is open to anyone with its
 * link, or private: only its owner and the people they add, each signing in with Google.
 *
 * Saving is by question. Each page keeps a book of what the server held for every answer when it last looked, and
 * what this page last sent or took from it: an answer someone else changed replaces this page's, unless it is being
 * edited here and not yet saved, and then this page's goes up with the next save.
 *
 * Live: the pages open on a copy also share each change as it's typed, who is in which question, and each save, over
 * a Supabase Realtime channel (liveChannel). A change typed elsewhere shows at once but stays provisional until the
 * server has it: the next answers from the server settle it, whatever they say. No server code, so pages can import it.
 */
import type { Answers } from "./types";
import { FORM_CODE } from "./kinds";

export type CopyAccess = "link" | "private";

/** A bounded HTTPS profile image; never treat a presence payload as an arbitrary image scheme. */
export function profileAvatar(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 1024) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export const COPY_LIMITS = { label: 80, members: 30, email: 254 } as const;

/** A copy's link token: 22 letters, digits, dashes and underscores (128 random bits). */
export const COPY_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** A copy's own link. */
export const copyPath = (code: string, token: string) => `/f/${code}/${token}`;

/** Where Google sign-in may return to from a form: a form's link or one of its copies. */
export function formBack(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const [, code, token] = /^\/f\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(raw) ?? [];
  if (!code || !FORM_CODE.test(code) || (token !== undefined && !COPY_TOKEN.test(token))) return null;
  return raw;
}

/** What Google sign-in came back with (?signin=…), for a toast. */
export function signInMessage(result: string): { text: string; tone: "ok" | "info" | "error" } {
  switch (result) {
    case "ok":
      return { text: "Signed in with Google.", tone: "ok" };
    case "cancelled":
      return { text: "Google sign-in was cancelled.", tone: "info" };
    case "other-account":
      return { text: "That Google account isn’t the email you entered. Sign in with that email’s account.", tone: "error" };
    case "busy":
      return { text: "Too many sign-ins from your network. Try again in an hour.", tone: "error" };
    case "email":
      return { text: "Enter your email address, like name@ust.edu.ph.", tone: "error" };
    default:
      return { text: "Google sign-in didn’t finish. Try again.", tone: "error" };
  }
}

/** An email as a copy keeps it, or "" if it isn't one. */
export function copyEmail(raw: unknown) {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return email.length <= COPY_LIMITS.email && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(email) ? email : "";
}

/** The Realtime channel of a copy's open pages, by the copy's `live` id. */
export const liveChannel = (live: string) => `form-copy:${live}`;

/** Each person's colour in a copy, by their page: on their face, the question they're in, and the step. */
const PEER_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#db2777", "#0891b2", "#ea580c", "#4f46e5", "#0d9488"];
export function peerColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

/** Initials for a face: "Juan Dela Cruz" → "JC", "maria@ust.edu.ph" → "M". */
export function initials(name: string) {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/* ---------- Saving by question ---------- */

/** Per answer: the server's value as last seen (`remote`), and this page's value as last sent or taken (`base`). */
export interface SyncBook {
  remote: Map<string, string>;
  base: Map<string, string>;
}

const json = (v: unknown) => (v === undefined ? "" : JSON.stringify(v));

const put = (m: Map<string, string>, k: string, v: string) => (v ? m.set(k, v) : m.delete(k));

/** A book for answers just loaded from the server. */
export function newBook(answers: Answers): SyncBook {
  const entries = Object.entries(answers).map(([k, v]) => [k, json(v)] as const);
  return { remote: new Map(entries), base: new Map(entries) };
}

/** The answers changed on this page and not yet saved. */
export function unsaved(local: Answers, book: SyncBook): string[] {
  const keys = new Set([...Object.keys(local), ...book.base.keys()]);
  return [...keys].filter((k) => json(local[k]) !== (book.base.get(k) ?? ""));
}

/** The changes to send for these answers: what to set, and what to clear. */
export function patchOf(local: Answers, keys: string[]): { set: Answers; unset: string[] } {
  const set: Answers = {};
  const unset: string[] = [];
  for (const k of keys) {
    if (local[k] === undefined) unset.push(k);
    else set[k] = local[k];
  }
  return { set, unset };
}

/** After a save: what was sent is this page's saved value; the server kept it as `kept` (absent: cleared). */
export function markSaved(sent: Answers, keys: string[], kept: Answers, book: SyncBook) {
  for (const k of keys) {
    put(book.base, k, json(sent[k]));
    put(book.remote, k, json(kept[k]));
  }
}

/**
 * The server's answers taken in: each answer that changed there since this page last looked replaces this page's,
 * unless this page changed it and hasn't saved yet. `settle` names answers shown live from another page: the server's
 * word on them is taken even if it hasn't changed (the other page may never have saved), and they're taken off the
 * list. Returns the answers to show; the book is brought up to date.
 */
export function takeRemote(local: Answers, server: Answers, book: SyncBook, settle?: Set<string>): Answers {
  const next = { ...local };
  for (const k of new Set([...Object.keys(server), ...book.remote.keys(), ...(settle ?? [])])) {
    const s = json(server[k]);
    const settling = settle?.delete(k) ?? false;
    if (s === (book.remote.get(k) ?? "") && !settling) continue;
    put(book.remote, k, s);
    if (json(local[k]) !== (book.base.get(k) ?? "")) continue;
    if (server[k] === undefined) delete next[k];
    else next[k] = server[k];
    put(book.base, k, s);
  }
  return next;
}

/**
 * An answer typed on another page, shown here at once unless it's being edited here too. It's provisional (added to
 * `settle`) until the server's answers settle it. Returns the answers to show, or null if nothing changed.
 */
export function takeLive(local: Answers, key: string, value: Answers[string] | undefined, book: SyncBook, settle: Set<string>): Answers | null {
  if (json(local[key]) !== (book.base.get(key) ?? "")) return null;
  if (json(local[key]) === json(value)) return null;
  const next = { ...local };
  if (value === undefined) delete next[key];
  else next[key] = value;
  put(book.base, key, json(value));
  settle.add(key);
  return next;
}

/** Resolve a collaborator's location against the sections and questions visible on this page. */
export function peerLocation(peer: { step?: number; field?: string | null }, sections: readonly { fields: readonly { id: string }[] }[]): { step: number; field: string | null } | null {
  if (peer.step === -1) return { step: -1, field: null };
  if (peer.field) {
    const step = sections.findIndex((s) => s.fields.some((f) => f.id === peer.field));
    if (step !== -1) return { step, field: peer.field };
  }
  const step = peer.step;
  if (typeof step === "number" && Number.isInteger(step) && step >= 0 && step < sections.length) return { step, field: null };
  return null;
}
