import { notFound } from "next/navigation";
import { PUBLISHED_STORIES, storyBySlug } from "@/lib/data";
import { excerpt } from "@/lib/governance/posts";
import { siteData } from "@/lib/governance/server/site";
import { PostDetail } from "@/components/site/impact/PostDetail";
import { StoryDetail } from "@/components/site/impact/StoryDetail";
import { PostViewTracker } from "@/components/impact/PostViewTracker";

export function generateStaticParams() {
  return PUBLISHED_STORIES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = (await siteData()).story(slug) ?? storyBySlug(slug);
  if (!s) return { title: "Impact story" };
  return { title: s.title, description: s.post ? s.post.subtitle || excerpt(s.post.body, 160) : `${s.challenge} ${s.outcome}` };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Published through the workflow, with the stories dataset Public and the library switched on.
  const story = (await siteData()).story(slug);
  if (!story) notFound();
  return <><PostViewTracker slug={story.slug} />{story.post ? <PostDetail story={story} post={story.post} /> : <StoryDetail story={story} />}</>;
}
