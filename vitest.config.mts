import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Next.js's server-only guard throws outside a React Server Components build.
      "server-only": path.resolve(import.meta.dirname, "scripts/store/shim/server-only/index.js"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
