#!/usr/bin/env node
/** 빌드 정보 — 어느 커밋이 배포됐는지 기준 페이지에 보이게 (prebuild 에서 실행) */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const git = (c) => { try { return execSync(`git ${c}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const info = {
  builtAt: new Date().toISOString(),
  sha: process.env.VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD"),
  message: (process.env.VERCEL_GIT_COMMIT_MESSAGE || git("log -1 --pretty=%s")).split("\n")[0].slice(0, 120),
  branch: process.env.VERCEL_GIT_COMMIT_REF || git("rev-parse --abbrev-ref HEAD"),
  env: process.env.VERCEL_ENV || "local",
};
mkdirSync(join(ROOT, "scripts/ds/metrics"), { recursive: true });
writeFileSync(join(ROOT, "scripts/ds/metrics/build.json"), JSON.stringify(info, null, 2));
console.log(`[ds:build-info] ${info.sha.slice(0, 7)} ${info.branch} (${info.env})`);
