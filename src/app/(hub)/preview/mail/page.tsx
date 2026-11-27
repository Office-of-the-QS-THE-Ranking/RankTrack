import { buildSeed } from "@/lib/governance/seed";
import { PreviewMail } from "./PreviewMail";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const seed = buildSeed({ directory: [], rankings: [] } as never);
  return <PreviewMail templates={seed.config.templates} state={state ?? "live"} />;
}
