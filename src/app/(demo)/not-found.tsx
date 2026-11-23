import { PORTAL_NAME } from "@/lib/brand";

/** A demo address that doesn't exist, or the demo while it is switched off. */
export default function DemoNotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>{PORTAL_NAME}</p>
        <h1 style={{ margin: "12px 0 8px", fontSize: 28 }}>Page not found</h1>
        <p style={{ margin: 0 }}>
          <a href="/">Go to the home page</a>
        </p>
      </div>
    </main>
  );
}
