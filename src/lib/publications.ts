/*
 * Publications: Stories & News, Research Articles, and Reports & Insights. One list of the three sections, so
 * the public website, the Office workspace's sidebar and every link to a story, article or report agree.
 */
import type { IconName } from "@/components/ui/Icon";
import type { DocumentKind } from "@/lib/governance/types";

export type PublicationSection = "stories" | "research" | "reports";

export const PUBLICATIONS_LABEL = "Publications";

export const PUBLICATION_SECTIONS: { key: PublicationSection; label: string; icon: IconName; note: string }[] = [
  { key: "stories", label: "Stories & News", icon: "newspaper", note: "Thomasian work with a measured result" },
  { key: "research", label: "Research Articles", icon: "research", note: "Peer-reviewed work by Thomasian authors" },
  { key: "reports", label: "Reports & Insights", icon: "data", note: "The Office’s reports, briefs and analyses" },
];

export const sectionLabel = (key: PublicationSection) => PUBLICATION_SECTIONS.find((s) => s.key === key)!.label;

/** Where each kind of document lives. */
export const SECTION_OF: Record<DocumentKind, Exclude<PublicationSection, "stories">> = { article: "research", report: "reports" };

/* Public website */
export const PUBLICATIONS_PATH = "/publications";
export const publicationsPath = (section: PublicationSection) => `${PUBLICATIONS_PATH}/${section}`;
export const storyPath = (slug: string) => `${PUBLICATIONS_PATH}/stories/${slug}`;
export const documentPublicPath = (kind: DocumentKind, slug: string) => `${PUBLICATIONS_PATH}/${SECTION_OF[kind]}/${slug}`;

/* Office workspace */
export const OFFICE_PUBLICATIONS_PATH = "/admin/publications";
export const officePublicationsPath = (section: PublicationSection) => `${OFFICE_PUBLICATIONS_PATH}/${section}`;
/** A post opened in the Office's composer. */
export const officeStoryPath = (slug: string) => `${officePublicationsPath("stories")}#${slug}`;
