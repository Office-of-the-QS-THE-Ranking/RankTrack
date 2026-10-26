/*
 * The composer's Preview hands its draft to a tab of the public website through this browser's storage, and keeps
 * it current while the composer stays open. Pictures still uploading travel as the composer's local copies, which
 * the preview tab can show because both pages share an origin.
 */
import type { StoryPost } from "@/lib/data";

export const PREVIEW_PATH = "/preview/post";
export const PREVIEW_WINDOW = "hub-post-preview";
const KEY = "hub.post-preview";

export type PostPreviewDraft = { title: string; unit: string; postedAt: string; sdgs: number[]; themes: string[]; post: StoryPost };

export function writePreview(draft: PostPreviewDraft | null) {
  try {
    if (draft) localStorage.setItem(KEY, JSON.stringify(draft));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the preview tab says there is nothing to show.
  }
}

/** The stored draft as text, so it can be compared cheaply between renders. */
export function readPreview(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Calls back when the composer, in another tab, changes the draft. */
export function watchPreview(onChange: () => void) {
  const on = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", on);
  return () => window.removeEventListener("storage", on);
}
