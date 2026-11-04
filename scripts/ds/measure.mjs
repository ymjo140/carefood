#!/usr/bin/env node
/**
 * 디자인 일관성 측정 — 화면 코드(src/app, src/components)에서
 * 색·그라데이션·그림자·글자 크기·둥글기·버튼 모양·인라인 스타일을 센다.
 *
 *   node scripts/ds/measure.mjs            # 표 출력
 *   node scripts/ds/measure.mjs --json     # JSON 출력
 *   node scripts/ds/measure.mjs --save baseline   # scripts/ds/metrics/baseline.json 저장
 *
 * 제외: 디자인 시스템 설명 페이지(src/app/design-system), 디자인 시스템 컴포넌트(src/components/ui),
 *       API 라우트(src/app/api), OG 이미지 등 비화면 파일.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN = ["src/app", "src/components"];
const EXCLUDE = [/^src\/app\/api\//, /^src\/app\/design-system\//, /^src\/components\/ui\//];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const TW_PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const TW_COLOR_UTIL = "bg|text|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|caret|decoration|shadow";

export function measure() {
  const files = SCAN.flatMap((d) => walk(join(ROOT, d)))
    .map((p) => relative(ROOT, p).replaceAll("\\", "/"))
    .filter((p) => !EXCLUDE.some((re) => re.test(p)))
    .filter((p) => !/opengraph|icon|manifest|sitemap|robots/.test(p));

  const colors = new Map();      // value -> count
  const fontSizes = new Map();
  const radii = new Map();
  const buttonShapes = new Set();
  let gradients = 0, shadows = 0, inlineStyles = 0;
  const perFile = {};

  const add = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  for (const f of files) {
    const src = readFileSync(join(ROOT, f), "utf8");
    const fileStats = { colors: 0, inline: 0 };

    // ── 색 ──
    for (const m of src.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      // 앵커/ID 문자열 오탐 방지: 앞 글자가 따옴표·공백·괄호·콜론·[ 인 경우만
      const prev = src[m.index - 1];
      if (!/["'`\s(\[:,]/.test(prev)) continue;
      add(colors, m[0].toLowerCase()); fileStats.colors++;
    }
    for (const m of src.matchAll(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g)) {
      add(colors, m[0].replace(/\s+/g, "")); fileStats.colors++;
    }
    for (const m of src.matchAll(new RegExp(`\\b(?:${TW_COLOR_UTIL})-(?:(?:${TW_PALETTE})-\\d{2,3}|white|black)(?:\\/\\d+)?\\b`, "g"))) {
      add(colors, "tw:" + m[0].replace(/^[a-z]+-/, "")); fileStats.colors++;
    }

    // ── 그라데이션 ──
    gradients += (src.match(/linear-gradient|radial-gradient|conic-gradient|bg-gradient-|bg-linear-|bg-radial|\bfrom-[a-z]/g) || []).length;

    // ── 그림자 ──
    shadows += (src.match(/\bshadow(?:-[\w\[\]\(\),.#/]+)?(?=["'\s`])|boxShadow\s*:/g) || []).length;

    // ── 글자 크기 ──
    for (const m of src.matchAll(/\btext-\[(\d+(?:\.\d+)?(?:px|rem|em))\]/g)) add(fontSizes, m[1]);
    for (const m of src.matchAll(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g)) add(fontSizes, "tw:" + m[1]);
    for (const m of src.matchAll(/fontSize\s*:\s*["']?([\d.]+(?:px|rem|em)?)/g)) add(fontSizes, m[1].endsWith("px") ? m[1] : m[1] + "px");

    // ── 모서리 둥글기 ──
    for (const m of src.matchAll(/\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?(?:-([\w.]+|\[[^\]]+\]))?(?=["'\s`])/g)) add(radii, m[1] || "default");
    for (const m of src.matchAll(/borderRadius\s*:\s*["']?([\w.%]+)/g)) add(radii, "style:" + m[1]);

    // ── 인라인 스타일 ──
    const inl = (src.match(/style=\{\{/g) || []).length;
    inlineStyles += inl; fileStats.inline = inl;

    // ── 버튼 모양: <button className="..."> 의 시각 클래스 조합 ──
    for (const m of src.matchAll(/<button[^>]*?className=\{?[`"]([^`"]+)[`"]/g)) {
      const visual = m[1].split(/\s+/)
        .filter((c) => /^(bg-|text-(?!left|right|center)|rounded|border|px-|py-|font-|shadow)/.test(c))
        .sort().join(" ");
      if (visual) buttonShapes.add(visual);
    }

    perFile[f] = fileStats;
  }

  return {
    measuredAt: new Date().toISOString(),
    files: files.length,
    distinctColors: colors.size,
    gradients,
    shadows,
    fontSizeKinds: fontSizes.size,
    radiusKinds: radii.size,
    buttonShapeKinds: buttonShapes.size,
    inlineStyles,
    topColors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    fontSizes: [...fontSizes.entries()].sort((a, b) => b[1] - a[1]),
    radii: [...radii.entries()].sort((a, b) => b[1] - a[1]),
    worstFiles: Object.entries(perFile).sort((a, b) => (b[1].colors + b[1].inline) - (a[1].colors + a[1].inline)).slice(0, 15),
  };
}

const LABELS = [
  ["distinctColors", "서로 다른 색"],
  ["gradients", "그라데이션"],
  ["shadows", "그림자"],
  ["fontSizeKinds", "글자 크기 종류"],
  ["radiusKinds", "모서리 둥글기 종류"],
  ["buttonShapeKinds", "버튼 모양 종류"],
  ["inlineStyles", "페이지 안에 직접 쓴 스타일"],
];
export { LABELS };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = measure();
  const saveIdx = process.argv.indexOf("--save");
  if (saveIdx > -1) {
    const name = process.argv[saveIdx + 1] || "latest";
    mkdirSync(join(ROOT, "scripts/ds/metrics"), { recursive: true });
    writeFileSync(join(ROOT, `scripts/ds/metrics/${name}.json`), JSON.stringify(r, null, 2));
  }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(`측정 파일 ${r.files}개`);
  for (const [k, label] of LABELS) console.log(`${label.padEnd(16)} ${r[k]}`);
}
