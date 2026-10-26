import type { Instrumentation } from "next";

/** Unhandled server errors go to the Hub's alerts (src/lib/alerts.ts), without query strings, headers or cookies. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { alert } = await import("@/lib/alerts");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  await alert("request-error", err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300), {
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    type: context.routeType,
    digest,
  });
};
