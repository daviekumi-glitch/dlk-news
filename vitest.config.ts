import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit-test configuration.
 *
 * Only pure logic is covered here (arithmetic, formatting, export builders,
 * slash-command parsing) so the suite stays fast and needs no backend, no DOM
 * and no React runtime. The end-to-end chat flow lives in the Playwright specs
 * under `e2e/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    reporters: ["default"],
  },
});
