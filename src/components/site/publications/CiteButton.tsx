"use client";

import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";

/** Copies the reference list entry. The clipboard can refuse (an insecure page, a denied permission): the toast says so. */
export function CiteButton({ text, className = "w-docbtn", label = "Cite" }: { text: string; className?: string; label?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => toast("Citation copied.", "ok"))
          .catch(() => toast("Couldn’t copy. Select the citation and copy it instead.", "error"))
      }
    >
      <Icon name="quote" size={16} />
      {label}
    </button>
  );
}
