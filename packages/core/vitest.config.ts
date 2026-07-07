import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The db client is constructed at import time; tests only exercise pure
    // logic, so a dummy connection string keeps imports from throwing.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test",
    },
  },
});
