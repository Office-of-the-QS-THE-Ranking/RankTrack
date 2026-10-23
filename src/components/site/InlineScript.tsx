"use client";

/**
 * Runs once while the HTML is parsed, before the first paint. On the client the element is inert
 * (type="text/plain"), so React neither warns about it nor runs it again on soft navigations.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
