import { notFound } from "next/navigation";
import { DocumentDetail, relatedDocuments } from "@/components/site/publications/DocumentDetail";
import { siteData } from "@/lib/governance/server/site";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = (await siteData()).articles.find((d) => d.slug === slug);
  if (!a) return { title: "Research article" };
  return { title: a.title, description: a.abstract.slice(0, 160) || `${a.type}${a.venue ? `, ${a.venue}` : ""}` };
}

export default async function ResearchArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Published through the workflow, with Publications switched on.
  const { articles } = await siteData();
  const article = articles.find((d) => d.slug === slug);
  if (!article) notFound();
  return <DocumentDetail doc={article} more={relatedDocuments(article, articles)} />;
}
