#!/usr/bin/env node
/**
 * 디자인 시스템 정적 검사 — 기준 밖의 값을 화면 코드에서 찾아낸다.
 *
 *   node scripts/ds/lint.mjs              # 위반 목록 출력, 위반 있으면 exit 1
 *   node scripts/ds/lint.mjs --json       # JSON 출력
 *   node scripts/ds/lint.mjs --save       # scripts/ds/metrics/lint.json 저장 (exit 0)
 *
 * 예외가 꼭 필요하면 그 줄 끝(또는 바로 윗줄)에  // ds-allow: 이유  를 적는다.
 * 예외도 기준 페이지에 개수로 보고된다.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN = ["src/app", "src/components"];
const EXCLUDE = [/^src\/app\/api\//, /^src\/app\/design-system\//, /opengraph|\/icon\.|manifest\.ts|sitemap\.ts|robots\.ts/];

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTIL = "bg|text|border(?:-[trblxy])?|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|caret|decoration";
const OLD_TOKENS = "background|foreground|card|muted|border|primary|primary-light|primary-dark|accent|success|macro-protein|macro-carbs|macro-fat|macro-sodium|macro-protein-bg|macro-carbs-bg|macro-fat-bg|macro-sodium-bg";

// [id, 설명, 정규식, 줄 단위 검사 여부]
const RULES = [
  ["hex-color", "색을 직접 썼어요 → 디자인 토큰(text-ink, bg-surface 등)을 쓰세요",
    /(?<=["'`\s(:,\[])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g],
  ["rgb-color", "rgb()/rgba() 색을 직접 썼어요 → 디자인 토큰을 쓰세요",
    /\brgba?\(\s*\d/g],
  ["tw-palette", "Tailwind 기본 팔레트예요 (화면에 칠해지지 않아요) → 디자인 토큰을 쓰세요",
    new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:${UTIL})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, "g")],
  ["old-token", "옛 토큰 이름이에요 → canvas/surface/sunken/line/ink/ink-2/brand 등 새 이름을 쓰세요",
    new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:${UTIL})-(?:${OLD_TOKENS})(?:\\/\\d+)?(?![\\w-])|var\\(--(?:${OLD_TOKENS}|color-(?:${OLD_TOKENS})|gold-glow|ring-start|ring-end|ring-track|persona-[a-z]+)\\)`, "g")],
  ["arbitrary-value", "임의 값([...])으로 색·글자·둥글기·그림자를 정했어요 → 디자인 시스템 값을 쓰세요",
    /(?<![\w-])(?:[a-z]+:)*(?:text|bg|border(?:-[trblxy])?|ring|fill|stroke|shadow|rounded(?:-[trbl]{1,2})?|from|to|via|outline|decoration|font|leading|tracking)-\[[^\]]+\]/g],
  ["font-size", "Tailwind 기본 글자 크기예요 → text-caption / text-label / text-body / text-title / text-display",
    /(?<![\w-])(?:[a-z]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g],
  ["font-weight", "쓰지 않는 굵기예요 → font-regular / font-medium / font-bold",
    /(?<![\w-])(?:[a-z]+:)*font-(?:thin|extralight|light|normal|semibold|extrabold|black)(?![\w-])/g],
  ["radius", "쓰지 않는 둥글기예요 → rounded-sm / md / lg / xl / full",
    /(?<![\w-])(?:[a-z]+:)*rounded(?:-[trbl]{1,2})?(?:-(?:xs|2xl|3xl|4xl|none))?(?=["'`\s}])/g],
  ["shadow", "그림자는 화면 위에 뜨는 것(시트·토스트)에만 shadow-overlay 로 씁니다",
    /(?<![\w-])(?:[a-z]+:)*shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?=["'`\s}])|boxShadow\s*:/g],
  ["gradient", "그라데이션은 쓰지 않아요 (장식은 형광펜 .highlight 하나)",
    /linear-gradient|radial-gradient|conic-gradient|(?<![\w-])bg-(?:gradient|linear|radial|conic)-/g],
  ["blur", "흐림 장식은 쓰지 않아요",
    /(?<![\w-])(?:[a-z]+:)*(?:backdrop-)?blur(?:-\w+)?(?=["'`\s}])|backdropFilter/g],
  ["uppercase", "대문자 라벨은 쓰지 않아요",
    /(?<![\w-])uppercase(?![\w-])|textTransform\s*:/g],
  ["inline-visual-style", "style 로 색·글자·여백·테두리를 정했어요 → 클래스(디자인 토큰)로 옮기세요. style 은 너비·위치 같은 계산값에만",
    /\b(?:color|background(?:Color)?|border(?:Color|Radius|Top|Bottom|Left|Right)?|fontSize|fontWeight|fontFamily|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?|minHeight|minWidth|lineHeight|letterSpacing|opacity)\s*:\s*[^,}]+/g, "style"],
  ["emoji", "이모지를 아이콘처럼 썼어요 → <Icon> 이나 글자로 바꾸세요",
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}-\u{21FF}\u{1F000}-\u{1F2FF}]️?/gu],
  ["native-dialog", "alert/confirm 대신 useToast / ConfirmSheet 를 쓰세요",
    /(?<![\w.])(?:window\.)?(?:alert|confirm)\(/g],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** 주석 제거 (줄 수는 유지) */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/** style={{ ... }} 블록 범위 */
function styleRanges(src) {
  const ranges = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 2, i = m.index + m[0].length;
    while (i < src.length && depth > 0) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    ranges.push([m.index, i]);
  }
  return ranges;
}

export function lint() {
  const files = SCAN.flatMap((d) => walk(join(ROOT, d)))
    .map((p) => relative(ROOT, p).replaceAll("\\", "/"))
    .filter((p) => !EXCLUDE.some((re) => re.test(p)));

  const violations = [];
  const allowed = [];

  for (const f of files) {
    const raw = readFileSync(join(ROOT, f), "utf8");
    const src = stripComments(raw);
    const rawLines = raw.split("\n");
    const lineOf = (idx) => src.slice(0, idx).split("\n").length;
    const styles = styleRanges(src);
    const inStyle = (idx) => styles.some(([a, b]) => idx >= a && idx < b);

    for (const [id, msg, re, scope] of RULES) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) {
        if (scope === "style" && !inStyle(m.index)) continue;
        // import 경로·URL 안의 # 은 제외
        const line = lineOf(m.index);
        const text = rawLines[line - 1] || "";
        if (id === "hex-color" && /href=|url\(|https?:/.test(text)) continue;
        const allowHere = /ds-allow/.test(text) || /ds-allow/.test(rawLines[line - 2] || "");
        const item = { file: f, line, rule: id, message: msg, match: m[0].slice(0, 60), snippet: text.trim().slice(0, 140) };
        (allowHere ? allowed : violations).push(item);
      }
    }
  }

  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  const byFile = {};
  for (const v of violations) byFile[v.file] = (byFile[v.file] || 0) + 1;

  return {
    checkedAt: new Date().toISOString(),
    files: files.length,
    total: violations.length,
    allowedCount: allowed.length,
    rules: RULES.map(([id, msg]) => ({ id, message: msg, count: byRule[id] || 0 })),
    byFile: Object.entries(byFile).sort((a, b) => b[1] - a[1]),
    violations,
    allowed,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = lint();
  if (process.argv.includes("--save")) {
    mkdirSync(join(ROOT, "scripts/ds/metrics"), { recursive: true });
    const slim = { ...r, violations: r.violations.slice(0, 400) };
    writeFileSync(join(ROOT, "scripts/ds/metrics/lint.json"), JSON.stringify(slim, null, 2));
    console.log(`[ds:lint] 위반 ${r.total}건 · 예외 ${r.allowedCount}건 (저장함)`);
    process.exit(0);
  }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(r.total ? 1 : 0); }
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const list = fileArg ? r.violations.filter((v) => v.file.includes(fileArg.slice(7))) : r.violations;
  for (const v of list) console.log(`${v.file}:${v.line}  [${v.rule}] ${v.match}\n    ${v.message}`);
  console.log(`\n[ds:lint] 파일 ${r.files}개 · 위반 ${r.total}건 · 예외(ds-allow) ${r.allowedCount}건`);
  for (const x of r.rules.filter((x) => x.count)) console.log(`  ${x.id.padEnd(20)} ${x.count}`);
  process.exit(r.total ? 1 : 0);
}
