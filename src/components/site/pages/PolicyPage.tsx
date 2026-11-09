import type { ReactNode } from "react";
import { PageHero } from "../PageHero";
import { PageTabs } from "../PageTabs";

export interface PolicySection {
  id: string;
  /** The heading beside the text. */
  title: string;
  /** The short name in the row of tabs. */
  tab: string;
  body: ReactNode;
}

/** A policy page: the title, what it is, and its sections. With no sections, a note that its text is on its way. */
export function PolicyPage({ title, lead, sections }: { title: string; lead?: ReactNode; sections?: PolicySection[] }) {
  if (!sections) return <PageHero title={title} lead={<p>This page is being prepared. Its full text will be published here soon.</p>} />;
  return (
    <>
      <PageHero title={title} lead={lead} />
      <PageTabs label={title} items={sections.map((s) => ({ id: s.id, label: s.tab }))} />
      <section className="w-section w-wrap">
        <dl className="w-rows w-policy">
          {sections.map((s) => (
            <div key={s.id} id={s.id}>
              <dt>{s.title}</dt>
              <dd>{s.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
