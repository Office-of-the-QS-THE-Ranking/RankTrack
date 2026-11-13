"use client";

/*
 * The office lines under the portal's name (sidebar, sign-in): the Office of the Rector and the Office of
 * QS/THE Rankings take turns every ten seconds with a soft cross-fade. Both lines share one grid cell, so the
 * line keeps the width of the longer and nothing beside it moves. Screen readers get both offices once, not the
 * swaps. Reduced motion keeps the swap but drops the fade (styles in shell.css).
 */
import { useEffect, useState } from "react";
import { PORTAL_SUBTITLES, PORTAL_SUBTITLE_MS } from "@/lib/brand";

export function OfficeSwap({ className }: { className?: string }) {
  const [on, setOn] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setOn((i) => (i + 1) % PORTAL_SUBTITLES.length), PORTAL_SUBTITLE_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <span className={className}>
      <span className="sr-only">{PORTAL_SUBTITLES.join(", ")}</span>
      <span className="office-swap" aria-hidden="true">
        {PORTAL_SUBTITLES.map((line, i) => (
          <span key={line} className={`office-swap__line${i === on ? " is-on" : ""}`}>
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
