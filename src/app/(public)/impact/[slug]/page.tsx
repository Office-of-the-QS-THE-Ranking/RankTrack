import { notFound } from "next/navigation";
import { PUBLISHED_STORIES, storyBySlug } from "@/lib/data";
import { siteData } from "@/lib/governance/server/site";
import { StoryDetail } from "@/components/site/impact/StoryDetail";

export function generateStaticParams() {
  return PUBLISHED_STORIES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = siteData().story(slug) ?? storyBySlug(slug);
  return s ? { title: s.title, description: `${s.challenge} ${s.outcome}` } : { title: "Impact story" };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Published through the workflow, with the stories dataset Public and the library switched on.
  const story = siteData().story(slug);
  if (!story) notFound();
  return <StoryDetail story={story} />;
}
