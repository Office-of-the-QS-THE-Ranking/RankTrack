"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Story } from "@/lib/data";
import { readPreview, watchPreview, type PostPreviewDraft } from "@/lib/post-preview";
import { PageHero } from "../PageHero";
import { PostArticle } from "./PostArticle";
import { relatedStories } from "./related";

/** The composer's draft drawn as the public post page, redrawn as the composer changes it. */
export function PostPreviewView({ stories }: { stories: Story[] }) {
  const raw = useSyncExternalStore(watchPreview, readPreview, () => null);
  const draft = useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as PostPreviewDraft) : null;
    } catch {
      return null;
    }
  }, [raw]);

  useEffect(() => {
    document.title = `Preview: ${draft?.title.trim() || "Untitled post"}`;
  }, [draft?.title]);

  if (!draft)
    return (
      <PageHero
        title="Nothing to preview"
        lead={<p>Open Preview from the post composer to see a draft here as the website will show it.</p>}
        actions={
          <Link href="/impact" className="w-link">
            All impact stories
          </Link>
        }
      />
    );

  const story = { slug: "preview", title: draft.title.trim() || "Untitled post", unit: draft.unit, postedAt: draft.postedAt, sdgs: draft.sdgs };
  return <PostArticle story={story} post={draft.post} related={relatedStories(stories, { ...story, themes: draft.themes })} />;
}
