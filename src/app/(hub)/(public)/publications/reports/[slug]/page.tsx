import { notFound } from "next/navigation";
import { DocumentDetail, relatedDocuments } from "@/components/site/publications/DocumentDetail";
import { siteData } from "@/lib/governance/server/site";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = (await siteData()).reports.find((d) => d.slug === slug);
  if (!r) return { title: "Report" };
  return { title: r.title, description: r.abstract.slice(0, 160) || r.type };
}

export default async function Report({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Published through the workflow, with Publications switched on.
  const { reports } = await siteData();
  const report = reports.find((d) => d.slug === slug);
  if (!report) notFound();
  return <DocumentDetail doc={report} more={relatedDocuments(report, reports)} />;
}
