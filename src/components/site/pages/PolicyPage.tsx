import { PageHero } from "../PageHero";

/** A policy page awaiting its text: the title and a short note that the content is on its way. */
export function PolicyPage({ title }: { title: string }) {
  return <PageHero title={title} lead={<p>This page is being prepared. Its full text will be published here soon.</p>} />;
}
