"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function ClickableTableRow({ href, children }: { href?: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <tr
      className={href ? "table__clickable-row" : undefined}
      onClick={href ? (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if ((event.target as Element).closest("a, button, input, select, textarea, [role='button']")) return;
        if (window.getSelection()?.toString()) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        router.push(href, { scroll: false });
      } : undefined}
    >
      {children}
    </tr>
  );
}
