import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bindery's tests generate and embed full 300-DPI page images, which
    // takes longer than vitest's 5s default.
    testTimeout: 30000,
  },
});
