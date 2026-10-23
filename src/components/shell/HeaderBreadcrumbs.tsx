"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { RANKINGS } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { NAV, type Variant } from "./nav";

export function HeaderBreadcrumbs({ variant }: { variant: Variant }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navItems = NAV[variant].flatMap((group) => group.items);
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const item = navItems.find((entry) => entry.href === href);
    const ranking = index > 1 && segments[1] === "rankings" ? RANKINGS.find((entry) => entry.slug === segment) : undefined;
    return {
      href,
      label: item?.label ?? ranking?.short ?? segment.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
    };
  });

  if (pathname === "/admin") {
    const rankings = searchParams.get("view") === "rankings";
    breadcrumbs.push({
      href: rankings ? "/admin?view=rankings" : "/admin",
      label: rankings ? "Rankings Overview" : "Submissions Overview",
    });
  }

  return (
    <nav className="top__breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {breadcrumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.href}`}>
            {index > 0 && <Icon name="chevron" size={14} />}
            {index === breadcrumbs.length - 1 ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
