"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/toast";

/** A form's link (or a team copy's) as a clickable address that copies its URL. */
export function FormLink({ url, copied: done = "Form link copied." }: { url: string; copied?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);
  const { host, pathname } = new URL(url);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast(done, "ok");
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy the link. Select the link and copy it.", "error");
    }
  }

  return (
    <div className="fr-form-link">
      <button
        type="button"
        aria-label={copied ? "Copied to clipboard" : `Copy link: ${url}`}
        onClick={() => void copy()}
        onContextMenu={(event) => {
          event.preventDefault();
          void copy();
        }}
        data-copied={copied || undefined}
      >
        <Icon name={copied ? "check" : "link"} size={15} />
        <span aria-live="polite" aria-atomic="true">
          {copied ? "Copied to clipboard" : (
            <>
              <span className="fr-form-link__host">{host}</span>
              {pathname}
            </>
          )}
        </span>
      </button>
    </div>
  );
}
