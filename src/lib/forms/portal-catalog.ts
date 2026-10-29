import type { PortalForm, StudentCopy } from "@/lib/governance/hub-types";

export type CatalogFilter = "all" | "used" | "unused";
export type CatalogOrder = "alphabetical" | "newest" | "recent";

/** Catalog controls use the form's creation date and this student's saved copies. */
export function portalCatalog(forms: PortalForm[], copies: StudentCopy[], query: string, filter: CatalogFilter, order: CatalogOrder) {
  const used = new Map<string, string>();
  for (const copy of copies) {
    const at = copy.edited.at > copy.createdAt ? copy.edited.at : copy.createdAt;
    if (at > (used.get(copy.form.code) ?? "")) used.set(copy.form.code, at);
  }
  const term = query.trim().toLocaleLowerCase();
  const alphabetical = (a: PortalForm, b: PortalForm) => a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true }) || a.code.localeCompare(b.code);
  return forms.filter((f) => {
    const matches = !term || [f.title, f.description, f.issuer, f.reference, f.code].some((s) => s?.toLocaleLowerCase().includes(term));
    return matches && (filter === "all" || (filter === "used" ? used.has(f.code) : !used.has(f.code)));
  }).sort((a, b) => {
    if (order === "newest") return b.createdAt.localeCompare(a.createdAt) || alphabetical(a, b);
    if (order === "recent") return (used.get(b.code) ?? "").localeCompare(used.get(a.code) ?? "") || alphabetical(a, b);
    return alphabetical(a, b);
  });
}
