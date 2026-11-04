#!/usr/bin/env node
/**
 * 디자인 시스템 정적 검사 — 기준 밖의 값을 화면 코드에서 찾아낸다.
 * 규칙의 뿌리: DESIGN.md · suta 금지선(github.com/Guksu/suta, MIT)
 *
 *   node scripts/ds/lint.mjs              # 오류·경고 목록. 오류가 있으면 exit 1 (경고는 통과)
 *   node scripts/ds/lint.mjs --file=diary # 그 경로가 들어간 파일만 출력
 *   node scripts/ds/lint.mjs --json       # JSON 출력
 *   node scripts/ds/lint.mjs --save       # scripts/ds/metrics/lint.json 저장 (exit 0)
 *
 * 등급
 *   error  기준 밖 값 — 고쳐야 배포한다 (CI 실패)
 *   warn   판단이 필요한 것 — 오류를 삼키는 catch, 말투 섞임, linear 이징
 *
 * 예외가 꼭 필요하면 그 줄 끝(또는 바로 윗줄)에  // ds-allow: 이유  를 적는다.
 * 예외도 기준 페이지(/design-system)에 개수와 함께 보인다.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN = ["src/app", "src/components"];
const EXCLUDE = [/^src\/app\/api\//, /^src\/app\/design-system\//, /opengraph|\/icon\.|manifest\.ts|sitemap\.ts|robots\.ts/];
const LEGAL = /\/(terms|privacy)\//; // 약관·개인정보는 합쇼체 허용

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTIL = "bg|text|border(?:-[trblxy])?|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|caret|decoration";
const OLD_TOKENS = "background|foreground|card|muted|border|primary|primary-light|primary-dark|accent|success|macro-protein|macro-carbs|macro-fat|macro-sodium|macro-protein-bg|macro-carbs-bg|macro-fat-bg|macro-sodium-bg";
// 색 수를 줄이며 지운 토큰 (2026-11): 상태 옅은 바탕·주의색·영양 옅은 바탕·끼니 색
const REMOVED_TOKENS = "positive-soft|caution|caution-soft|danger-soft|protein-soft|carbs-soft|fat-soft|sodium-soft|meal-breakfast|meal-lunch|meal-dinner|meal-snack";
const DURATIONS = new Set(["100", "150", "250", "350", "420"]);

// { id, level, message, re, scope?, skip?(match, line) }
const RULES = [
  // ── 색 ──
  { id: "hex-color", level: "error", message: "색을 직접 썼어요 → 디자인 토큰(text-ink, bg-surface 등)을 쓰세요",
    re: /(?<=["'`\s(:,\[])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
    skip: (_m, line) => /href=|url\(|https?:/.test(line) },
  { id: "rgb-color", level: "error", message: "rgb()/rgba() 색을 직접 썼어요 → 디자인 토큰을 쓰세요", re: /\brgba?\(\s*\d/g },
  { id: "tw-palette", level: "error", message: "Tailwind 기본 팔레트예요 (화면에 칠해지지 않아요) → 디자인 토큰을 쓰세요",
    re: new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:${UTIL})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, "g") },
  { id: "old-token", level: "error", message: "옛 토큰 이름이에요 → canvas/surface/sunken/line/ink/ink-2/brand 등 새 이름을 쓰세요",
    re: new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:${UTIL})-(?:${OLD_TOKENS})(?:\\/\\d+)?(?![\\w-])|var\\(--(?:${OLD_TOKENS}|color-(?:${OLD_TOKENS})|gold-glow|ring-start|ring-end|ring-track|persona-[a-z]+)\\)`, "g") },
  { id: "removed-token", level: "error", message: "색 수를 줄이며 지운 토큰이에요 → 상태는 글자색(positive·danger)·아이콘, 영양 바탕은 sunken, 끼니는 글자로",
    re: new RegExp(`(?<![\\w-])(?:[a-z]+:)*(?:${UTIL})-(?:${REMOVED_TOKENS})(?:\\/\\d+)?(?![\\w-])|var\\(--(?:ds|color)-(?:${REMOVED_TOKENS})\\)`, "g") },
  { id: "arbitrary-value", level: "error", message: "임의 값([...])으로 색·글자·둥글기·그림자를 정했어요 → 디자인 시스템 값을 쓰세요",
    re: /(?<![\w-])(?:[a-z]+:)*(?:text|bg|border(?:-[trblxy])?|ring|fill|stroke|shadow|rounded(?:-[trbl]{1,2})?|from|to|via|outline|decoration|font|leading|tracking|duration|ease|animate)-\[[^\]]+\]/g },
  // ── 글자·모양 ──
  { id: "font-size", level: "error", message: "Tailwind 기본 글자 크기예요 → text-caption / text-label / text-body / text-title / text-display",
    re: /(?<![\w-])(?:[a-z]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g },
  { id: "font-weight", level: "error", message: "쓰지 않는 굵기예요 → font-regular / font-medium / font-bold",
    re: /(?<![\w-])(?:[a-z]+:)*font-(?:thin|extralight|light|normal|semibold|extrabold|black)(?![\w-])/g },
  { id: "radius", level: "error", message: "쓰지 않는 둥글기예요 → rounded-sm / md / lg / xl / full",
    re: /(?<![\w-])(?:[a-z]+:)*rounded(?:-[trbl]{1,2})?(?:-(?:xs|2xl|3xl|4xl|none))?(?=["'`\s}])/g },
  { id: "shadow", level: "error", message: "그림자는 화면 위에 뜨는 것(시트·토스트·메뉴)에만 shadow-overlay 로 씁니다",
    re: /(?<![\w-])(?:[a-z]+:)*shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?=["'`\s}])|boxShadow\s*:/g },
  { id: "gradient", level: "error", message: "그라데이션은 쓰지 않아요 (장식은 형광펜 .highlight 하나)",
    re: /linear-gradient|radial-gradient|conic-gradient|(?<![\w-])bg-(?:gradient|linear|radial|conic)-/g },
  { id: "blur", level: "error", message: "흐림 장식은 쓰지 않아요",
    re: /(?<![\w-])(?:[a-z]+:)*(?:backdrop-)?blur(?:-\w+)?(?=["'`\s}])|backdropFilter/g },
  { id: "uppercase", level: "error", message: "대문자 라벨은 쓰지 않아요", re: /(?<![\w-])uppercase(?![\w-])|textTransform\s*:/g },
  { id: "inline-visual-style", level: "error", scope: "style",
    message: "style 로 색·글자·여백·테두리·움직임을 정했어요 → 클래스로. style 은 너비·위치·transform 같은 계산값에만",
    re: /\b(?:color|background(?:Color)?|border(?:Color|Radius|Top|Bottom|Left|Right)?|fontSize|fontWeight|fontFamily|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?|minHeight|minWidth|lineHeight|letterSpacing|opacity|transition(?:Property|Duration)?|animation)\s*:\s*[^,}]+/g },
  // ── 모션 (suta motion-audit) ──
  { id: "transition-all", level: "error", message: "transition-all 은 쓰지 않아요 → 움직일 속성을 이름으로 (transition-colors, press 등)",
    re: /(?<![\w-])(?:[a-z]+:)*transition-all(?![\w-])|transition\s*:\s*["']?all\b/g },
  { id: "animate-layout", level: "error", message: "크기·위치(width·height·top·margin)를 움직이지 않아요 → transform·opacity 만",
    re: /(?<![\w-])(?:[a-z]+:)*transition-\[(?:[^\]]*(?:width|height|top|left|right|bottom|margin|padding))[^\]]*\]/g },
  { id: "duration-scale", level: "error", message: "모션 시간은 100 / 150 / 250 / 350 / 420 다섯 단계만",
    re: /(?<![\w-])(?:[a-z]+:)*duration-(\d+)(?![\w-])/g, skip: (m) => DURATIONS.has(m[1]) },
  { id: "easing", level: "error", message: "쓰지 않는 이징이에요 → ease-out / ease-drawer / ease-inout / ease-overshoot",
    re: /(?<![\w-])(?:[a-z]+:)*ease-(?:in|in-out)(?![\w-])/g },
  { id: "ease-linear", level: "warn", message: "linear 는 진행률·스피너처럼 시간에 비례하는 것에만",
    re: /(?<![\w-])(?:[a-z]+:)*ease-linear(?![\w-])/g },
  // ── 아이콘·대화상자 ──
  { id: "emoji", level: "error", message: "이모지를 아이콘처럼 썼어요 → <Icon> 이나 글자로 바꾸세요",
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}-\u{21FF}\u{1F000}-\u{1F2FF}]️?/gu },
  { id: "native-dialog", level: "error", message: "alert/confirm 대신 useToast / ConfirmSheet 를 쓰세요",
    re: /(?<![\w.])(?:window\.)?(?:alert|confirm)\(/g },
  // ── 문구 (suta copy) ──
  { id: "meta-copy", level: "error", message: "개발·데모용 문구가 화면에 남았어요 → 사용자가 볼 문구만",
    re: /\((?:데모|테스트|샘플)\)|테스트 계정|예시 데이터|가상의 (?:데이터|예시)|Lorem ipsum|미리보기:/gi },
  // ── 상태 (hallmark: 데이터 영역은 로딩·비어 있음·오류·채워짐 4가지) ──
  { id: "silent-catch", level: "warn", message: "오류를 조용히 삼켜요 → 실패했다는 걸 보여 주세요 (useToast tone=danger 또는 오류 상태)",
    re: /catch\s*(?:\(\s*\w*\s*\))?\s*\{\s*\}|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(?:\{\s*\}|null|undefined)\s*\)/g },
];

// 말투 섞임 — 파일 단위 (해요체 하나, 약관·법적 고지만 합쇼체)
const FORMAL = /(?:습니다|습니까|십시오|입니다|됩니다)[.!?]?\s*$/;
const CASUAL = /(?:요)[.!?]?\s*$/;

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
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length));
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

/** 화면에 보이는 짧은 한국어 문구: JSX 텍스트 + 문자열 리터럴 */
function uiStrings(src) {
  const out = [];
  const push = (text, idx) => { const t = text.trim(); if (/[가-힣]/.test(t) && t.length <= 80) out.push({ t, idx }); };
  for (const m of src.matchAll(/>([^<>{}\n]+)</g)) push(m[1], m.index);
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\\\n]){2,80})\1/g)) push(m[2], m.index);
  return out;
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
    const record = (rule, idx, match) => {
      const line = lineOf(idx);
      const text = rawLines[line - 1] || "";
      const allowHere = /ds-allow/.test(text) || /ds-allow/.test(rawLines[line - 2] || "");
      const item = { file: f, line, rule: rule.id, level: rule.level, message: rule.message, match: String(match).slice(0, 60), snippet: text.trim().slice(0, 140) };
      (allowHere ? allowed : violations).push(item);
    };

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of src.matchAll(rule.re)) {
        if (rule.scope === "style" && !inStyle(m.index)) continue;
        if (rule.skip && rule.skip(m, rawLines[lineOf(m.index) - 1] || "")) continue;
        record(rule, m.index, m[0]);
      }
    }

    // 말투 섞임
    if (!LEGAL.test(f)) {
      const strs = uiStrings(src);
      const formal = strs.filter((s) => FORMAL.test(s.t));
      const casual = strs.filter((s) => CASUAL.test(s.t));
      if (formal.length && casual.length) {
        for (const s of formal) record({ id: "mixed-tone", level: "warn", message: `해요체와 합쇼체가 섞였어요 (해요체 ${casual.length} · 합쇼체 ${formal.length}) → 해요체 하나로` }, s.idx, s.t);
      }
    }
  }

  const count = (list, pred) => list.filter(pred).length;
  const errors = violations.filter((v) => v.level === "error");
  const warns = violations.filter((v) => v.level === "warn");
  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  const byFile = {};
  for (const v of errors) byFile[v.file] = (byFile[v.file] || 0) + 1;
  const ruleList = [...RULES, { id: "mixed-tone", level: "warn", message: "해요체와 합쇼체가 섞였어요 → 해요체 하나로 (약관만 합쇼체)" }];

  return {
    checkedAt: new Date().toISOString(),
    files: files.length,
    total: errors.length,
    warnTotal: warns.length,
    allowedCount: allowed.length,
    rules: ruleList.map((r) => ({ id: r.id, level: r.level, message: r.message, count: byRule[r.id] || 0 })),
    byFile: Object.entries(byFile).sort((a, b) => b[1] - a[1]),
    warnByFile: Object.entries(warns.reduce((m, v) => ((m[v.file] = (m[v.file] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]),
    violations: [...errors, ...warns],
    allowed,
    _count: count,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = lint();
  delete r._count;
  if (process.argv.includes("--save")) {
    mkdirSync(join(ROOT, "scripts/ds/metrics"), { recursive: true });
    const slim = { ...r, violations: r.violations.slice(0, 400) };
    writeFileSync(join(ROOT, "scripts/ds/metrics/lint.json"), JSON.stringify(slim, null, 2));
    console.log(`[ds:lint] 오류 ${r.total}건 · 경고 ${r.warnTotal}건 · 예외 ${r.allowedCount}건 (저장함)`);
    process.exit(0);
  }
  if (process.argv.includes("--json")) { process.stdout.write(JSON.stringify(r, null, 2) + "\n"); process.exitCode = r.total ? 1 : 0; }
  else {
    const fileArg = process.argv.find((a) => a.startsWith("--file="));
    const onlyErrors = process.argv.includes("--errors");
    const list = r.violations
      .filter((v) => !fileArg || v.file.includes(fileArg.slice(7)))
      .filter((v) => !onlyErrors || v.level === "error");
    for (const v of list) console.log(`${v.level === "error" ? "오류" : "경고"} ${v.file}:${v.line}  [${v.rule}] ${v.match}\n    ${v.message}`);
    console.log(`\n[ds:lint] 파일 ${r.files}개 · 오류 ${r.total}건 · 경고 ${r.warnTotal}건 · 예외(ds-allow) ${r.allowedCount}건`);
    for (const x of r.rules.filter((x) => x.count)) console.log(`  ${(x.level === "error" ? "오류" : "경고")} ${x.id.padEnd(20)} ${x.count}`);
    process.exitCode = r.total ? 1 : 0;
  }
}
