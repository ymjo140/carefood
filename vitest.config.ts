import { defineConfig } from "vitest/config";
import path from "node:path";

// 돈·상태 계산 시험 — `npm test`. 화면 시험은 ds:audit 가 맡는다.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/**/*.test.ts"], environment: "node", env: { TZ: "UTC" } },
});
