/* `npm run test:assistant-live`: real models with the keys saved on the AI Assistant tab. Never part of `npm test` or CI. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const file = path.resolve(import.meta.dirname, ".env.local");
const env = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
    )
  : {};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "scripts/store/shim/server-only/index.js"),
    },
  },
  // Real data, whatever a local .env.local turns on for presentations.
  test: { include: ["tests/live/**/*.live.ts"], environment: "node", env: { ...env, NEXT_PUBLIC_DEMO_DATA: "0" }, testTimeout: 1_200_000 },
});
