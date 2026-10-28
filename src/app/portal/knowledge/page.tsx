import { redirect } from "next/navigation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The Knowledge Center moved into the Workspace; old links keep their search. */
export default async function KnowledgeMovedPage({ searchParams }: Props) {
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (v === undefined ? [] : [v].flat().map((x) => [k, x] as [string, string])))).toString();
  redirect(`/portal/workspace/knowledge${q ? `?${q}` : ""}`);
}
