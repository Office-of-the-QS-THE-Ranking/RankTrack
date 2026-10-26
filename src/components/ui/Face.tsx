"use client";

import { useState, type ReactNode } from "react";

/**
 * A person's Google profile photo inside an avatar, or the avatar's own content (initials, an icon) when
 * they have none or it fails to load. Google serves these without a referrer only, hence the policy.
 */
export function Face({ src, children }: { src?: string; children: ReactNode }) {
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return <>{children}</>;
  return <img className="face" src={src} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(src)} />;
}
