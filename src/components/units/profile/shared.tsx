import { createContext, useContext, type ReactNode } from "react";

export const TABS = ["Overview", "Submissions", "Recognitions", "History", "Account settings"] as const;
export type ProfileTab = (typeof TABS)[number];

/** Headings under the unit's name: h2 on the unit's own page, h3 in the modal, where the name is an h2. */
export const SectionLevel = createContext<2 | 3>(3);

export function SectionTitle({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  const Tag = useContext(SectionLevel) === 2 ? "h2" : "h3";
  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

/** A heading one level below the section's. */
export function ItemTitle({ className, children }: { className?: string; children: ReactNode }) {
  const Tag = useContext(SectionLevel) === 2 ? "h3" : "h4";
  return <Tag className={className}>{children}</Tag>;
}

export const useSectionLevel = () => useContext(SectionLevel);

/** A name as people write it: directory names often arrive in capitals. */
export const properName = (name: string) =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, mark: string, letter: string) => mark + letter.toUpperCase()) : name;
