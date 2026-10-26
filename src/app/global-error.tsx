"use client";

/*
 * When the root layout itself fails (the reference data or the store unreachable on a fresh server, most
 * often), this replaces the whole document. It has no stylesheet, reference data or fonts of its own, so it
 * stands alone: night colours, system fonts, and a way to try again.
 */
import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#121110", color: "#f3efe6", fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif" }}>
        <title>The Hub is unavailable · UST Global Rankings and Impact Hub</title>
        <main style={{ maxWidth: 440, padding: "32px 24px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c9a227" }}>UST Global Rankings and Impact Hub</p>
          <h1 style={{ margin: "12px 0 8px", fontSize: 28, fontWeight: 600 }}>The Hub is unavailable</h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.5, color: "#c8c2b6" }}>
            It couldn&rsquo;t reach its data just now. Try again in a moment{error.digest ? `; if it keeps happening, quote reference ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ font: "inherit", fontSize: 14, padding: "10px 20px", borderRadius: 8, border: 0, background: "#c9a227", color: "#121110" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
