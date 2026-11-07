#!/usr/bin/env node
/**
 * 연결 대조 — 화면을 고친 뒤 원래 있던 연결이 빠지지 않았는지 확인한다.
 * (hallmark redesign 의 --before / --kept 를 이 저장소에 맞게 옮김. github.com/Nutlope/hallmark, MIT)
 *
 *   node scripts/ds/wiring.mjs                    # 기준: origin/main
 *   node scripts/ds/wiring.mjs --base=0afa78e     # 기준 커밋 지정
 *   node scripts/ds/wiring.mjs --base=HEAD~3 --file=diary
 *
 * 파일마다 기준 커밋과 지금 코드에서 아래를 뽑아 비교한다.
 *   실패(FAIL)  API 호출 경로 · 페이지 이동 경로(href·router.push) · 입력 name · id · data-testid
 *   경고(WARN)  핸들러 이름(handleX / onX = …) · localStorage 키
 * 사라진 것이 의도라면 그 파일에  // ds-wiring-drop: <항목> — <이유>  를 남긴다.
 * 실패가 있으면 exit 1.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const BASE = arg("base", "origin/main");
const FILTER = arg("file", "");
const SCAN = ["src/app", "src/components"];

const norm = (s) => s.replace(/\$\{[^}]*\}/g, "*").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";

const EXTRACT = {
  api: { level: "FAIL", label: "API 호출", re: /fetch\(\s*[`"']((?:\/api)[^`"'\s]*)/g, map: norm },
  route: { level: "FAIL", label: "이동 경로", re: /(?:href[=:]\{?\s*[`"']|router\.(?:push|replace)\(\s*[`"']|redirect\(\s*[`"']|window\.location\.href\s*=\s*[`"'])(\/[^`"'\s]*)/g, map: norm },
  name: { level: "FAIL", label: "입력 name", re: /\bname=["']([\w-]+)["']/g },
  // SVG 그라데이션 정의 id 는 그라데이션 금지로 지워질 수 있어 뺀다
  id: { level: "FAIL", label: "id", re: /(?<!Gradient[^>]{0,40})\bid=["']([\w-]+)["']/g },
  testid: { level: "FAIL", label: "data-testid", re: /data-testid=["']([\w-]+)["']/g },
  handler: { level: "WARN", label: "핸들러", re: /(?:const|function)\s+(handle[A-Z]\w*|on[A-Z]\w*)\b/g },
  storage: { level: "WARN", label: "localStorage 키", re: /localStorage\.(?:get|set|remove)Item\(\s*["'`]([\w-]+)/g },
};

function extract(src) {
  const out = {};
  for (const [k, { re, map }] of Object.entries(EXTRACT)) {
    out[k] = new Set([...src.matchAll(re)].map((m) => (map ? map(m[1]) : m[1])));
  }
  return out;
}

function walk(dir, list = []) {
  if (!existsSync(dir)) return list;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, list); else if (/\.(tsx|ts)$/.test(n)) list.push(p);
  }
  return list;
}

function git(cmd) { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }

let baseFiles;
try { baseFiles = git(`ls-tree -r --name-only ${BASE} -- ${SCAN.join(" ")}`).split("\n").filter((f) => /\.(tsx|ts)$/.test(f)); }
catch { console.error(`기준 커밋 ${BASE} 을 찾지 못했어요. --base=<커밋> 으로 지정하세요.`); process.exit(2); }
baseFiles = baseFiles.filter((f) => !f.startsWith("src/app/api/") && (!FILTER || f.includes(FILTER)));

const nowFiles = new Set(SCAN.flatMap((d) => walk(join(ROOT, d))).map((p) => relative(ROOT, p).replaceAll("\\", "/")));
const nowAll = {}; // 저장소 전체 — 다른 파일로 옮겨진 연결은 빠진 것이 아니다
for (const f of nowFiles) {
  const e = extract(readFileSync(join(ROOT, f), "utf8"));
  for (const [k, set] of Object.entries(e)) { nowAll[k] ||= new Set(); for (const v of set) nowAll[k].add(v); }
}

const fails = [], warns = [];
let checked = 0;
for (const f of baseFiles) {
  let before;
  try { before = git(`show ${BASE}:${f}`); } catch { continue; }
  checked++;
  const nowSrc = nowFiles.has(f) ? readFileSync(join(ROOT, f), "utf8") : "";
  const drops = [...nowSrc.matchAll(/ds-wiring-drop:\s*(\S+)/g)].map((m) => m[1]);
  const b = extract(before), n = extract(nowSrc);
  for (const [k, def] of Object.entries(EXTRACT)) {
    for (const v of b[k]) {
      if (n[k].has(v) || drops.includes(v)) continue;
      const movedElsewhere = nowAll[k]?.has(v);
      const item = { file: f, kind: def.label, value: v, moved: movedElsewhere, missingFile: !nowFiles.has(f) };
      if (def.level === "FAIL" && !movedElsewhere) fails.push(item); else warns.push(item);
    }
  }
}

const show = (it) => `  ${it.file}  ${it.kind}: ${it.value}${it.moved ? "  (다른 파일로 옮겨짐)" : ""}${it.missingFile ? "  (파일이 사라짐)" : ""}`;
if (fails.length) { console.log(`실패 — 기준(${BASE})에 있던 연결이 사라졌어요`); fails.forEach((x) => console.log(show(x))); }
if (warns.length) { console.log(`\n경고 — 이름이 바뀌었거나 다른 파일로 옮겨졌어요 (의도면 넘어가도 됩니다)`); warns.forEach((x) => console.log(show(x))); }
console.log(`\n[ds:wiring] 기준 ${BASE} · 파일 ${checked}개 · 실패 ${fails.length} · 경고 ${warns.length}`);
process.exitCode = fails.length ? 1 : 0;
