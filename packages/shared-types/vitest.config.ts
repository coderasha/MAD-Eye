import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", fileParallelism: false, pool: "threads", exclude: ["**/node_modules/**", "**/dist/**"] },
});
